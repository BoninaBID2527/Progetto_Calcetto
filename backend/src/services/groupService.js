'use strict';

const { Group, User, Match } = require('../models');
const { conflict, notFound, unprocessable } = require('../utils/AppError');
const { generateInviteCode, sameId } = require('../utils/helpers');
const { appConfig } = require('../config/appConfig');
const { publicUser } = require('./dto');
const nicknameService = require('./nicknameService');
const chatService = require('./chatService');
const realtime = require('./realtime');
const activityService = require('./activityService');

function summary(group, userId, extra = {}) {
  const me = group.members.find((m) => sameId(m.user, userId));
  return {
    id: String(group._id),
    name: group.name,
    description: group.description,
    emoji: group.emoji,
    color: group.color,
    inviteCode: group.inviteCode,
    memberCount: group.members.length,
    myRole: me ? me.role : null,
    settings: {
      organizers: group.settings.organizers,
      minMatchesForRanking: group.settings.minMatchesForRanking,
      loserPaysFirstRound: group.settings.loserPaysFirstRound,
      extraPrizeOptions: group.settings.extraPrizeOptions.map((o) => ({ key: o.key, label: o.label, emoji: o.emoji })),
    },
    createdAt: group.createdAt,
    ...extra,
  };
}

async function withUniqueCode(fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await fn(generateInviteCode());
    } catch (err) {
      if (err.code !== 11000 || !String(err.message).includes('inviteCode')) throw err;
    }
  }
  throw conflict('Non sono riuscito a generare un codice unico, riprova.');
}

async function create(user, data) {
  const group = await withUniqueCode((inviteCode) =>
    Group.create({
      ...data,
      inviteCode,
      createdBy: user._id,
      members: [{ user: user._id, role: 'admin', joinedAt: new Date(), lastReadAt: new Date() }],
    })
  );
  realtime.joinGroupRoom(user._id, group._id);
  return summary(group, user._id, { unreadCount: 0 });
}

async function listMine(user) {
  const groups = await Group.find({ 'members.user': user._id }).sort({ createdAt: 1 });
  return Promise.all(
    groups.map(async (g) => {
      const me = g.members.find((m) => sameId(m.user, user._id));
      return summary(g, user._id, { unreadCount: await chatService.unreadCount(g._id, user._id, me.lastReadAt) });
    })
  );
}

async function previewByCode(user, code) {
  const group = await Group.findOne({ inviteCode: code.toUpperCase() });
  if (!group) throw notFound('Codice invito non valido o scaduto.');
  return {
    name: group.name,
    description: group.description,
    emoji: group.emoji,
    color: group.color,
    memberCount: group.members.length,
    alreadyMember: group.members.some((m) => sameId(m.user, user._id)),
    groupId: group.members.some((m) => sameId(m.user, user._id)) ? String(group._id) : null,
  };
}

async function join(user, code) {
  const group = await Group.findOne({ inviteCode: code.toUpperCase() });
  if (!group) throw notFound('Codice invito non valido o scaduto.');
  const now = new Date();
  const updated = await Group.findOneAndUpdate(
    { _id: group._id, 'members.user': { $ne: user._id } },
    { $push: { members: { user: user._id, role: 'member', joinedAt: now, lastReadAt: now } } },
    { new: true }
  );
  if (!updated) throw conflict('Fai già parte di questo gruppo.');
  realtime.joinGroupRoom(user._id, group._id);
  await chatService.postSystem(group._id, `${user.name} si unisce al gruppo. Benvenuto in squadra!`);
  // Il messaggio sul proprio ingresso non deve risultare "non letto".
  await chatService.markRead(updated, user);
  await activityService.record(group._id, 'membro_entrato', { actor: user._id });
  realtime.toGroup(group._id, 'group:updated', { groupId: String(group._id), part: 'members' });
  return summary(updated, user._id, { unreadCount: 0 });
}

