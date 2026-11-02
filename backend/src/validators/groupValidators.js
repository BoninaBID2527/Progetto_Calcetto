'use strict';

const { z, trimmed, int, objectId } = require('./common');

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
    extraPrizeOptions: z.array(z.object({ label: trimmed(1, 24), emoji }).strict()).max(5),
    season: z.object({ mode: z.enum(['annuale', 'trimestrale', 'mensile', 'personalizzata']), startMonth: int(1, 12) }).partial().strict(),
  })
  .partial()
  .strict();

const updateGroup = z
  .object({ name: trimmed(2, 50), description: z.string().trim().max(280), emoji, color, settings })
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
const versusQuery = z.object({ with: objectId.optional() });

module.exports = { createSeason, proposeRivalry, versusQuery, createGroup, updateGroup, join, setRole, proposeNickname, replaceNickname, listNicknames };
