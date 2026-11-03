'use strict';

const rateLimit = require('express-rate-limit');

const handler = (message) => (req, res) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message } });

/**
 * Limiti di frequenza per IP. Quello generale protegge tutte le API; quelli di
 * accesso sono più stretti: si contano solo i tentativi di login falliti
 * (contro la forza bruta) e le registrazioni.
 */
function createLimiters(cfg) {
  const common = { standardHeaders: 'draft-7', legacyHeaders: false };
  return {
    api: rateLimit({
      ...common,
      windowMs: cfg.windowMs,
      limit: cfg.apiMax,
      skip: (req) => req.path === '/health',
      handler: handler('Troppe richieste in poco tempo. Aspetta qualche istante e riprova.'),
    }),
    login: rateLimit({
      ...common,
      windowMs: cfg.authWindowMs,
      limit: cfg.loginMax,
      skipSuccessfulRequests: true,
      handler: handler('Troppi tentativi di accesso. Riprova tra qualche minuto.'),
    }),
    register: rateLimit({
      ...common,
      windowMs: cfg.authWindowMs,
      limit: cfg.registerMax,
      handler: handler('Troppe registrazioni da questa rete. Riprova più tardi.'),
    }),
  };
}

module.exports = { createLimiters };
