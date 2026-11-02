'use strict';

const { unprocessable, badRequest } = require('../utils/AppError');
const { isValidId } = require('../utils/helpers');

function zodFields(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Valida body e query con schemi zod; i dati ripuliti sostituiscono quelli originali. */
function validate({ body, query } = {}) {
  return (req, res, next) => {
    if (body) {
      const parsed = body.safeParse(req.body ?? {});
      if (!parsed.success) return next(unprocessable('Controlla i campi evidenziati.', zodFields(parsed.error)));
      req.body = parsed.data;
    }
    if (query) {
      const parsed = query.safeParse(req.query ?? {});
      if (!parsed.success) return next(unprocessable('Parametri non validi.', zodFields(parsed.error)));
      req.validQuery = parsed.data;
    }
    return next();
  };
}

/** Rifiuta con 400 gli id che non sono ObjectId validi, prima di toccare il database. */
function validIds(...names) {
  return (req, res, next) => {
    for (const name of names) {
      if (req.params[name] !== undefined && !isValidId(req.params[name])) {
        return next(badRequest(`Identificativo non valido: ${name}.`));
      }
    }
    return next();
  };
}

module.exports = { validate, validIds };
