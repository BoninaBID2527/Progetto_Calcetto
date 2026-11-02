'use strict';

const { Schema, model } = require('mongoose');
const { ROLE_KEYS, FOOT_KEYS } = require('../config/appConfig');

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: { type: String, default: null },
    preferredRole: { type: String, enum: [...ROLE_KEYS, null], default: null },
    foot: { type: String, enum: [...FOOT_KEYS, null], default: null },
    settings: {
      // Come mostrare i soprannomi degli altri: accanto al nome oppure al posto del nome.
      nicknameMode: { type: String, enum: ['accanto', 'sostituisci'], default: 'accanto' },
    },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
