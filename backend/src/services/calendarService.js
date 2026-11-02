'use strict';

/*
 * Calendario: partite, convocazioni aperte e disponibilità dei membri nello
 * stesso intervallo, per uno o più gruppi, più l'esportazione .ics.
 */
const { Match, Poll, Group, Availability } = require('../models');
const { forbidden, unprocessable } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');
const { addDays, ymdIn, zonedToUtc, isYmd, DEFAULT_ZONE } = require('../utils/zone');
const { getField } = require('../config/appConfig');
const nicknameService = require('./nicknameService');
const { userResolver } = require('./dto');

const MAX_DAYS = 100;
const zoneOf = (g) => g?.settings?.timezone || DEFAULT_ZONE;

function parseRange(group0, { from, to }) {
  if (!isYmd(from) || !isYmd(to)) throw unprocessable('Indica un intervallo di date valido.', { from: 'Formato AAAA-MM-GG.' });
  if (to < from) throw unprocessable("La fine dell'intervallo precede l'inizio.", { to: 'Intervallo non valido.' });
  if (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`) > MAX_DAYS * 86_400_000) throw unprocessable(`L'intervallo può durare al massimo ${MAX_DAYS} giorni.`, { to: 'Intervallo troppo lungo.' });
  return { from, to };
}

async function groupsFor(user, groupId) {
  const groups = await Group.find({ 'members.user': user._id });
  if (groupId) {
    const found = groups.find((g) => String(g._id) === String(groupId));
    if (!found) throw forbidden('Non fai parte di questo gruppo.');
    return [found];
  }
  return groups;
}

/** Elementi del calendario dell'utente (partite e convocazioni) tra due date locali di ciascun gruppo. */
async function range(user, { from, to, group: groupId }) {
  parseRange(null, { from, to });
  const groups = await groupsFor(user, groupId);
  const items = [];
  for (const g of groups) {
    const tz = zoneOf(g);
    const start = zonedToUtc(from, '00:00', tz);
    const end = zonedToUtc(addDays(to, 1), '00:00', tz);
    const info = { groupId: String(g._id), groupName: g.name, groupColor: g.color, timezone: tz };
    const matches = await Match.find({ group: g._id, startsAt: { $gte: start, $lt: end } }).sort({ startsAt: 1 }).lean();
    for (const m of matches) {
      const mine = m.participants.find((p) => sameId(p.user, user._id));
      items.push({
        type: 'partita',
        id: String(m._id),
        ...info,
        date: ymdIn(m.startsAt, tz),
        startsAt: m.startsAt,
        durationMinutes: m.durationMinutes,
        field: m.field,
        fieldName: getField(m.field)?.name || m.field,
        status: m.status,
        slots: m.slots,
        freeSlots: m.freeSlots,
        confirmed: m.participants.filter((p) => p.response === 'ci_sono').length,
        myResponse: mine?.response || null,
        recurring: Boolean(m.series),
        seriesId: m.series ? String(m.series) : null,
        link: `/partite/${m._id}`,
      });
    }
    const polls = await Poll.find({ group: g._id, status: 'aperta' }).lean();
    for (const p of polls) {
      const mine = p.responses.find((r) => sameId(r.user, user._id));
      const slots = p.mode === 'fissa' ? [{ key: null, startsAt: p.startsAt, field: p.field }] : p.options.map((o) => ({ key: o.key, startsAt: o.startsAt, field: o.field }));
      for (const s of slots) {
        if (!s.startsAt || s.startsAt < start || s.startsAt >= end) continue;
        items.push({
          type: 'convocazione',
          id: String(p._id),
          optionKey: s.key,
          ...info,
          date: ymdIn(s.startsAt, tz),
          startsAt: s.startsAt,
          field: s.field,
          fieldName: getField(s.field)?.name || s.field,
          status: 'aperta',
          playersNeeded: p.playersNeeded,
          confirmed: p.responses.filter((r) => r.response === 'ci_sono').length,
          myResponse: mine?.response || null,
          deadline: p.deadline,
          link: `/boncall/${p._id}`,
        });
      }
    }
  }
  items.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  return { from, to, items, groups: groups.map((g) => ({ id: String(g._id), name: g.name, color: g.color, timezone: zoneOf(g) })) };
}

// ------------------------------------------------------------------ disponibilità

async function availability(group, user, { from, to }) {
  parseRange(null, { from, to });
  const rows = await Availability.find({ group: group._id, date: { $gte: from, $lte: to } }).lean();
  const resolve = await userResolver(rows.filter((r) => r.status === 'disponibile').map((r) => r.user), await nicknameService.activeMap(group._id));
  const days = {};
  for (const r of rows) {
    const d = (days[r.date] ||= { disponibile: 0, forse: 0, non_disponibile: 0, mine: null, available: [] });
    d[r.status] += 1;
    if (sameId(r.user, user._id)) d.mine = r.status;
    if (r.status === 'disponibile') d.available.push(resolve(r.user));
  }
  return { from, to, days };
}

async function setAvailability(group, user, date, status) {
  if (!isYmd(date)) throw unprocessable('Data non valida.', { date: 'Formato AAAA-MM-GG.' });
  if (date < ymdIn(new Date(), zoneOf(group))) throw unprocessable('Non si può indicare la disponibilità per un giorno passato.', { date: 'Giorno passato.' });
  if (status === null) {
    await Availability.deleteOne({ group: group._id, user: user._id, date });
    return { date, status: null };
  }
  await Availability.updateOne({ group: group._id, user: user._id, date }, { $set: { status } }, { upsert: true });
  return { date, status };
}

// ------------------------------------------------------------------ .ics

const esc = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Piega le righe a 75 byte come richiede RFC 5545 (continuazione con uno spazio). */
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 74) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** Calendario iCalendar delle partite non annullate (da 30 giorni fa a 180 avanti) dei gruppi dell'utente. */
async function ics(user, { group: groupId } = {}) {
  const groups = await groupsFor(user, groupId);
  const now = new Date();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BONMATCH//Calendario//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:BONMATCH', `X-WR-TIMEZONE:${zoneOf(groups[0])}`];
  for (const g of groups) {
    const matches = await Match.find({ group: g._id, status: { $in: ['aperta', 'chiusa', 'giocata', 'archiviata'] }, startsAt: { $gte: new Date(now - 30 * 86_400_000), $lte: new Date(now.getTime() + 180 * 86_400_000) } }).sort({ startsAt: 1 }).lean();
    for (const m of matches) {
      const field = getField(m.field);
      const end = new Date(new Date(m.startsAt).getTime() + (m.durationMinutes || 60) * 60_000);
      lines.push(
        'BEGIN:VEVENT',
        `UID:match-${m._id}@bonmatch`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${stamp(m.startsAt)}`,
        `DTEND:${stamp(end)}`,
        `SEQUENCE:${Math.floor(new Date(m.updatedAt || m.startsAt).getTime() / 1000)}`,
        `SUMMARY:${esc(`Calcetto · ${g.name}`)}`,
        `LOCATION:${esc(field ? `${field.name}${field.town ? `, ${field.town}` : ''}` : m.field)}`,
        `DESCRIPTION:${esc(`${m.slots} posti${m.costCents ? ` · ${(m.costCents / 100).toFixed(2).replace('.', ',')} €` : ''}${m.notes ? `\n${m.notes}` : ''}`)}`,
        `STATUS:${m.status === 'aperta' ? 'TENTATIVE' : 'CONFIRMED'}`,
        'END:VEVENT'
      );
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

module.exports = { range, availability, setAvailability, ics, fold, esc };
