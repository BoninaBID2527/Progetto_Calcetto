'use strict';

/*
 * Iscrizione atomica con posti contati e lista d'attesa, condivisa da
 * partite (campo "participants") e convocazioni BONCALL (campo "responses").
 *
 * Ogni ramo è un solo findOneAndUpdate con condizioni:
 *  - un posto si prende solo se freeSlots > 0 e nessuno è in lista d'attesa;
 *  - chi esce da "ci_sono" libera il posto nella stessa operazione;
 *  - l'ingresso dalla lista d'attesa richiede posto libero e persona ancora in attesa.
 */
const { conflict, notFound } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');

async function register(Model, doc, uid, response, { field = 'participants', open = { status: 'aperta' }, closedMessage, extra = {} } = {}) {
  const now = new Date();
  const mine = doc[field].find((p) => sameId(p.user, uid));
  const base = { _id: doc._id, ...open };
  const me = (key) => `${field}.$[me].${key}`;
  const asMe = { arrayFilters: [{ 'me.user': uid }], new: true };
  const takeSlot = { freeSlots: { $gt: 0 }, [`${field}.response`]: { $ne: 'attesa' } };
  const notListed = { [`${field}.user`]: { $ne: uid } };
  const elem = (resp) => ({ [field]: { $elemMatch: { user: uid, response: resp } } });
  const setExtra = Object.fromEntries(Object.entries(extra).map(([k, v]) => [me(k), v]));
  let updated = null;
  let outcome = response;
  let freedSlot = false;

  if (response === 'ci_sono') {
    if (mine?.response === 'ci_sono') throw conflict('Sei già tra i confermati.');
    if (mine?.response === 'attesa') throw conflict("Sei già in lista d'attesa.");
    if (!mine) {
      const entry = { user: uid, response: 'ci_sono', respondedAt: now, ...extra };
      updated = await Model.findOneAndUpdate({ ...base, ...notListed, ...takeSlot }, { $push: { [field]: entry }, $inc: { freeSlots: -1 } }, { new: true });
      if (!updated) {
        outcome = 'attesa';
        updated = await Model.findOneAndUpdate(
          { ...base, ...notListed },
          { $push: { [field]: { ...entry, response: 'attesa', waitlistedAt: now } } },
          { new: true }
        );
      }
    } else {
      updated = await Model.findOneAndUpdate(
        { ...base, ...elem(mine.response), ...takeSlot },
        { $set: { [me('response')]: 'ci_sono', [me('respondedAt')]: now, ...setExtra }, $inc: { freeSlots: -1 } },
        asMe
      );
      if (!updated) {
        outcome = 'attesa';
        updated = await Model.findOneAndUpdate(
          { ...base, ...elem(mine.response) },
          { $set: { [me('response')]: 'attesa', [me('respondedAt')]: now, [me('waitlistedAt')]: now, ...setExtra } },
          asMe
        );
      }
    }
  } else {
    if (mine?.response === response) throw conflict('Hai già dato questa risposta.');
    if (!mine) {
      updated = await Model.findOneAndUpdate(
        { ...base, ...notListed },
        { $push: { [field]: { user: uid, response, respondedAt: now, ...extra } } },
        { new: true }
      );
    } else {
      freedSlot = mine.response === 'ci_sono';
      updated = await Model.findOneAndUpdate(
        { ...base, ...elem(mine.response) },
        {
          $set: { [me('response')]: response, [me('respondedAt')]: now, [me('waitlistedAt')]: null, ...setExtra },
          ...(freedSlot ? { $inc: { freeSlots: 1 } } : {}),
        },
        asMe
      );
    }
  }

  if (!updated) {
    // Qualcuno ha cambiato il documento tra la lettura e la scrittura.
    const fresh = await Model.findById(doc._id).lean();
    if (!fresh) throw notFound();
    const stillOpen = await Model.exists(base);
    if (!stillOpen) throw conflict(closedMessage || 'Le risposte sono chiuse.');
    const now2 = fresh[field].find((p) => sameId(p.user, uid));
    if (now2 && ['ci_sono', 'attesa'].includes(now2.response) && response === 'ci_sono') throw conflict('Sei già tra i confermati.');
    throw conflict('È cambiato qualcosa nel frattempo: riprova.');
  }
  return { updated, outcome, freedSlot };
}

/** Fa entrare chi è in lista d'attesa, in ordine di arrivo, finché ci sono posti. */
async function promoteWaitlist(Model, id, { field = 'participants', open = { status: 'aperta' } } = {}) {
  const promoted = [];
  for (let guard = 0; guard < 100; guard++) {
    const doc = await Model.findOne({ _id: id, ...open }).lean();
    if (!doc || doc.freeSlots <= 0) break;
    const next = doc[field]
      .filter((p) => p.response === 'attesa')
      .sort((a, b) => new Date(a.waitlistedAt) - new Date(b.waitlistedAt))[0];
    if (!next) break;
    const updated = await Model.findOneAndUpdate(
      { _id: id, ...open, freeSlots: { $gt: 0 }, [field]: { $elemMatch: { user: next.user, response: 'attesa' } } },
      { $set: { [`${field}.$[p].response`]: 'ci_sono', [`${field}.$[p].promotedAt`]: new Date() }, $inc: { freeSlots: -1 } },
      { new: true, arrayFilters: [{ 'p.user': next.user }] }
    );
    if (updated) promoted.push(next.user);
  }
  return promoted;
}

module.exports = { register, promoteWaitlist };
