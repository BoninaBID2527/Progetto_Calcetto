'use strict';

const { Match } = require('../models');
const { conflict, notFound, unprocessable, forbidden } = require('../utils/AppError');
const { sameId, matchDayLabel, idOf } = require('../utils/helpers');
const { getField, PLAYED_STATUSES } = require('../config/appConfig');
const { userResolver } = require('./dto');
const nicknameService = require('./nicknameService');
const notificationService = require('./notificationService');
const chatService = require('./chatService');
const realtime = require('./realtime');

// ------------------------------------------------------------------ DTO

const quotaCents = (match, confirmed) => (match.costCents > 0 && confirmed > 0 ? Math.ceil(match.costCents / confirmed) : null);

function toDto(match, resolve) {
  const confirmed = match.participants.filter((p) => p.response === 'ci_sono');
  const waiting = match.participants
    .filter((p) => p.response === 'attesa')
    .sort((a, b) => new Date(a.waitlistedAt) - new Date(b.waitlistedAt));
  const others = match.participants.filter((p) => p.response === 'forse' || p.response === 'non_ci_sono');
  const participant = (p) => ({
    user: resolve(p.user),
    response: p.response,
    respondedAt: p.respondedAt,
    waitlistedAt: p.waitlistedAt,
    promotedAt: p.promotedAt,
    paid: Boolean(p.paid),
  });
  const team = (t) => (t ? { name: t.name, players: t.players.map((id) => resolve(id)) } : null);

  return {
    id: idOf(match),
    groupId: String(match.group),
    organizer: resolve(match.organizer),
    field: match.field,
    startsAt: match.startsAt,
    durationMinutes: match.durationMinutes,
    costCents: match.costCents,
    slots: match.slots,
    freeSlots: match.freeSlots,
    notes: match.notes,
    status: match.status,
    participants: [...confirmed, ...waiting, ...others].map(participant),
    counts: {
      ci_sono: confirmed.length,
      attesa: waiting.length,
      forse: match.participants.filter((p) => p.response === 'forse').length,
      non_ci_sono: match.participants.filter((p) => p.response === 'non_ci_sono').length,
    },
    quotaCents: quotaCents(match, confirmed.length),
    paidCount: confirmed.filter((p) => p.paid).length,
    teams: match.teams
      ? { a: team(match.teams.a), b: team(match.teams.b), method: match.teams.method, updatedAt: match.teams.updatedAt }
      : null,
    result: match.result
      ? {
          scoreA: match.result.scoreA,
          scoreB: match.result.scoreB,
          scorers: (match.result.scorers || []).map((s) => ({ user: resolve(s.user), goals: s.goals })),
          recordedAt: match.result.recordedAt,
        }
      : null,
    voting: match.voting
      ? {
          opensAt: match.voting.opensAt,
          closesAt: match.voting.closesAt,
          closed: match.voting.closed,
          mvp: (match.voting.mvp || []).map((id) => resolve(id)),
        }
      : null,
    prizePoll: match.prizePoll
      ? {
          options: match.prizePoll.options.map((o) => ({ key: o.key, label: o.label, emoji: o.emoji })),
          closed: match.prizePoll.closed,
          winners: match.prizePoll.winners || [],
        }
      : null,
    createdAt: match.createdAt,
  };
}

function userIdsOf(match) {
  return [
    match.organizer,
    ...match.participants.map((p) => p.user),
    ...(match.teams ? [...(match.teams.a?.players || []), ...(match.teams.b?.players || [])] : []),
    ...(match.result?.scorers || []).map((s) => s.user),
    ...(match.voting?.mvp || []),
  ];
}

async function toDtos(matches) {
  if (!matches.length) return [];
  const nicknames = await nicknameService.activeMap(matches[0].group);
  const resolve = await userResolver(matches.flatMap(userIdsOf), nicknames);
  return matches.map((m) => toDto(m, resolve));
}

async function dtoOf(match) {
  return (await toDtos([match]))[0];
}

/** Ricarica la partita, la trasmette al gruppo e restituisce il DTO. */
async function broadcast(matchId, event = 'match:updated') {
  const fresh = await Match.findById(matchId).lean();
  const dto = await dtoOf(fresh);
  realtime.toGroup(fresh.group, event, dto);
  return dto;
}

const fieldName = (key) => getField(key)?.name || key;
const dayOf = (match) => matchDayLabel(new Date(match.startsAt));

// ------------------------------------------------------------------ creazione e modifica

