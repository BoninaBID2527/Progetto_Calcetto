'use strict';

/*
 * Stagioni del gruppo. Una stagione è solo una finestra temporale sulle
 * partite: nessuna statistica viene mai cancellata o spostata, quindi si
 * possono rivedere tutte le stagioni passate e cambiare modalità quando si vuole.
 * Modalità: annuale (default, dal mese di inizio), trimestrale, mensile,
 * personalizzata (stagioni create dall'admin).
 */
const { Season, Match } = require('../models');
const { notFound, unprocessable } = require('../utils/AppError');

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function settingsOf(group) {
  return { mode: group?.settings?.season?.mode || 'annuale', startMonth: group?.settings?.season?.startMonth || 9 };
}

/** Stagione che contiene `date` (per la modalità personalizzata serve `customSeasons`). */
function seasonAt(group, date = new Date(), customSeasons = []) {
  const { mode, startMonth } = settingsOf(group);
  const d = new Date(date);
  if (mode === 'personalizzata') {
    const s = customSeasons.find((c) => d >= new Date(c.startsAt) && d < new Date(c.endsAt));
    return s ? { key: String(s._id), label: s.name, start: new Date(s.startsAt), end: new Date(s.endsAt) } : null;
  }
  if (mode === 'mensile') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    return { key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`, start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
  }
  if (mode === 'trimestrale') {
    const q = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), q * 3, 1);
    return { key: `${start.getFullYear()}-T${q + 1}`, label: `${q + 1}° trimestre ${start.getFullYear()}`, start, end: new Date(start.getFullYear(), q * 3 + 3, 1) };
  }
  const m = startMonth - 1;
  const year = d.getMonth() >= m ? d.getFullYear() : d.getFullYear() - 1;
  const start = new Date(year, m, 1);
  const label = m === 0 ? `Stagione ${year}` : `Stagione ${year}/${String((year + 1) % 100).padStart(2, '0')}`;
  return { key: m === 0 ? `${year}` : `${year}-${String((year + 1) % 100).padStart(2, '0')}`, label, start, end: new Date(year + 1, m, 1) };
}

function previousSeason(group, date = new Date(), customSeasons = []) {
  if (settingsOf(group).mode === 'personalizzata') {
    const sorted = [...customSeasons].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    const before = sorted.filter((s) => new Date(s.endsAt) <= new Date(date)).pop();
    return before ? { key: String(before._id), label: before.name, start: new Date(before.startsAt), end: new Date(before.endsAt) } : null;
  }
  const current = seasonAt(group, date);
  return seasonAt(group, new Date(current.start.getTime() - 86_400_000));
}

const customFor = (group) => (settingsOf(group).mode === 'personalizzata' ? Season.find({ group: group._id }).sort({ startsAt: 1 }).lean() : Promise.resolve([]));

/** Tutte le stagioni dalla prima partita giocata a oggi, la più recente per prima. */
async function list(group, now = new Date()) {
  const custom = await customFor(group);
  const mark = (s) => ({ ...s, current: now >= s.start && now < s.end, closed: s.end <= now });
  if (settingsOf(group).mode === 'personalizzata') {
    return custom.map((c) => mark({ key: String(c._id), label: c.name, start: new Date(c.startsAt), end: new Date(c.endsAt), id: String(c._id) })).reverse();
  }
  const first = await Match.findOne({ group: group._id }).sort({ startsAt: 1 }).select('startsAt').lean();
  const out = [];
  let s = seasonAt(group, now);
  const stop = first ? new Date(first.startsAt) : now;
  for (let guard = 0; guard < 240 && s; guard++) {
    out.push(mark(s));
    if (s.start <= stop) break;
    s = seasonAt(group, new Date(s.start.getTime() - 86_400_000));
  }
  return out;
}

async function byKey(group, key, now = new Date()) {
  const all = await list(group, now);
  const found = all.find((s) => s.key === key);
  if (!found) throw notFound('Stagione non trovata.');
  const index = all.indexOf(found);
  return { season: found, previous: all[index + 1] || null };
}

async function current(group, now = new Date()) {
  return seasonAt(group, now, await customFor(group));
}

async function previous(group, now = new Date()) {
  return previousSeason(group, now, await customFor(group));
}

async function create(group, { name, startsAt, endsAt }) {
  const overlap = await Season.exists({ group: group._id, startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } });
  if (overlap) throw unprocessable('Le stagioni non possono sovrapporsi.', { startsAt: 'Si sovrappone a una stagione esistente.' });
  const doc = await Season.create({ group: group._id, name, startsAt, endsAt });
  return { key: String(doc._id), id: String(doc._id), label: doc.name, start: doc.startsAt, end: doc.endsAt };
}

async function remove(group, seasonId) {
  const res = await Season.deleteOne({ _id: seasonId, group: group._id });
  if (!res.deletedCount) throw notFound('Stagione non trovata.');
}

module.exports = { seasonAt, previousSeason, settingsOf, list, byKey, current, previous, create, remove, customFor };
