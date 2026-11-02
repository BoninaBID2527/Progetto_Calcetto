'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { User, RevokedToken } = require('../models');
const { conflict, unauthorized } = require('../utils/AppError');
const { selfUser } = require('./dto');
const realtime = require('./realtime');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || (config.isTest ? 4 : 10);

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

function issueToken(user) {
  const token = jwt.sign({ sub: String(user._id), jti: crypto.randomUUID() }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  return { token, user: selfUser(user) };
}

async function register({ name, email, password }) {
  if (await User.exists({ email })) {
    throw conflict('Esiste già un account con questa email.', { email: 'Questa email è già registrata.' });
  }
  try {
    const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
    return issueToken(user);
  } catch (err) {
    if (err.code === 11000) throw conflict('Esiste già un account con questa email.', { email: 'Questa email è già registrata.' });
    throw err;
  }
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw unauthorized('Email o password non corretti.');
  return issueToken(user);
}

/** Verifica firma, scadenza e revoca del token; restituisce utente e payload. */
async function authenticate(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Sessione scaduta o non valida: accedi di nuovo.');
  }
  if (await RevokedToken.exists({ jti: payload.jti })) {
    throw unauthorized('Sei uscito da questa sessione: accedi di nuovo.');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('Account non più esistente.');
  return { user, payload };
}

async function logout(payload) {
  await RevokedToken.updateOne(
    { jti: payload.jti },
    { $setOnInsert: { jti: payload.jti, user: payload.sub, expiresAt: new Date(payload.exp * 1000) } },
    { upsert: true }
  );
  await realtime.disconnectToken(payload.sub, payload.jti);
}

module.exports = { register, login, authenticate, logout, hashPassword, issueToken };
