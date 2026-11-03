'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';

const config = {
  nodeEnv,
  isTest: nodeEnv === 'test',
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bonmatch',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false' && nodeEnv !== 'test',
  schedulerIntervalMs: Number(process.env.SCHEDULER_INTERVAL_MS) || 60_000,
  // Dietro un proxy (nginx, Render, …) impostare TRUST_PROXY (es. 1) perché i limiti usino l'IP reale del client.
  trustProxy: process.env.TRUST_PROXY ? (Number.isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY)) : false,
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false' && nodeEnv !== 'test',
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    apiMax: Number(process.env.RATE_LIMIT_API_MAX) || 600, // richieste per finestra e per IP
    authWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60_000,
    loginMax: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 20, // accessi falliti per finestra e per IP
    registerMax: Number(process.env.RATE_LIMIT_REGISTER_MAX) || 20, // registrazioni per finestra e per IP
  },
  // Web Push: senza le due chiavi le push restano spente (le notifiche in-app funzionano comunque).
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@bonmatch.invalid',
  },
};

if (!config.jwtSecret) {
  if (config.isProduction) {
    throw new Error('JWT_SECRET mancante: impostalo nel file .env prima di avviare in produzione.');
  }
  // Solo in sviluppo e test: un segreto locale evita di bloccare il primo avvio.
  config.jwtSecret = 'solo-per-sviluppo-cambiami';
}

module.exports = config;
