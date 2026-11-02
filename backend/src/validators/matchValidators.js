'use strict';

const { z, int, objectId } = require('./common');
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

const payment = z.object({ paid: z.boolean() }).strict();

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

const rankings = z.object({ period: z.enum(['mese', 'stagione', 'sempre']).default('sempre') });
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
};