function assertFuture(startsAt) {
  if (new Date(startsAt).getTime() <= Date.now()) {
    throw unprocessable('La data della partita è nel passato.', { startsAt: 'Scegli una data e un orario futuri.' });
  }
}

async function create(group, user, data) {
  if (group.settings.organizers === 'admin') {
    const me = group.members.find((m) => sameId(m.user, user._id));
    if (me.role !== 'admin') throw forbidden('In questo gruppo solo gli admin possono creare partite.');
  }
  assertFuture(data.startsAt);
  const match = await Match.create({ ...data, group: group._id, organizer: user._id, freeSlots: data.slots });
  const dto = await dtoOf(match.toObject());
  realtime.toGroup(group._id, 'match:created', dto);

  const day = dayOf(match);
  const others = group.members.map((m) => m.user).filter((id) => !sameId(id, user._id));
  await notificationService.notify(others, {
    type: 'nuova_partita',
    title: `Nuova partita ${day} a ${fieldName(match.field)}`,
    body: `${user.name} ha aperto le iscrizioni: ${match.slots} posti. Ci sei?`,
    link: `/partite/${match._id}`,
    group: group._id,
  });
  await chatService.postSystem(group._id, `${user.name} ha creato una partita a ${fieldName(match.field)} per ${day}. Iscrizioni aperte!`);
  return dto;
}

async function list(group, { scope = 'prossime', limit = 50 }) {
  const upcoming = ['aperta', 'chiusa'];
  const filter = { group: group._id };
  if (scope === 'prossime') filter.status = { $in: upcoming };
  if (scope === 'passate') filter.status = { $nin: upcoming };
  const sort = scope === 'prossime' ? { startsAt: 1 } : { startsAt: -1 };
  const matches = await Match.find(filter).sort(sort).limit(limit).lean();
  return toDtos(matches);
}

async function update(match, data) {
  if (!['aperta', 'chiusa'].includes(match.status)) throw conflict('Una partita già giocata o annullata non si può modificare.');
  if (data.startsAt) assertFuture(data.startsAt);
  const { slots, ...set } = data;
  const withSet = (extra) => (Object.keys(set).length ? { $set: set, ...extra } : extra);
  let updated;
  if (slots !== undefined && slots !== match.slots) {
    const delta = slots - match.slots;
    // Atomico: si possono togliere posti solo se sono ancora liberi.
    updated = await Match.findOneAndUpdate(
      { _id: match._id, freeSlots: { $gte: Math.max(0, -delta) } },
      withSet({ $inc: { slots: delta, freeSlots: delta } }),
      { new: true }
    );
    if (!updated) {
      const confirmed = match.participants.filter((p) => p.response === 'ci_sono').length;
      throw conflict(`Ci sono già ${confirmed} presenti: non puoi scendere sotto questo numero di posti.`, {
        slots: `Minimo ${confirmed}.`,
      });
    }
    if (delta > 0) await promoteWaitlist(match._id);
  } else if (Object.keys(set).length) {
    updated = await Match.findByIdAndUpdate(match._id, { $set: set }, { new: true });
  } else {
    updated = match;
  }
  return broadcast(updated._id);
}

// ------------------------------------------------------------------ stati

const TRANSITIONS = {
  aperta: ['chiusa', 'annullata'],
  chiusa: ['aperta', 'annullata'],
  giocata: ['archiviata'],
  archiviata: [],
  annullata: [],
};

const STATUS_LABEL = { aperta: 'aperta', chiusa: 'chiusa', giocata: 'giocata', archiviata: 'archiviata', annullata: 'annullata' };

async function changeStatus(match, user, status) {
  if (!TRANSITIONS[match.status].includes(status)) {
    throw conflict(`Non puoi passare una partita da ${STATUS_LABEL[match.status]} a ${STATUS_LABEL[status]}.`);
  }
  if (status === 'aperta' && new Date(match.startsAt) <= new Date()) {
    throw conflict("La partita è già iniziata: non si può riaprire.");
  }
  if (status === 'archiviata') {
    const votingService = require('./votingService');
    await votingService.finalize(match._id, { force: true });
  }
  const updated = await Match.findOneAndUpdate({ _id: match._id, status: match.status }, { $set: { status } }, { new: true });
  if (!updated) throw conflict('La partita è stata modificata nel frattempo. Ricarica e riprova.');
  if (status === 'aperta') await promoteWaitlist(match._id);

  const involved = match.participants.filter((p) => p.response !== 'non_ci_sono').map((p) => p.user);
  const day = dayOf(match);
  if (status === 'chiusa') {
    await notificationService.notify(involved.filter((id) => !sameId(id, user._id)), {
      type: 'partita_chiusa',
      title: `Iscrizioni chiuse per ${day}`,
      body: `La partita a ${fieldName(match.field)} è al completo: si gioca!`,
      link: `/partite/${match._id}`,
      group: match.group,
    });
  }
  if (status === 'annullata') {
    await notificationService.notify(involved.filter((id) => !sameId(id, user._id)), {
      type: 'partita_annullata',
      title: `Partita di ${day} annullata`,
      body: `${user.name} ha annullato la partita a ${fieldName(match.field)}.`,
      link: `/partite/${match._id}`,
      group: match.group,
    });
    await chatService.postSystem(match.group, `La partita di ${day} a ${fieldName(match.field)} è stata annullata.`);
  }
  return broadcast(match._id);
}

