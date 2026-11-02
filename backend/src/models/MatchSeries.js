'use strict';

const { Schema, model } = require('mongoose');
const { FIELD_KEYS, DEFAULTS } = require('../config/appConfig');

// Partita ricorrente: un modello settimanale da cui nascono le singole partite (occorrenze).
const matchSeriesSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    organizer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    field: { type: String, enum: FIELD_KEYS, required: true },
    weekday: { type: Number, min: 1, max: 7, required: true }, // ISO: 1 lunedì … 7 domenica
    time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }, // orario locale del fuso del gruppo
    startsOn: { type: String, required: true }, // "YYYY-MM-DD"
    endsOn: { type: String, default: null },
    slots: { type: Number, default: DEFAULTS.slots, min: 2, max: 30 },
    durationMinutes: { type: Number, default: DEFAULTS.durationMinutes },
    costCents: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', maxlength: 500 },
    active: { type: Boolean, default: true },
    generatedUntil: { type: String, default: null },
  },
  { timestamps: true }
);
matchSeriesSchema.index({ group: 1, active: 1 });

module.exports = model('MatchSeries', matchSeriesSchema);
