'use strict';

const { Schema, model } = require('mongoose');

// Rivalità scelta volontariamente: facoltativa, senza testo libero, accettata dall'altro.
const rivalrySchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    users: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], required: true },
    // Chiave ordinata "idA:idB": una sola rivalità per coppia e gruppo.
    pairKey: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['proposta', 'attiva', 'rifiutata'], default: 'proposta' },
  },
  { timestamps: true }
);

rivalrySchema.index({ group: 1, pairKey: 1 }, { unique: true });

module.exports = model('Rivalry', rivalrySchema);
