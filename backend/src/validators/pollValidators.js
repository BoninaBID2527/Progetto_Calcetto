'use strict';

const { z, int } = require('./common');
const { FIELD_KEYS, RESPONSES, DEFAULTS } = require('../config/appConfig');

const date = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v));
const field = z.enum(FIELD_KEYS, { errorMap: () => ({ message: 'Scegli uno dei campi disponibili.' }) });

const createPoll = z
  .object({
    mode: z.enum(['fissa', 'opzioni']).default('fissa'),
    field: field.optional(),
    startsAt: date.optional(),
    options: z.array(z.object({ startsAt: date, field }).strict()).max(5).optional(),
    playersNeeded: int(2, 30).default(DEFAULTS.slots),
    durationMinutes: int(30, 180).default(DEFAULTS.durationMinutes),
    costCents: int(0, 100_000).default(0),
    notes: z.string().trim().max(500).default(''),
    deadline: date,
    authorPlays: z.boolean().default(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === 'fissa') {
      if (!v.field) ctx.addIssue({ code: 'custom', path: ['field'], message: 'Scegli il campo.' });
      if (!v.startsAt) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Indica giorno e ora.' });
    } else if (!v.options || v.options.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Proponi almeno 2 alternative.' });
    }
  });

const respond = z.object({ response: z.enum(RESPONSES), options: z.array(z.string().max(4)).max(5).optional() }).strict();
const convert = z.object({ option: z.string().max(4).optional() }).strict();
const list = z.object({ scope: z.enum(['aperte', 'tutte']).default('aperte') });

module.exports = { createPoll, respond, convert, list };
