'use strict';

const { Schema, model } = require('mongoose');

const LEDGER_TYPES = ['quota', 'versamento', 'spesa', 'rimborso'];
const LEDGER_STATUSES = ['dichiarato', 'verificato', 'annullato'];

// Ogni passaggio di stato resta nello storico: chi, quando, da quale stato a quale.
const historySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    from: { type: String, default: null },
    to: { type: String, required: true },
    note: { type: String, default: '', maxlength: 200 },
  },
  { _id: false }
);

/*
 * Registro contabile interno del gruppo. Non muove denaro e non simula
 * transazioni: annota ciò che i membri dichiarano e ciò che chi riceve il
 * denaro (organizzatore o admin) conferma. Una voce non si cancella mai:
 * si annulla, e resta nello storico.
 *
 *  - quota:      un membro paga la sua parte di una partita (una per partita e membro)
 *  - versamento: un membro versa nella cassa comune
 *  - spesa:      costo del gruppo (pagato dalla cassa o anticipato da un membro)
 *  - rimborso:   restituzione di denaro a un membro
 */
const ledgerEntrySchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    type: { type: String, enum: LEDGER_TYPES, required: true },
    status: { type: String, enum: LEDGER_STATUSES, required: true },
    amountCents: { type: Number, required: true, min: 0, max: 1_000_000 },
    // Chi ha pagato (quota, versamento, spesa anticipata) o chi riceve (rimborso).
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    match: { type: Schema.Types.ObjectId, ref: 'Match', default: undefined },
    // Solo per le spese: pagate dalla cassa comune o anticipate da `user`.
    paidFrom: { type: String, enum: ['cassa', 'membro', null], default: null },
    note: { type: String, default: '', maxlength: 200 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '', maxlength: 200 },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ group: 1, createdAt: -1 });
ledgerEntrySchema.index({ group: 1, user: 1, status: 1 });
// Una sola quota per partita e membro: la richiesta doppia o simultanea non crea due voci.
ledgerEntrySchema.index({ match: 1, user: 1 }, { unique: true, partialFilterExpression: { type: 'quota', match: { $type: 'objectId' } } });

module.exports = model('LedgerEntry', ledgerEntrySchema);
module.exports.LEDGER_TYPES = LEDGER_TYPES;
module.exports.LEDGER_STATUSES = LEDGER_STATUSES;
