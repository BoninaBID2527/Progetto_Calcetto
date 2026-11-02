'use strict';

const { Schema, model } = require('mongoose');
const { FIELD_KEYS, DEFAULTS } = require('../config/appConfig');

const optionSchema = new Schema(
  {
    key: { type: String, required: true },
    startsAt: { type: Date, required: true },
    field: { type: String, enum: FIELD_KEYS, required: true },
  },
  { _id: false }
);

const responseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    response: { type: String, enum: ['ci_sono', 'attesa', 'forse', 'non_ci_sono'], required: true },
    options: { type: [String], default: [] },
    respondedAt: { type: Date, default: Date.now },
    waitlistedAt: { type: Date, default: null },
    promotedAt: { type: Date, default: null },
  },
  { _id: false }
);

// BONCALL: convocazione per trovare giocatori prima di fissare la partita.
const pollSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: ['fissa', 'opzioni'], required: true },
    field: { type: String, enum: [...FIELD_KEYS, null], default: null },
    startsAt: { type: Date, default: null },
    options: { type: [optionSchema], default: [] },
    playersNeeded: { type: Number, required: true, min: 2, max: 30 },
    durationMinutes: { type: Number, default: DEFAULTS.durationMinutes },
    costCents: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', maxlength: 500 },
    deadline: { type: Date, required: true },
    responses: { type: [responseSchema], default: [] },
    // Solo modalità fissa: contatore atomico dei posti.
    freeSlots: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['aperta', 'completa', 'scaduta', 'convertita', 'annullata'], default: 'aperta' },
    match: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    chosenOption: { type: String, default: null },
    // Ogni avviso parte una sola volta: il campo si "prenota" con un update condizionato.
    alerts: {
      reminder: { type: Date, default: null },
      missing2: { type: Date, default: null },
      missing1: { type: Date, default: null },
      deadline: { type: Date, default: null },
      completed: { type: Date, default: null },
      expired: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

pollSchema.index({ group: 1, status: 1, deadline: 1 });

module.exports = model('Poll', pollSchema);
