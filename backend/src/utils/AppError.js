'use strict';

/** Errore applicativo con codice HTTP, codice leggibile dal client ed eventuali errori per campo. */
class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const badRequest = (message, fields) => new AppError(400, 'BAD_REQUEST', message, fields);
const unauthorized = (message = 'Devi accedere per continuare.') => new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'Non hai i permessi per questa azione.') => new AppError(403, 'FORBIDDEN', message);
const notFound = (message = 'Risorsa non trovata.') => new AppError(404, 'NOT_FOUND', message);
const conflict = (message, fields) => new AppError(409, 'CONFLICT', message, fields);
const unprocessable = (message, fields) => new AppError(422, 'VALIDATION_ERROR', message, fields);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable };
