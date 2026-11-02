'use strict';

const { z, int, objectId } = require('./common');
const { isYmd } = require('../utils/zone');
const { FIELD_KEYS, RESPONSES, DEFAULTS } = require('../config/appConfig');

const startsAt = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v));

const matchFields = {
  field: z.enum(FIELD_KEYS, { errorMap: () => ({ message: 'Scegli uno dei campi disponibili.' }) }),
  startsAt,
  durationMinutes: int(30, 180),
  costCents: int(0, 100_000),
  slots: int(2, 30),
  notes: z.string().trim().max(500),
};

const createMatch = z
  .object({
    ...matchFields,
    durationMinutes: matchFields.durationMinutes.default(DEFAULTS.durationMinutes),
    costCents: matchFields.costCents.default(0),
    slots: matchFields.slots.default(DEFAULTS.slots),
    notes: matchFields.notes.default(''),
  })
  .strict();

const updateMatch = z.object(matchFields).partial().strict();

const listMatches = z.object({ scope: z.enum(['prossime', 'passate', 'tutte']).default('prossime') });

const changeStatus = z.object({ status: z.enum(['aperta', 'chiusa', 'annullata', 'archiviata']) }).strict();

const respond = z.object({ response: z.enum(RESPONSES) }).strict();

// Compatibile con la V1 ({ paid }): paid:true = "dichiarato" per chi paga, "verificato" per l'organizzatore.
const payment = z
  .object({ paid: z.boolean(), payment: z.enum(['da_pagare', 'dichiarato', 'verificato']) })
  .partial()
  .strict()
  .refine((v) => v.paid !== undefined || v.payment !== undefined, { message: 'Indica lo stato del pagamento.', path: ['payment'] });

const team = z.object({ name: z.string().trim().min(1).max(30).optional(), players: z.array(objectId).min(1).max(15) }).strict();
const setTeams = z.object({ a: team, b: team }).strict();
const balanceTeams = z.object({ names: z.tuple([z.string().trim().min(1).max(30), z.string().trim().min(1).max(30)]).optional() }).strict();

const result = z
  .object({
    scoreA: int(0, 99),
    scoreB: int(0, 99),
    scorers: z.array(z.object({ userId: objectId, goals: int(1, 99) }).strict()).max(30).default([]),
  })
  .strict();

const mvpVote = z.object({ mvpUserId: objectId }).strict();
const attributeScores = z.object(Object.fromEntries(['vel', 'tir', 'pas', 'dri', 'dif', 'fis'].map((k) => [k, int(1, 10)]))).partial().strict();
const ratings = z
  .object({ ratings: z.array(z.object({ userId: objectId, score: int(1, 10), attributes: attributeScores.optional() }).strict()).min(1).max(30) })
  .strict();
const prizeVote = z.object({ option: z.string().trim().min(1).max(40) }).strict();

const ymd = z.string().refine(isYmd, 'Data non valida (AAAA-MM-GG).');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Orario non valido (HH:MM).');
const seriesFields = {
  field: matchFields.field,
  weekday: int(1, 7),
  time,
  startsOn: ymd,
  endsOn: ymd.nullable(),
  slots: matchFields.slots,
  durationMinutes: matchFields.durationMinutes,
  costCents: matchFields.costCents,
  notes: matchFields.notes,
};
const createSeries = z
  .object({
    ...seriesFields,
    endsOn: seriesFields.endsOn.default(null),
    slots: seriesFields.slots.default(DEFAULTS.slots),
    durationMinutes: seriesFields.durationMinutes.default(DEFAULTS.durationMinutes),
    costCents: seriesFields.costCents.default(0),
    notes: seriesFields.notes.default(''),
  })
  .strict();
const updateSeries = z.object({ ...seriesFields }).omit({ startsOn: true }).partial().strict();
const endSeries = z.object({ cancelFuture: z.enum(['true', 'false']).default('false').transform((v) => v === 'true') });
const calendarQuery = z.object({ from: ymd, to: ymd, group: objectId.optional() });
const exportQuery = z.object({ group: objectId.optional() });
const availabilityQuery = z.object({ from: ymd, to: ymd });
const setAvailability = z.object({ status: z.enum(['disponibile', 'forse', 'non_disponibile']) }).strict();
const awardVote = z.object({ nominee: z.string().regex(/^[a-f\d]{24}$/i, 'Identificativo non valido.') }).strict();
const awardAssign = z.object({ userIds: z.array(z.string().regex(/^[a-f\d]{24}$/i, 'Identificativo non valido.')).min(1).max(3) }).strict();
const rankings = z.object({ period: z.enum(['mese', 'stagione', 'sempre']).default('sempre'), season: z.string().trim().min(1).max(40).optional() });
const cardScope = z.object({ scope: z.enum(['gruppo', 'carriera']).default('gruppo') });

module.exports = {
  createMatch,
  updateMatch,
  listMatches,
  changeStatus,
  respond,
  payment,
  setTeams,
  balanceTeams,
  result,
  mvpVote,
  ratings,
  prizeVote,
  rankings,
  cardScope,
  awardVote,
  createSeries,
  updateSeries,
  endSeries,
  calendarQuery,
  exportQuery,
  availabilityQuery,
  setAvailability,
  awardAssign,
};