/** Chiusura automatica all'orario d'inizio (usata dal programma periodico). */
async function autoClose(now = new Date()) {
  const due = await Match.find({ status: 'aperta', startsAt: { $lte: now } }).select('_id').lean();
  for (const { _id } of due) {
    const updated = await Match.findOneAndUpdate({ _id, status: 'aperta' }, { $set: { status: 'chiusa' } }, { new: true });
    if (updated) await broadcast(_id);
  }
  return due.length;
}

// ------------------------------------------------------------------ iscrizioni

/**
 * Fa entrare chi è in lista d'attesa finché ci sono posti liberi, in ordine
 * di arrivo. Ogni ingresso è un'operazione atomica che richiede un posto
 * libero e che la persona sia ancora in attesa.
 */
async function promoteWaitlist(matchId) {
  const promoted = [];
  for (let guard = 0; guard < 100; guard++) {
    const m = await Match.findById(matchId).lean();
    if (!m || m.status !== 'aperta' || m.freeSlots <= 0) break;
    const next = m.participants
      .filter((p) => p.response === 'attesa')
      .sort((a, b) => new Date(a.waitlistedAt) - new Date(b.waitlistedAt))[0];
    if (!next) break;
    const updated = await Match.findOneAndUpdate(
      { _id: matchId, status: 'aperta', freeSlots: { $gt: 0 }, participants: { $elemMatch: { user: next.user, response: 'attesa' } } },
      {
        $set: { 'participants.$[p].response': 'ci_sono', 'participants.$[p].promotedAt': new Date() },
        $inc: { freeSlots: -1 },
      },
      { new: true, arrayFilters: [{ 'p.user': next.user }] }
    );
    if (updated) promoted.push(next.user);
  }

  if (promoted.length) {
    const m = await Match.findById(matchId).lean();
    const resolve = await userResolver(promoted);
    const day = dayOf(m);
    await notificationService.notify(promoted, {
      type: 'promozione',
      title: `Sei dentro per ${day}!`,
      body: `Si è liberato un posto a ${fieldName(m.field)}: sei passato dalla lista d'attesa ai presenti.`,
      link: `/partite/${matchId}`,
      group: m.group,
    });
    for (const id of promoted) {
      await chatService.postSystem(m.group, `${resolve(id).name} entra dalla lista d'attesa per ${day}.`);
    }
  }
  return promoted;
}

/**
 * Registra la risposta "Ci sono", "Forse" o "Non ci sono". Ogni ramo è un
 * singolo findOneAndUpdate con condizioni: due persone non possono prendere
 * lo stesso ultimo posto e chi è in lista d'attesa non viene scavalcato.
 */
