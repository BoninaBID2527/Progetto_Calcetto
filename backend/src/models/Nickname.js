'use strict';

const { Schema, model } = require('mongoose');

// Ogni proposta resta nello storico; al massimo un soprannome "attivo" per persona e gruppo.
const nicknameSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    target: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    proposer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 30 },
    status: { type: String, enum: ['attivo', 'sostituito', 'rifiutato', 'rimosso'], default: 'attivo' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

nicknameSchema.index({ group: 1, target: 1, status: 1 });

module.exports = model('Nickname', nicknameSchema);
