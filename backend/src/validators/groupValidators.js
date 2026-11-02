'use strict';

const { z, trimmed, int, objectId } = require('./common');
const { isValidZone } = require('../utils/zone');

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colore non valido (formato #RRGGBB).');
const emoji = z.string().trim().min(1).max(8);

const createGroup = z
  .object({
    name: trimmed(2, 50),
    description: z.string().trim().max(280).default(''),
    emoji: emoji.default('⚽'),
    color: color.default('#2EE59D'),
  })
  .strict();

const settings = z
  .object({
    organizers: z.enum(['tutti', 'admin']),
    minMatchesForRanking: int(1, 50),
    loserPaysFirstRound: z.boolean(),
    cashbox: z.boolean(),
    timezone: z.string().refine(isValidZone, 'Fuso orario non valido (es. Europe/Rome).'),
    extraPrizeOptions: z.array(z.object({ label: trimmed(1, 24), emoji }).strict()).max(5),
    awards: z
      .object({
        portiere: z.boolean(),
        difensore: z.boolean(),
        bomber: z.boolean(),
        sorpresa: z.boolean(),
        ironico: z.object({ enabled: z.boolean(), label: trimmed(2, 30) }).partial().strict(),
      })
      .partial()
      .strict(),
    season: z.object({ mode: z.enum(['annuale', 'trimestrale', 'mensile', 'personalizzata']), startMonth: int(1, 12) }).partial().strict(),
  })
  .partial()
  .strict();

const kit = z.object({ primary: color, secondary: color }).partial().strict();
const updateGroup = z
  .object({
    name: trimmed(2, 50),
    description: z.string().trim().max(280),
    emoji,
    color,
    motto: z.string().trim().max(80),
    secondaryColor: color.nullable(),
    kits: z.object({ light: kit, dark: kit }).partial().strict(),
    settings,
  })
  .partial()
  .strict();

const join = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9]{6}$/, 'Il codice ha 6 caratteri, lettere e numeri.') });

const setRole = z.object({ role: z.enum(['admin', 'member']) }).strict();

const proposeNickname = z.object({ targetUserId: objectId, text: trimmed(2, 30) }).strict();
const replaceNickname = z.object({ text: trimmed(2, 30) }).strict();
const listNicknames = z.object({ userId: objectId.optional() });
const proposeRivalry = z.object({ targetUserId: objectId }).strict();
const isoDate = z.string().datetime({ offset: true }).transform((v) => new Date(v));
const createSeason = z
  .object({ name: trimmed(2, 40), startsAt: isoDate, endsAt: isoDate })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, { path: ['endsAt'], message: "La fine deve venire dopo l'inizio." });
const cents = z.number().int().min(1, "L'importo deve essere maggiore di zero.").max(1_000_000, 'Importo troppo alto.');
const createEntry = z
  .object({
    type: z.enum(['versamento', 'spesa', 'rimborso']),
    amountCents: cents,
    note: z.string().trim().max(200).default(''),
    userId: objectId.optional(),
    paidFrom: z.enum(['cassa', 'membro']).optional(),
    matchId: objectId.optional(),
  })
  .strict();
const cancelEntry = z.object({ reason: z.string().trim().max(200).default('') }).strict();
const ledgerQuery = z.object({
  type: z.enum(['quota', 'versamento', 'spesa', 'rimborso']).optional(),
  status: z.enum(['dichiarato', 'verificato', 'annullato']).optional(),
  userId: objectId.optional(),
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const thirdHalfQuery = z.object({ period: z.enum(['stagione', 'sempre']).default('sempre'), season: z.string().trim().min(1).max(40).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });
const wrappedQuery = z.object({ season: z.string().trim().min(1).max(40).default('corrente'), user: objectId.optional() });
const versusQuery = z.object({ with: objectId.optional() });

module.exports = { wrappedQuery, thirdHalfQuery, createEntry, cancelEntry, ledgerQuery, createSeason, proposeRivalry, versusQuery, createGroup, updateGroup, join, setRole, proposeNickname, replaceNickname, listNicknames };