async function respond(match, user, response) {
  if (match.status !== 'aperta') throw conflict('La partita è chiusa: non si accettano più risposte.');
  const uid = user._id;
  const now = new Date();
  const mine = match.participants.find((p) => sameId(p.user, uid));
  const base = { _id: match._id, status: 'aperta' };
  const asMe = { arrayFilters: [{ 'me.user': uid }], new: true };
  let updated = null;
  let outcome = response;
  let freedSlot = false;

  if (response === 'ci_sono') {
    if (mine?.response === 'ci_sono') throw conflict('Sei già iscritto a questa partita.');
    if (mine?.response === 'attesa') throw conflict("Sei già in lista d'attesa.");
    const takeSlot = { freeSlots: { $gt: 0 }, 'participants.response': { $ne: 'attesa' } };
    if (!mine) {
      const filter = { ...base, 'participants.user': { $ne: uid } };
      updated = await Match.findOneAndUpdate(
        { ...filter, ...takeSlot },
        { $push: { participants: { user: uid, response: 'ci_sono', respondedAt: now } }, $inc: { freeSlots: -1 } },
        { new: true }
      );
      if (!updated) {
        outcome = 'attesa';
        updated = await Match.findOneAndUpdate(
          filter,
          { $push: { participants: { user: uid, response: 'attesa', respondedAt: now, waitlistedAt: now } } },
          { new: true }
        );
      }
    } else {
      const filter = { ...base, participants: { $elemMatch: { user: uid, response: mine.response } } };
      updated = await Match.findOneAndUpdate(
        { ...filter, ...takeSlot },
        { $set: { 'participants.$[me].response': 'ci_sono', 'participants.$[me].respondedAt': now }, $inc: { freeSlots: -1 } },
        asMe
      );
      if (!updated) {
        outcome = 'attesa';
        updated = await Match.findOneAndUpdate(
          filter,
          { $set: { 'participants.$[me].response': 'attesa', 'participants.$[me].respondedAt': now, 'participants.$[me].waitlistedAt': now } },
          asMe
        );
      }
    }
  } else {
    if (mine?.response === response) throw conflict('Hai già dato questa risposta.');
    if (!mine) {
      updated = await Match.findOneAndUpdate(
        { ...base, 'participants.user': { $ne: uid } },
        { $push: { participants: { user: uid, response, respondedAt: now } } },
        { new: true }
      );
    } else {
      freedSlot = mine.response === 'ci_sono';
      updated = await Match.findOneAndUpdate(
        { ...base, participants: { $elemMatch: { user: uid, response: mine.response } } },
        {
          $set: {
            'participants.$[me].response': response,
            'participants.$[me].respondedAt': now,
            'participants.$[me].waitlistedAt': null,
            'participants.$[me].paid': false,
          },
          ...(freedSlot ? { $inc: { freeSlots: 1 } } : {}),
        },
        asMe
      );
    }
  }

  if (!updated) {
    // Qualcun altro ha cambiato la partita tra la lettura e la scrittura.
    const fresh = await Match.findById(match._id).lean();
    if (!fresh) throw notFound('Partita non trovata.');
    if (fresh.status !== 'aperta') throw conflict('La partita è chiusa: non si accettano più risposte.');
    const now2 = fresh.participants.find((p) => sameId(p.user, uid));
    if (now2 && ['ci_sono', 'attesa'].includes(now2.response) && response === 'ci_sono') {
      throw conflict('Sei già iscritto a questa partita.');
    }
    throw conflict('La partita è cambiata nel frattempo: riprova.');
  }

  if (freedSlot && updated.teams) {
    await Match.updateOne(
      { _id: match._id, teams: { $ne: null } },
      { $pull: { 'teams.a.players': uid, 'teams.b.players': uid } }
    );
  }

  const day = dayOf(updated);
  if (outcome === 'ci_sono') await chatService.postSystem(match.group, `${user.name} ci sarà alla partita di ${day}.`);
  if (outcome === 'attesa') await chatService.postSystem(match.group, `${user.name} è in lista d'attesa per ${day}.`);
  if (freedSlot) await chatService.postSystem(match.group, `${user.name} non ci sarà più ${day}: si libera un posto.`);

  const promoted = freedSlot ? await promoteWaitlist(match._id) : [];
  const dto = await broadcast(match._id);
  return { match: dto, outcome, promoted: promoted.map(String) };
}

async function setPayment(match, actor, isManager, targetId, paid) {
  const target = match.participants.find((p) => sameId(p.user, targetId));
  if (!target || target.response !== 'ci_sono') {
    throw unprocessable('La quota riguarda solo i presenti.', { userId: 'Questa persona non è tra i presenti.' });
  }
  if (!sameId(actor._id, targetId) && !isManager) {
    throw forbidden("Puoi segnare solo il tuo pagamento; gli altri li gestisce l'organizzatore.");
  }
  await Match.updateOne(
    { _id: match._id },
    { $set: { 'participants.$[t].paid': paid, 'participants.$[t].paidUpdatedBy': actor._id } },
    { arrayFilters: [{ 't.user': target.user }] }
  );
  return broadcast(match._id);
}

module.exports = {
  toDto,
  toDtos,
  dtoOf,
  broadcast,
  create,
  list,
  update,
  changeStatus,
  autoClose,
  respond,
  promoteWaitlist,
  setPayment,
  fieldName,
  dayOf,
  PLAYED_STATUSES,
};
