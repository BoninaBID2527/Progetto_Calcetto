'use strict';

const { Schema, model } = require('mongoose');

// Un traguardo sbloccato: la coppia (utente, gruppo, chiave) è unica, quindi
// assegnarlo due volte è impossibile anche con richieste simultanee.
const achievementSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    key: { type: String, required: true },
    match: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    unlockedAt: { type: Date, required: true },
  },
  { timestamps: true }
);
achievementSchema.index({ user: 1, group: 1, key: 1 }, { unique: true });
achievementSchema.index({ group: 1, unlockedAt: -1 });

module.exports = model('Achievement', achievementSchema);