async function update(group, user, data) {
  const { settings, ...rest } = data;
  group.set(rest);
  if (settings) {
    const { extraPrizeOptions, ...otherSettings } = settings;
    for (const [k, v] of Object.entries(otherSettings)) group.settings[k] = v;
    if (extraPrizeOptions) {
      const baseKeys = appConfig.prizeOptions.map((p) => p.key);
      group.settings.extraPrizeOptions = extraPrizeOptions.map((o, i) => {
        const slug = o.label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const key = `extra-${slug || i}`;
        if (baseKeys.includes(key)) throw unprocessable('Opzione duplicata.', { extraPrizeOptions: 'Esiste già.' });
        return { key, label: o.label, emoji: o.emoji };
      });
      const keys = group.settings.extraPrizeOptions.map((o) => o.key);
      if (new Set(keys).size !== keys.length) {
        throw unprocessable('Due opzioni del premio hanno lo stesso nome.', { extraPrizeOptions: 'Nomi duplicati.' });
      }
    }
  }
  await group.save();
  realtime.toGroup(group._id, 'group:updated', { groupId: String(group._id), part: 'settings' });
  return summary(group, user._id);
}

async function regenerateCode(group, user) {
  const updated = await withUniqueCode((inviteCode) =>
    Group.findByIdAndUpdate(group._id, { $set: { inviteCode } }, { new: true })
  );
  realtime.toGroup(group._id, 'group:updated', { groupId: String(group._id), part: 'settings' });
  return summary(updated, user._id);
}

async function members(group) {
  const nicknames = await nicknameService.activeMap(group._id);
  const users = await User.find({ _id: { $in: group.members.map((m) => m.user) } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return group.members
    .filter((m) => byId.has(String(m.user)))
    .map((m) => {
      const u = byId.get(String(m.user));
      // Le email sono visibili solo a chi è nel gruppo: questa rotta è già protetta.
      return { user: { ...publicUser(u, nicknames.get(String(u._id)) || null), email: u.email }, role: m.role, joinedAt: m.joinedAt };
    });
}

async function setRole(group, targetId, role) {
  const member = group.members.find((m) => sameId(m.user, targetId));
  if (!member) throw notFound('Questa persona non fa parte del gruppo.');
  if (member.role === role) return members(group);
  if (role === 'member') {
    const admins = group.members.filter((m) => m.role === 'admin');
    if (admins.length === 1) throw conflict("Il gruppo deve avere almeno un admin: nominane un altro prima.");
  }
  await Group.updateOne({ _id: group._id }, { $set: { 'members.$[t].role': role } }, { arrayFilters: [{ 't.user': member.user }] });
  const fresh = await Group.findById(group._id);
  realtime.toGroup(group._id, 'group:updated', { groupId: String(group._id), part: 'members' });
  return members(fresh);
}

async function removeMember(group, actor, targetId) {
  const member = group.members.find((m) => sameId(m.user, targetId));
  if (!member) throw notFound('Questa persona non fa parte del gruppo.');
  const admins = group.members.filter((m) => m.role === 'admin');
  if (member.role === 'admin' && admins.length === 1 && group.members.length > 1) {
    throw conflict("Sei l'unico admin: nomina un altro admin prima di uscire.");
  }
  await Group.updateOne({ _id: group._id }, { $pull: { members: { user: member.user } } });
  const target = await User.findById(member.user).lean();
  const leaving = sameId(actor._id, member.user);
  if (target) {
    await chatService.postSystem(group._id, leaving ? `${target.name} ha lasciato il gruppo.` : `${target.name} non fa più parte del gruppo.`);
  }
  realtime.toGroup(group._id, 'group:updated', { groupId: String(group._id), part: 'members' });
  realtime.toUser(member.user, 'group:removed', { groupId: String(group._id) });
  realtime.leaveGroupRoom(member.user, group._id);
}

/** Quante volte ha vinto ogni premio del terzo tempo nelle partite del gruppo. */
async function prizeStats(group) {
  const matches = await Match.find({ group: group._id, 'prizePoll.closed': true }).select('prizePoll').lean();
  const known = [...appConfig.prizeOptions, ...group.settings.extraPrizeOptions];
  const counts = new Map(known.map((o) => [o.key, { key: o.key, label: o.label, emoji: o.emoji, count: 0 }]));
  for (const m of matches) {
    for (const key of m.prizePoll.winners || []) {
      if (!counts.has(key)) {
        const option = (m.prizePoll.options || []).find((o) => o.key === key) || { key, label: key, emoji: '🏆' };
        counts.set(key, { key, label: option.label, emoji: option.emoji, count: 0 });
      }
      counts.get(key).count += 1;
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

module.exports = { summary, create, listMine, previewByCode, join, update, regenerateCode, members, setRole, removeMember, prizeStats };
