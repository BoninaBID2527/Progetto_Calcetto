'use strict';

const { Activity, Match } = require('../models');
const { userResolver } = require('./dto');
const realtime = require('./realtime');

async function toDtos(groupId, items) {
  const { activeMap } = require('./nicknameService');
  const resolve = await userResolver(items.flatMap((a) => [a.actor, a.target]), await activeMap(groupId));
  const matchIds = [...new Set(items.map((a) => a.match).filter(Boolean).map(String))];
  const matches = matchIds.length ? await Match.find({ _id: { $in: matchIds } }).select('field startsAt status').lean() : [];
  const byId = new Map(matches.map((m) => [String(m._id), { id: String(m._id), field: m.field, startsAt: m.startsAt, status: m.status }]));
  return items.map((a) => ({
    id: String(a._id),
    type: a.type,
    actor: a.actor ? resolve(a.actor) : null,
    target: a.target ? resolve(a.target) : null,
    match: a.match ? byId.get(String(a.match)) || { id: String(a.match) } : null,
    pollId: a.poll ? String(a.poll) : null,
    data: a.data || {},
    createdAt: a.createdAt,
  }));
}

/**
 * Registra un'attività del gruppo e la trasmette. Con `key` la registrazione
 * è idempotente: la stessa chiave non crea mai due voci.
 */
async function record(groupId, type, { actor = null, target = null, match = null, poll = null, data = {}, key, createdAt } = {}) {
  let doc;
  try {
    doc = await Activity.create({ group: groupId, type, actor, target, match, poll, data, key, ...(createdAt ? { createdAt, updatedAt: createdAt } : {}) });
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
  const [dto] = await toDtos(groupId, [doc.toObject()]);
  realtime.toGroup(groupId, 'activity:new', dto);
  return dto;
}

async function list(groupId, { before, limit = 20 } = {}) {
  const filter = { group: groupId, ...(before ? { _id: { $lt: before } } : {}) };
  const items = await Activity.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  return { items: await toDtos(groupId, items.slice(0, limit)), hasMore: items.length > limit };
}

module.exports = { record, list };
