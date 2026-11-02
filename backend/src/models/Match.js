'use strict';

const { Schema, model } = require('mongoose');
const { FIELD_KEYS, MATCH_STATUSES, DEFAULTS } = require('../config/appConfig');

const participantSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // "attesa" = ha detto "Ci sono" ma i posti erano finiti.
    response: { type: String, enum: ['ci_sono', 'attesa', 'forse', 'non_ci_sono'], required: true },
    respondedAt: { type: Date, default: Date.now },
    waitlistedAt: { type: Date, default: null },
    promotedAt: { type: Date, default: null },
    // Stato del pagamento della quota: dichiarato dal giocatore, verificato da chi riceve. `paid` resta per compatibilità (= verificato).
    payment: { type: String, enum: ['da_pagare', 'dichiarato', 'verificato'], default: 'da_pagare' },
    paid: { type: Boolean, default: false },
    paidUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const teamSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 30 },
    players: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: false }
);

const matchSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    organizer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    field: { type: String, enum: FIELD_KEYS, required: true },
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: DEFAULTS.durationMinutes },
    costCents: { type: Number, default: 0, min: 0 },
    slots: { type: Number, default: DEFAULTS.slots, min: 2 },
    // Contatore dei posti liberi: l'iscrizione lo decrementa in un'unica operazione atomica.
    freeSlots: { type: Number, required: true, min: 0 },
    notes: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: MATCH_STATUSES, default: 'aperta' },
    participants: { type: [participantSchema], default: [] },
    teams: {
      type: new Schema(
        {
          a: teamSchema,
          b: teamSchema,
          method: { type: String, enum: ['manuale', 'bilancia'], default: 'manuale' },
          updatedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
      default: null,
    },
    result: {
      type: new Schema(
        {
          scoreA: { type: Number, required: true, min: 0 },
          scoreB: { type: Number, required: true, min: 0 },
          scorers: [
            new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, goals: { type: Number, min: 1 } }, { _id: false }),
          ],
          recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          recordedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
      default: null,
    },
    voting: {
      type: new Schema(
        {
          opensAt: Date,
          closesAt: Date,
          closed: { type: Boolean, default: false },
          closedAt: { type: Date, default: null },
          mvp: [{ type: Schema.Types.ObjectId, ref: 'User' }],
          awardsClosed: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: null,
    },
    prizePoll: {
      type: new Schema(
        {
          options: [new Schema({ key: String, label: String, emoji: String }, { _id: false })],
          closed: { type: Boolean, default: false },
          closedAt: { type: Date, default: null },
          winners: [String],
        },
        { _id: false }
      ),
      default: null,
    },
    // Premi di partita attivi al momento del risultato e relativi vincitori.
    awards: {
      type: [new Schema({ key: String, label: String, mode: { type: String, enum: ['voto', 'automatico', 'assegnato'] } }, { _id: false })],
      default: [],
    },
    awardWinners: {
      type: [new Schema({ key: String, users: [{ type: Schema.Types.ObjectId, ref: 'User' }] }, { _id: false })],
      default: [],
    },
    // Partita ricorrente: serie di origine, data locale dell'occorrenza (chiave idempotente) e modifica singola.
    series: { type: Schema.Types.ObjectId, ref: 'MatchSeries', default: undefined },
    occurrenceKey: { type: String, default: undefined },
    detached: { type: Boolean, default: false },
    reminderSentAt: { type: Date, default: null },
    // Convocazione BONCALL da cui è nata la partita (al massimo una partita per convocazione).
    fromPoll: { type: Schema.Types.ObjectId, ref: 'Poll', default: undefined },
  },
  { timestamps: true }
);

matchSchema.index({ group: 1, startsAt: -1 });
matchSchema.index({ status: 1, startsAt: 1 });
matchSchema.index({ series: 1, occurrenceKey: 1 }, { unique: true, partialFilterExpression: { series: { $type: 'objectId' } } });
matchSchema.index({ fromPoll: 1 }, { unique: true, partialFilterExpression: { fromPoll: { $type: 'objectId' } } });

module.exports = model('Match', matchSchema);
