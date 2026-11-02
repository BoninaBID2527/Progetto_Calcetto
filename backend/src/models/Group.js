'use strict';

const { Schema, model } = require('mongoose');
const { DEFAULTS } = require('../config/appConfig');

const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const prizeOptionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, maxlength: 24 },
    emoji: { type: String, required: true, maxlength: 8 },
  },
  { _id: false }
);

const groupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    description: { type: String, default: '', maxlength: 280 },
    emoji: { type: String, default: '⚽', maxlength: 8 },
    color: { type: String, default: '#2EE59D' },
    // Identità del club. Le immagini sono data URL di PNG/JPEG/WebP verificati dai primi byte.
    motto: { type: String, default: '', maxlength: 80 },
    secondaryColor: { type: String, default: null },
    crestUrl: { type: String, default: null },
    coverUrl: { type: String, default: null },
    kits: {
      light: { primary: { type: String, default: null }, secondary: { type: String, default: null } },
      dark: { primary: { type: String, default: null }, secondary: { type: String, default: null } },
    },
    inviteCode: { type: String, required: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    settings: {
      organizers: { type: String, enum: ['tutti', 'admin'], default: 'tutti' },
      minMatchesForRanking: { type: Number, default: DEFAULTS.minMatchesForRanking, min: 1, max: 50 },
      loserPaysFirstRound: { type: Boolean, default: false },
      extraPrizeOptions: { type: [prizeOptionSchema], default: [] },
      // Premi di partita facoltativi, spenti finché un admin non li attiva.
      awards: {
        portiere: { type: Boolean, default: false },
        difensore: { type: Boolean, default: false },
        bomber: { type: Boolean, default: false },
        sorpresa: { type: Boolean, default: false },
        ironico: {
          enabled: { type: Boolean, default: false },
          label: { type: String, default: 'Premio ironico', maxlength: 30 },
        },
      },
      season: {
        mode: { type: String, enum: ['annuale', 'trimestrale', 'mensile', 'personalizzata'], default: 'annuale' },
        startMonth: { type: Number, min: 1, max: 12, default: 9 },
      },
    },
  },
  { timestamps: true }
);

groupSchema.index({ 'members.user': 1 });

module.exports = model('Group', groupSchema);
