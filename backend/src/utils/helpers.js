'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { appConfig } = require('../config/appConfig');

// Senza caratteri ambigui (0/O, 1/I/L) per poter dettare il codice a voce.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateInviteCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

const isValidId = (id) => typeof id === 'string' && mongoose.isValidObjectId(id) && /^[a-f0-9]{24}$/i.test(id);

const idOf = (value) => (value && value._id ? String(value._id) : String(value));

const sameId = (a, b) => a != null && b != null && idOf(a) === idOf(b);

/** Colore di sfondo per l'avatar con le iniziali, ricavato in modo stabile dal nome. */
const AVATAR_COLORS = ['#2EE59D', '#FF8A3D', '#FFD23F', '#4CC9F0', '#C9A0FF', '#FF7AA2', '#B8E35A', '#5EEAD4'];
function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const dayFormatter = new Intl.DateTimeFormat('it-IT', { weekday: 'long', timeZone: appConfig.timeZone });
const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: appConfig.timeZone,
});

/** "giovedì" se la partita è entro una settimana, altrimenti "giovedì 14 novembre". */
function matchDayLabel(date, now = new Date()) {
  const diffDays = Math.abs(date.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < 6) return dayFormatter.format(date);
  return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: appConfig.timeZone }).format(date);
}

const formatDateTime = (date) => dateFormatter.format(date);

function formatEuro(cents) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

module.exports = {
  generateInviteCode,
  isValidId,
  idOf,
  sameId,
  avatarColor,
  matchDayLabel,
  formatDateTime,
  formatEuro,
};
