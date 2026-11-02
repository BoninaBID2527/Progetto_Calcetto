'use strict';

const { z } = require('zod');

// Messaggi di errore in italiano per tutti gli schemi.
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: issue.received === 'undefined' ? 'Campo obbligatorio.' : 'Tipo di valore non valido.' };
    case 'too_small':
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'Campo obbligatorio.' : `Servono almeno ${issue.minimum} caratteri.` };
      if (issue.type === 'number') return { message: `Il valore minimo è ${issue.minimum}.` };
      if (issue.type === 'array') return { message: `Servono almeno ${issue.minimum} elementi.` };
      break;
    case 'too_big':
      if (issue.type === 'string') return { message: `Al massimo ${issue.maximum} caratteri.` };
      if (issue.type === 'number') return { message: `Il valore massimo è ${issue.maximum}.` };
      if (issue.type === 'array') return { message: `Al massimo ${issue.maximum} elementi.` };
      break;
    case 'invalid_string':
      if (issue.validation === 'email') return { message: 'Inserisci un indirizzo email valido.' };
      if (issue.validation === 'datetime') return { message: 'Data e ora non valide.' };
      return { message: 'Formato non valido.' };
    case 'invalid_enum_value':
      return { message: `Valore non ammesso. Scegli tra: ${issue.options.join(', ')}.` };
    case 'invalid_date':
      return { message: 'Data non valida.' };
    case 'unrecognized_keys':
      return { message: `Campi non previsti: ${issue.keys.join(', ')}.` };
    default:
      break;
  }
  return { message: ctx.defaultError };
});

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificativo non valido.');
const trimmed = (min, max) => z.string().trim().min(min).max(max);
const int = (min, max) => z.coerce.number().int('Serve un numero intero.').min(min).max(max);

module.exports = { z, objectId, trimmed, int };
