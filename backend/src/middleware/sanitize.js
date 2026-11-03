'use strict';

const { badRequest } = require('../utils/AppError');

const MAX_DEPTH = 12;

/** Vero se un oggetto contiene chiavi che contengono "$" o "." (operatori e percorsi di MongoDB). */
function hasOperatorKeys(value, depth = 0) {
  if (value === null || typeof value !== 'object') return false;
  if (depth > MAX_DEPTH) return true; // annidamenti assurdi: meglio rifiutare
  if (Array.isArray(value)) return value.some((v) => hasOperatorKeys(v, depth + 1));
  for (const [key, v] of Object.entries(value)) {
    if (key.includes('$') || key.includes('.') || key === '__proto__') return true;
    if (hasOperatorKeys(v, depth + 1)) return true;
  }
  return false;
}

/**
 * Difesa in più contro l'injection NoSQL: nessun corpo, query o parametro
 * può contenere chiavi come `$gt` o `a.b`. Gli schemi di validazione già
 * scartano i campi sconosciuti; questo controllo ferma il tentativo prima.
 */
function rejectOperatorKeys(req, res, next) {
  if (hasOperatorKeys(req.body) || hasOperatorKeys(req.query) || hasOperatorKeys(req.params)) {
    return next(badRequest('La richiesta contiene chiavi non valide.'));
  }
  return next();
}

module.exports = { rejectOperatorKeys, hasOperatorKeys };
