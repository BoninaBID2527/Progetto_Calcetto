'use strict';

const { Schema, model } = require('mongoose');

// Token revocati al logout. L'indice TTL li elimina quando sarebbero comunque scaduti.
const revokedTokenSchema = new Schema({
  jti: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  expiresAt: { type: Date, required: true },
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('RevokedToken', revokedTokenSchema);
