'use strict';

/*
 * Partite ricorrenti. Ogni serie genera le partite (occorrenze) delle
 * prossime settimane. La chiave dell'occorrenza è la data locale: l'indice
 * unico {series, occurrenceKey} rende la generazione idempotente, quindi
 * rilanciarla, farla partire da due processi o dopo un riavvio non crea mai
 * doppioni, e un'occorrenza annullata o modificata non viene mai ricreata.
 */
const { Match, MatchSeries, Group } = require('../models');
const { forbidden, notFound, unprocessable } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');
const { ymdIn, zonedToUtc, addDays, isoWeekday, DEFAULT_ZONE } = require('../utils/zone');
const matchService = require('./matchService');
const notificationService = require('./notificationService');
const chatService = require('./chatService');
const realtime = require('./realtime');
const activityService = require('./activityService');

const HORIZON_DAYS = 28;
const WEEKDAYS = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

const zoneOf = (group) => group?.settings?.timezone || DEFAULT_ZONE;

const toDto = (s, group) => ({
  id: String(s._id),
  field: s.field,
  weekday: s.weekday,
  weekdayLabel: WEEKDAYS[s.weekday],
  time: s.time,
  startsOn: s.startsOn,
  endsOn: s.endsOn,
  slots: s.slots,
  durationMinutes: s.durationMinutes,
  costCents: s.costCents,
  notes: s.notes,
  active: s.active,
  timezone: zoneOf(group),
  organizerId: String(s.organizer),
});

function assertCanOrganize(group, user) {
  const me = group.members.find((m) => sameId(m.user, user._id));
  if (!me) throw forbidden('Non fai parte di questo gruppo.');
  if (group.settings.organizers === 'admin' && me.role !== 'admin') throw forbidden('In questo gruppo solo gli admin possono creare partite.');
  return me;
}

/**
 * Crea le occorrenze mancanti entro l'orizzonte. Restituisce le nuove partite.
 * Le occorrenze con `startsAt` nel passato non si creano mai.
 */
async function materialize(series, group, { now = new Date(), notify = false, horizonDays = HORIZON_DAYS } = {}) {
  if (!series.active) return [];
  const tz = zoneOf(group);
  const today = ymdIn(now, tz);
  const last = addDays(today, horizonDays);
  let day = series.startsOn > today ? series.startsOn : today;
  const created = [];
  for (; day <= last; day = addDays(day, 1)) {
    if (series.endsOn && day > series.endsOn) break;
    if (isoWeekday(day) !== series.weekday) continue;
    const startsAt = zonedToUtc(day, series.time, tz);
    if (startsAt.getTime() <= now.getTime()) continue;
    let match;
    try {
      match = await Match.create({
        group: series.group,
        organizer: series.organizer,
        field: series.field,
        startsAt,
        durationMinutes: series.durationMinutes,
        costCents: series.costCents,
        slots: series.slots,
        freeSlots: series.slots,
        notes: series.notes,
        series: series._id,
        occurrenceKey: day,
      });
    } catch (err) {
      if (err.code === 11000) continue; // già generata (anche se poi annullata o modificata)
      throw err;
    }
    created.push(match);
    realtime.toGroup(series.group, 'match:created', await matchService.dtoOf(match.toObject()));
    if (notify) {
      await notificationService.notify(
        group.members.map((m) => m.user).filter((id) => !sameId(id, series.organizer)),
        {
          type: 'nuova_partita',
          title: `Nuova partita ${matchService.dayOf(match)} a ${matchService.fieldName(match.field)}`,
          body: 'Partita ricorrente: iscrizioni aperte. Ci sei?',
          link: `/partite/${match._id}`,
          group: series.group,
          dedupeKey: `serie:${series._id}:${day}`,
        }
      );
    }
  }
  if (created.length || series.generatedUntil !== last) await MatchSeries.updateOne({ _id: series._id }, { $set: { generatedUntil: last } });
  return created;
}

