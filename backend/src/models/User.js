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
      // "ridotto" spegne le animazioni anche se il sistema non lo chiede.
      motion: { type: String, enum: ['auto', 'ridotto'], default: 'auto' },
    },
    notificationPrefs: {
      // Le push si attivano solo dopo il consenso esplicito dal profilo.
      push: { type: Boolean, default: false },
      categories: {
        boncall: { type: Boolean, default: true },
        partite: { type: Boolean, default: true },
        promemoria: { type: Boolean, default: true },
        risultati: { type: Boolean, default: true },
        social: { type: Boolean, default: true },
      },
      quietHours: {
        enabled: { type: Boolean, default: true },
        start: { type: String, default: '23:00' },
        end: { type: String, default: '08:00' },
      },
      maxPushPerHour: { type: Number, default: 6, min: 1, max: 30 },
    },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
