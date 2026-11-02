'use strict';

const { Schema, model } = require('mongoose');

const ACTIVITY_TYPES = [
  'partita_creata',
  'iscrizione',
  'promozione',
  'risultato',
  'mvp',
  'premio',
  'premio_partita',
  'membro_entrato',
  'boncall_aperta',
  'boncall_completa',
  'boncall_confermata',
  'achievement',
  'record',
];

// Feed del gruppo: ogni voce nasce da un evento già salvato, mai da dati inventati.
const activitySchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    target: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    match: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    poll: { type: Schema.Types.ObjectId, ref: 'Poll', default: null },
    data: { type: Schema.Types.Mixed, default: {} },
    // Chiave facoltativa per rendere idempotenti le registrazioni ripetute.
    key: { type: String, default: undefined },
  },
  { timestamps: true }
);

activitySchema.index({ group: 1, _id: -1 });
activitySchema.index({ group: 1, key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });

module.exports = model('Activity', activitySchema);
module.exports.ACTIVITY_TYPES = ACTIVITY_TYPES;