async function create(group, user, data) {
  assertCanOrganize(group, user);
  const tz = zoneOf(group);
  if (data.endsOn && data.endsOn < data.startsOn) throw unprocessable("La fine deve venire dopo l'inizio.", { endsOn: 'Data non valida.' });
  const series = await MatchSeries.create({ ...data, group: group._id, organizer: user._id });
  const created = await materialize(series, group);
  const label = `ogni ${WEEKDAYS[series.weekday]} alle ${series.time}`;
  await notificationService.notify(
    group.members.map((m) => m.user).filter((id) => !sameId(id, user._id)),
    {
      type: 'nuova_partita',
      title: `Partita ricorrente: ${label}`,
      body: `${user.name} ha creato una partita a ${matchService.fieldName(series.field)} ${label}. Trovi le prossime date nel calendario.`,
      link: `/gruppi/${group._id}/calendario`,
      group: group._id,
      dedupeKey: `serie:${series._id}:nuova`,
    }
  );
  await chatService.postSystem(group._id, `${user.name} ha creato una partita ricorrente a ${matchService.fieldName(series.field)}: ${label}.`);
  await activityService.record(group._id, 'partita_creata', { actor: user._id, data: { field: series.field, recurring: true }, key: `serie:${series._id}` });
  void tz;
  return { series: toDto(series, group), created: created.length };
}

async function list(group) {
  const items = await MatchSeries.find({ group: group._id }).sort({ createdAt: -1 }).lean();
  const counts = await Promise.all(items.map((s) => Match.countDocuments({ series: s._id, status: { $in: ['aperta', 'chiusa'] }, startsAt: { $gt: new Date() } })));
  return items.map((s, i) => ({ ...toDto(s, group), upcoming: counts[i] }));
}

async function load(seriesId, user) {
  const series = await MatchSeries.findById(seriesId);
  if (!series) throw notFound('Partita ricorrente non trovata.');
  const group = await Group.findById(series.group);
  const me = group?.members.find((m) => sameId(m.user, user._id));
  if (!me) throw forbidden('Non fai parte del gruppo di questa partita ricorrente.');
  if (me.role !== 'admin' && !sameId(series.organizer, user._id)) throw forbidden('Solo chi l\'ha creata o un admin può gestire la partita ricorrente.');
  return { series, group };
}

/** Modifica il modello: si propaga solo alle occorrenze future ancora aperte, senza iscritti e non modificate a mano. */
async function update(seriesId, user, data) {
  const { series, group } = await load(seriesId, user);
  if (data.endsOn !== undefined && data.endsOn !== null && data.endsOn < series.startsOn) throw unprocessable("La fine deve venire dopo l'inizio.", { endsOn: 'Data non valida.' });
  const tz = zoneOf(group);
  const timeOrDayChanged = (data.time && data.time !== series.time) || (data.weekday && data.weekday !== series.weekday);
  series.set(data);
  await series.save();
  const future = await Match.find({ series: series._id, status: 'aperta', detached: false, startsAt: { $gt: new Date() } });
  let updated = 0;
  for (const m of future) {
    if (m.participants.length) continue; // chi si è già iscritto non va spiazzato
    const set = { field: series.field, slots: series.slots, freeSlots: series.slots, costCents: series.costCents, durationMinutes: series.durationMinutes, notes: series.notes };
    if (timeOrDayChanged) set.startsAt = zonedToUtc(m.occurrenceKey, series.time, tz);
    await Match.updateOne({ _id: m._id, participants: { $size: 0 } }, { $set: set });
    updated += 1;
    await matchService.broadcast(m._id);
  }
  const created = await materialize(series, group);
  return { series: toDto(series, group), updated, created: created.length };
}

/** Ferma la serie; con `cancelFuture` annulla anche le occorrenze future aperte (con notifica agli iscritti). */
async function end(seriesId, user, { cancelFuture = false } = {}) {
  const { series } = await load(seriesId, user);
  series.active = false;
  await series.save();
  let cancelled = 0;
  if (cancelFuture) {
    const future = await Match.find({ series: series._id, status: { $in: ['aperta', 'chiusa'] }, startsAt: { $gt: new Date() } });
    for (const m of future) {
      await matchService.changeStatus(m, user, 'annullata');
      cancelled += 1;
    }
  }
  return { cancelled };
}

/** Programma periodico: mantiene l'orizzonte delle serie attive sempre pieno. */
async function materializeAll(now = new Date()) {
  const all = await MatchSeries.find({ active: true });
  let created = 0;
  for (const s of all) {
    const group = await Group.findById(s.group);
    if (!group) continue;
    created += (await materialize(s, group, { now, notify: true })).length;
  }
  return created;
}

module.exports = { create, list, update, end, materialize, materializeAll, toDto, HORIZON_DAYS };
