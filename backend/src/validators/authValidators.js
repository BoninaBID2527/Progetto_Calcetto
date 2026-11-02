'use strict';

const { z, trimmed } = require('./common');
const { ROLE_KEYS, FOOT_KEYS } = require('../config/appConfig');

const email = z.string().trim().toLowerCase().email();

const register = z.object({
  name: trimmed(2, 40),
  email,
  password: z
    .string()
    .min(8)
    .max(72)
    .regex(/[A-Za-z]/, 'La password deve contenere almeno una lettera.')
    .regex(/[0-9]/, 'La password deve contenere almeno un numero.'),
});

const login = z.object({ email, password: z.string().min(1) });

// Foto: data URL d'immagine ridimensionata nel browser oppure indirizzo https.
const avatarUrl = z
  .string()
  .max(200_000, 'La foto è troppo pesante: scegline una più piccola.')
  .refine((v) => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^https:\/\/\S+$/.test(v), 'Formato della foto non valido.')
  .nullable();

const updateMe = z
  .object({
    name: trimmed(2, 40),
    avatarUrl,
    preferredRole: z.enum(ROLE_KEYS).nullable(),
    foot: z.enum(FOOT_KEYS).nullable(),
    settings: z.object({ nicknameMode: z.enum(['accanto', 'sostituisci']), motion: z.enum(['auto', 'ridotto']) }).partial().strict(),
    notificationPrefs: z
      .object({
        push: z.boolean(),
        categories: z.object({ boncall: z.boolean(), partite: z.boolean(), promemoria: z.boolean(), risultati: z.boolean(), social: z.boolean() }).partial().strict(),
        quietHours: z
          .object({ enabled: z.boolean(), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Orario HH:MM.'), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Orario HH:MM.') })
          .partial()
          .strict(),
        maxPushPerHour: z.number().int().min(1).max(30),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

module.exports = { register, login, updateMe };
