'use strict';

const { Nickname } = require('../models');
const { forbidden, notFound, unprocessable, conflict } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');
const { userResolver } = require('./dto');
const notificationService = require('./notificationService');
const chatService = require('./chatService');
const realtime = require('./realtime');

/** Mappa id utente -> soprannome attivo nel gruppo. */
async function activeMap(groupId) {
  const items = await Nickname.find({ group: groupId, status: 'attivo' }).sort({ createdAt: 1 }).lean();
  return new Map(items.map((n) => [String(n.target), n.text]));
}

async function toDtos(items) {
  const resolve = await userResolver(items.flatMap((n) => [n.target, n.proposer, n.decidedBy]));
  return items.map((n) => ({
    id: String(n._id),
    text: n.text,
    status: n.status,
    target: resolve(n.target),
    proposer: resolve(n.proposer),
    decidedBy: resolve(n.decidedBy),
    decidedAt: n.decidedAt,
    createdAt: n.createdAt,
  }));
}

async function list(group, { targetId } = {}) {
  const filter = { group: group._id, ...(targetId ? { target: targetId } : {}) };
  const items = await Nickname.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  return toDtos(items);
}

function broadcast(group) {
  realtime.toGroup(group._id, 'group:updated', { groupId: String(group._id), part: 'nicknames' });
}

async function create(group, proposer, targetId, text) {
  const target = group.members.find((m) => sameId(m.user, targetId));
  if (!target) throw unprocessable('Puoi dare un soprannome solo a chi fa parte del gruppo.', { targetUserId: 'Non è un membro del gruppo.' });
  await Nickname.updateMany(
    { group: group._id, target: targetId, status: 'attivo' },
    { $set: { status: 'sostituito', decidedBy: proposer._id, decidedAt: new Date() } }
  );
  const nickname = await Nickname.create({ group: group._id, target: targetId, proposer: proposer._id, text });
  return nickname;
}

async function propose(group, proposer, targetId, text) {
  const nickname = await create(group, proposer, targetId, text);
  const [dto] = await toDtos([nickname.toObject()]);
  if (!sameId(proposer._id, targetId)) {
    await notificationService.notify([targetId], {
      type: 'soprannome',
      title: `Hai un nuovo soprannome: «${text}»`,
      body: `Te l'ha dato ${proposer.name}. Puoi tenerlo, sostituirlo o rifiutarlo.`,
      link: `/gruppi/${group._id}/membri`,
      group: group._id,
    });
    await chatService.postSystem(group._id, `Da oggi ${dto.target.name} è «${text}» (proposto da ${proposer.name}).`);
  }
  broadcast(group);
  return dto;
}

async function findActive(group, nicknameId) {
  const nickname = await Nickname.findOne({ _id: nicknameId, group: group._id });
  if (!nickname) throw notFound('Soprannome non trovato.');
  if (nickname.status !== 'attivo') throw conflict('Questo soprannome non è più attivo.');
  return nickname;
}

async function reject(group, user, nicknameId) {
  const nickname = await findActive(group, nicknameId);
  if (!sameId(nickname.target, user._id)) throw forbidden('Solo chi riceve il soprannome può rifiutarlo.');
  nickname.set({ status: 'rifiutato', decidedBy: user._id, decidedAt: new Date() });
  await nickname.save();
  broadcast(group);
  return (await toDtos([nickname.toObject()]))[0];
}

async function replace(group, user, nicknameId, text) {
  const nickname = await findActive(group, nicknameId);
  if (!sameId(nickname.target, user._id)) throw forbidden('Solo chi riceve il soprannome può sostituirlo.');
  const created = await create(group, user, user._id, text);
  broadcast(group);
  return (await toDtos([created.toObject()]))[0];
}

async function remove(group, admin, nicknameId) {
  const nickname = await findActive(group, nicknameId);
  nickname.set({ status: 'rimosso', decidedBy: admin._id, decidedAt: new Date() });
  await nickname.save();
  broadcast(group);
  return (await toDtos([nickname.toObject()]))[0];
}

module.exports = { activeMap, list, propose, reject, replace, remove };
