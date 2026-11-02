'use strict';

const { Rivalry, User } = require('../models');
const { conflict, forbidden, notFound, unprocessable } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');
const { userResolver } = require('./dto');
const statsEngine = require('./statsEngine');
const { headToHead, autoRivalries } = require('./headToHead');
const notificationService = require('./notificationService');

const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

async function resolver(group, ids) {
  const { activeMap } = require('./nicknameService');
  return userResolver(ids, await activeMap(group._id));
}

async function rowsOf(group) {
  const { matches, ratings } = await statsEngine.loadPlayed(group._id);
  return statsEngine.playerRows(matches, ratings);
}

function rivalryDto(r, resolve, viewerId) {
  return {
    id: String(r._id),
    users: r.users.map((u) => resolve(u)),
    status: r.status,
    proposedBy: resolve(r.createdBy),
    awaitingMe: r.status === 'proposta' && !sameId(r.createdBy, viewerId) && r.users.some((u) => sameId(u, viewerId)),
    createdAt: r.createdAt,
  };
}

/** Rivalità del gruppo: quelle scelte (attive o proposte a me) e quelle "naturali" dai dati. */
async function list(group, viewer) {
  const memberIds = group.members.map((m) => String(m.user));
  const rows = await rowsOf(group);
  const auto = autoRivalries(rows, memberIds, { limit: 6 });
  const chosen = await Rivalry.find({
    group: group._id,
    $or: [{ status: 'attiva' }, { status: 'proposta', users: viewer._id }],
  })
    .sort({ updatedAt: -1 })
    .lean();
  const resolve = await resolver(group, [...memberIds, ...chosen.flatMap((r) => [...r.users, r.createdBy])]);
  return {
    chosen: chosen.map((r) => {
      const [a, b] = r.users.map(String);
      return { ...rivalryDto(r, resolve, viewer._id), summary: headToHead(rows, a, b).opposed };
    }),
    auto: auto.map((h) => ({ users: h.users.map(resolve), opposed: h.opposed, streak: h.streak })),
  };
}

/** Schermata VS tra due membri del gruppo. */
async function detail(group, a, b) {
  for (const id of [a, b]) if (!group.members.some((m) => sameId(m.user, id))) throw notFound('Uno dei due giocatori non fa parte del gruppo.');
  if (sameId(a, b)) throw unprocessable('Scegli due giocatori diversi.');
  const rows = await rowsOf(group);
  const h = headToHead(rows, String(a), String(b));
  const resolve = await resolver(group, [a, b]);
  const chosen = await Rivalry.findOne({ group: group._id, pairKey: pairKey(a, b) }).lean();
  return {
    a: resolve(a),
    b: resolve(b),
    ...h,
    streak: h.streak ? { ...h.streak, user: resolve(h.streak.user) } : null,
    rivalry: chosen ? { id: String(chosen._id), status: chosen.status } : null,
  };
}

async function propose(group, user, targetId) {
  if (sameId(user._id, targetId)) throw unprocessable('Non puoi sfidare te stesso.', { targetUserId: 'Scegli un compagno.' });
  if (!group.members.some((m) => sameId(m.user, targetId))) throw unprocessable('Si sfidano solo i membri del gruppo.', { targetUserId: 'Non è nel gruppo.' });
  const key = pairKey(user._id, targetId);
  const existing = await Rivalry.findOne({ group: group._id, pairKey: key });
  if (existing && existing.status !== 'rifiutata') throw conflict(existing.status === 'attiva' ? 'Questa rivalità esiste già.' : 'La sfida è già in attesa di risposta.');
  const doc = existing
    ? await Rivalry.findOneAndUpdate({ _id: existing._id, status: 'rifiutata' }, { $set: { status: 'proposta', createdBy: user._id } }, { new: true })
    : await Rivalry.create({ group: group._id, users: [user._id, targetId], pairKey: key, createdBy: user._id });
  if (!doc) throw conflict('La sfida è cambiata nel frattempo: riprova.');
  await notificationService.notify([targetId], {
    type: 'rivalita',
    title: `${user.name} ti propone una rivalità`,
    body: 'Accetti? Vedrete i vostri scontri diretti in una schermata dedicata. Puoi anche rifiutare.',
    link: `/gruppi/${group._id}/rivalita`,
    group: group._id,
    dedupeKey: `rivalita:${doc._id}:${doc.updatedAt.getTime()}`,
  });
  const resolve = await resolver(group, [...doc.users, doc.createdBy]);
  return rivalryDto(doc.toObject(), resolve, user._id);
}

async function load(rivalryId, user) {
  const r = await Rivalry.findById(rivalryId);
  if (!r) throw notFound('Rivalità non trovata.');
  if (!r.users.some((u) => sameId(u, user._id))) throw forbidden('Questa rivalità non ti riguarda.');
  return r;
}

async function respond(rivalryId, user, accept) {
  const r = await load(rivalryId, user);
  if (sameId(r.createdBy, user._id)) throw forbidden("Può rispondere solo chi è stato sfidato.");
  const updated = await Rivalry.findOneAndUpdate({ _id: r._id, status: 'proposta' }, { $set: { status: accept ? 'attiva' : 'rifiutata' } }, { new: true });
  if (!updated) throw conflict('La sfida non è più in attesa.');
  if (accept) {
    const me = await User.findById(user._id).lean();
    await notificationService.notify([String(r.createdBy)], {
      type: 'rivalita',
      title: `${me.name} ha accettato la rivalità`,
      body: 'Da ora i vostri scontri diretti hanno una schermata tutta loro.',
      link: `/gruppi/${r.group}/rivalita`,
      group: r.group,
    });
  }
  return { id: String(updated._id), status: updated.status };
}

/** Ognuno dei due può chiudere la rivalità in qualsiasi momento. */
async function end(rivalryId, user) {
  const r = await load(rivalryId, user);
  await Rivalry.deleteOne({ _id: r._id });
}

module.exports = { list, detail, propose, respond, end };
