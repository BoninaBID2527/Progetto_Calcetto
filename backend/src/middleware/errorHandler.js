'use strict';

const mongoose = require('mongoose');
const { AppError } = require('../utils/AppError');
const config = require('../config/env');

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Percorso ${req.method} ${req.originalUrl} inesistente.` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Si è verificato un errore inatteso. Riprova tra poco.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) };
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'BAD_JSON', message: 'Il corpo della richiesta non è un JSON valido.' };
  } else if (err.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'La richiesta è troppo grande (forse la foto è troppo pesante).' };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { code: 'BAD_REQUEST', message: `Valore non valido per ${err.path}.` };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    const fields = {};
    for (const [key, e] of Object.entries(err.errors)) fields[key] = e.message;
    body = { code: 'VALIDATION_ERROR', message: 'Alcuni campi non sono validi.', fields };
  } else if (err.code === 11000) {
    status = 409;
    body = { code: 'CONFLICT', message: 'Esiste già un elemento con questi dati.' };
  }

  if (status === 500 && !config.isTest) console.error(err);
  res.status(status).json({ error: body });
}

module.exports = { errorHandler, notFoundHandler };
