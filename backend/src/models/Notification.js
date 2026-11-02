'use strict';

const { Schema, model } = require('mongoose');

const NOTIFICATION_TYPES = [
  'nuova_partita',
  'promozione',
  'partita_chiusa',
  'partita_annullata',
  'risultato',
  'votazione_aperta',
  'soprannome',
  'promemoria',
  'boncall',
  'sostituto',
  'achievement',
  'premio',
  'record',
  'rivalita',
];

// Categoria usata dalle preferenze dell'utente (in-app e push).
const CATEGORY_OF = {
  nuova_partita: 'partite',
  promozione: 'partite',
  partita_chiusa: 'partite',
  partita_annullata: 'partite',
  risultato: 'risultati',
  votazione_aperta: 'risultati',
  soprannome: 'social',
  promemoria: 'promemoria',
  boncall: 'boncall',
  sostituto: 'boncall',
  achievement: 'social',
  premio: 'social',
  record: 'social',
  rivalita: 'social',
};

// Notifiche che non si possono spegnere: riguardano un posto già preso o una partita saltata.
const CRITICAL = ['promozione', 'partita_annullata'];

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
    category: { type: String, default: null },
    // Stessa chiave = stessa notifica: impedisce i doppioni (vedi indice sotto).
    dedupeKey: { type: String, default: undefined },
    pushedAt: { type: Date, default: null },
    pushStatus: { type: String, enum: ['inviata', 'saltata', 'fallita', null], default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

module.exports = model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.CATEGORY_OF = CATEGORY_OF;
module.exports.CRITICAL = CRITICAL;
