'use strict';

/*
 * BONCALL: convocazioni per trovare giocatori.
 * Modalità "fissa" (giorno, ora e campo decisi; posti contati come le partite)
 * o "opzioni" (più alternative tra cui ognuno indica quando può).
 * Vedi docs/ARCHITETTURA.md, sezione BONCALL.
 */
const { Poll, Match, Group } = require('../models');
const { conflict, forbidden, notFound, unprocessable } = require('../utils/AppError');
const { sameId, matchDayLabel } = require('../utils/helpers');
const { getField } = require('../config/appConfig');
const { userResolver } = require('./dto');
const registration = require('./registration');
const notificationService = require('./notificationService');
const chatService = require('./chatService');
const activityService = require('./activityService');
const realtime = require('./realtime');

const OPEN = ['aperta', 'completa'];
const HOUR = 3_600_000;
const timeFmt = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

const fieldName = (key) => getField(key)?.name || key;
const pollLink = (poll) => `/boncall/${poll._id}`;

// ------------------------------------------------------------------ DTO

function availability(poll) {
  const confirmed = poll.responses.filter((r) => r.response === 'ci_sono');
  return poll.options.map((o) => ({ ...o, users: confirmed.filter((r) => r.options.includes(o.key)).map((r) => r.user) }));
}

function bestOption(poll) {
  const opts = availability(poll);
  return opts.reduce((best, o) => (!best || o.users.length > best.users.length ? o : best), null);
}

/** Quanti giocatori mancano: posti liberi (fissa) o distanza dall'alternativa migliore (opzioni). */
function missingOf(poll) {
  if (poll.mode === 'fissa') return poll.freeSlots;
  return Math.max(0, poll.playersNeeded - (bestOption(poll)?.users.length || 0));
}

function toDto(poll, resolve) {
  const by = (r) => poll.responses.filter((x) => x.response === r);
  const waiting = by('attesa').sort((a, b) => new Date(a.waitlistedAt) - new Date(b.waitlistedAt));
  const confirmed = by('ci_sono').sort((a, b) => new Date(a.respondedAt) - new Date(b.respondedAt));
  const best = poll.mode === 'opzioni' ? bestOption(poll) : null;
  const response = (r) => ({
    user: resolve(r.user),
    response: r.response,
    options: r.options || [],
    respondedAt: r.respondedAt,
    waitlistedAt: r.waitlistedAt,
    promotedAt: r.promotedAt,
  });
  return {
    id: String(poll._id),
    groupId: String(poll.group),
    author: resolve(poll.author),
    mode: poll.mode,
    field: poll.field,
    startsAt: poll.startsAt,
    options: availability(poll).map((o) => ({ key: o.key, startsAt: o.startsAt, field: o.field, available: o.users.length, users: o.users.map(resolve) })),
    playersNeeded: poll.playersNeeded,
    durationMinutes: poll.durationMinutes,
    costCents: poll.costCents,
    notes: poll.notes,
    deadline: poll.deadline,
    status: poll.status,
    matchId: poll.match ? String(poll.match) : null,
    chosenOption: poll.chosenOption,
    bestOption: best ? best.key : null,
    freeSlots: poll.freeSlots,
    missing: missingOf(poll),
    counts: { ci_sono: confirmed.length, attesa: waiting.length, forse: by('forse').length, non_ci_sono: by('non_ci_sono').length },
    responses: [...confirmed, ...waiting, ...by('forse'), ...by('non_ci_sono')].map(response),
    createdAt: poll.createdAt,
  };
}

async function toDtos(polls) {
  if (!polls.length) return [];
  const { activeMap } = require('./nicknameService');
  const ids = polls.flatMap((p) => [p.author, ...p.responses.map((r) => r.user)]);
  const resolve = await userResolver(ids, await activeMap(polls[0].group));
  return polls.map((p) => toDto(p, resolve));
}

async function dtoOf(poll) {
  return (await toDtos([poll]))[0];
}

async function broadcast(pollId) {
  const fresh = await Poll.findById(pollId).lean();
  const dto = await dtoOf(fresh);
  realtime.toGroup(fresh.group, 'poll:updated', dto);
  return dto;
}

// ------------------------------------------------------------------ aiuti

function whenLabel(poll) {
  if (poll.mode === 'fissa') return matchDayLabel(new Date(poll.startsAt));
  return 'la prossima partita';
}

async function membersOf(groupId) {
  const group = await Group.findById(groupId).lean();
  return group ? group.members.map((m) => String(m.user)) : [];
}

/** Chi non ha ancora risposto (più, a richiesta, chi ha detto "forse"). */
async function silentMembers(poll, { includeMaybe = false } = {}) {
  const answered = new Set(poll.responses.filter((r) => !(includeMaybe && r.response === 'forse')).map((r) => String(r.user)));
  return (await membersOf(poll.group)).filter((id) => !answered.has(id));
}

/** Prenota un avviso: restituisce true solo alla prima chiamata. */
async function claimAlert(pollId, name) {
  const claimed = await Poll.findOneAndUpdate({ _id: pollId, [`alerts.${name}`]: null }, { $set: { [`alerts.${name}`]: new Date() } });
  return Boolean(claimed);
}

function assertCanOrganize(group, user) {
  const me = group.members.find((m) => sameId(m.user, user._id));
  if (group.settings.organizers === 'admin' && me?.role !== 'admin') {
    throw forbidden('In questo gruppo solo gli admin possono aprire convocazioni.');
  }
}

function assertCanManage(poll, group, user) {
  const me = group.members.find((m) => sameId(m.user, user._id));
  if (!sameId(poll.author, user._id) && me?.role !== 'admin') {
    throw forbidden("Solo chi ha aperto la convocazione o un admin del gruppo può farlo.");
  }
}

// ------------------------------------------------------------------ creazione

async function create(group, author, data) {
  assertCanOrganize(group, author);
  const now = Date.now();
  if (data.deadline.getTime() <= now) throw unprocessable('La scadenza è nel passato.', { deadline: 'Scegli una scadenza futura.' });
  let options = [];
  if (data.mode === 'fissa') {
    if (data.startsAt.getTime() <= now) throw unprocessable('La data della partita è nel passato.', { startsAt: 'Scegli una data futura.' });
    if (data.deadline > data.startsAt) throw unprocessable("La scadenza deve arrivare prima dell'inizio.", { deadline: "Prima dell'orario della partita." });
  } else {
    options = data.options.map((o, i) => ({ key: `o${i + 1}`, startsAt: o.startsAt, field: o.field }));
    if (options.some((o) => o.startsAt.getTime() <= now)) throw unprocessable('Una delle alternative è nel passato.', { options: 'Tutte le alternative devono essere future.' });
    const first = Math.min(...options.map((o) => o.startsAt.getTime()));
    if (data.deadline.getTime() > first) throw unprocessable('La scadenza deve arrivare prima della prima alternativa.', { deadline: 'Anticipa la scadenza.' });
  }
  const authorPlays = data.authorPlays !== false;
  const responses = authorPlays
    ? [{ user: author._id, response: 'ci_sono', options: options.map((o) => o.key), respondedAt: new Date() }]
    : [];
  const poll = await Poll.create({
    group: group._id,
    author: author._id,
    mode: data.mode,
    field: data.mode === 'fissa' ? data.field : null,
    startsAt: data.mode === 'fissa' ? data.startsAt : null,
    options,
    playersNeeded: data.playersNeeded,
    durationMinutes: data.durationMinutes,
    costCents: data.costCents,
    notes: data.notes,
    deadline: data.deadline,
    responses,
    freeSlots: data.playersNeeded - (authorPlays && data.mode === 'fissa' ? 1 : 0),
  });

  const dto = await dtoOf(poll.toObject());
  realtime.toGroup(group._id, 'poll:created', dto);
  await activityService.record(group._id, 'boncall_aperta', {
    actor: author._id,
    poll: poll._id,
    data: { mode: poll.mode, field: poll.field, startsAt: poll.startsAt, playersNeeded: poll.playersNeeded },
    key: `boncall:${poll._id}`,
  });

  const missing = dto.missing;
  const title = poll.mode === 'fissa' ? `⚽ Si cerca gente per ${whenLabel(poll)}!` : '⚽ Si cerca gente: quando puoi giocare?';
  const body =
    poll.mode === 'fissa'
      ? `${author.name} ha aperto le convocazioni per ${fieldName(poll.field)} alle ${timeFmt.format(poll.startsAt)}. ${missing === 1 ? 'Manca 1 giocatore' : `Mancano ${missing} giocatori`}.`
      : `${author.name} propone ${options.length} alternative: scegli quando ci sei. Servono ${poll.playersNeeded} giocatori.`;
  const others = group.members.map((m) => String(m.user)).filter((id) => !sameId(id, author._id));
  await notificationService.notify(others, { type: 'boncall', title, body, link: pollLink(poll), group: group._id, dedupeKey: `boncall:new:${poll._id}` });
  await chatService.postSystem(group._id, `📣 BONCALL di ${author.name}: ${poll.mode === 'fissa' ? `${fieldName(poll.field)}, ${whenLabel(poll)} alle ${timeFmt.format(poll.startsAt)}` : `${options.length} alternative da votare`}. Rispondi dalla convocazione!`);
  return dto;
}

async function list(group, { scope = 'aperte' } = {}) {
  const filter = { group: group._id, ...(scope === 'aperte' ? { status: { $in: OPEN } } : {}) };
  const polls = await Poll.find(filter).sort(scope === 'aperte' ? { deadline: 1 } : { createdAt: -1 }).limit(30).lean();
  return toDtos(polls);
}

// ------------------------------------------------------------------ risposte

const openFilter = () => ({ status: { $in: OPEN }, deadline: { $gt: new Date() } });
const CLOSED = 'La convocazione non accetta più risposte.';

async function respondWithOptions(poll, uid, response, options) {
  const keys = poll.options.map((o) => o.key);
  if (response === 'ci_sono') {
    if (!options?.length) throw unprocessable('Indica almeno un\'alternativa in cui ci sei.', { options: 'Scegli almeno una data.' });
    if (options.some((k) => !keys.includes(k))) throw unprocessable('Alternativa non valida.', { options: 'Alternativa inesistente.' });
  }
  const chosen = response === 'ci_sono' ? [...new Set(options)] : [];
  const now = new Date();
  const mine = poll.responses.find((r) => sameId(r.user, uid));
  const updated = mine
    ? await Poll.findOneAndUpdate(
        { _id: poll._id, ...openFilter(), 'responses.user': uid },
        { $set: { 'responses.$[me].response': response, 'responses.$[me].options': chosen, 'responses.$[me].respondedAt': now } },
        { new: true, arrayFilters: [{ 'me.user': uid }] }
      )
    : await Poll.findOneAndUpdate(
        { _id: poll._id, ...openFilter(), 'responses.user': { $ne: uid } },
        { $push: { responses: { user: uid, response, options: chosen, respondedAt: now } } },
        { new: true }
      );
  if (!updated) {
    if (!(await Poll.exists({ _id: poll._id, ...openFilter() }))) throw conflict(CLOSED);
    throw conflict('È cambiato qualcosa nel frattempo: riprova.');
  }
  return { outcome: response };
}

async function respond(poll, user, { response, options }) {
  if (!OPEN.includes(poll.status) || new Date(poll.deadline) <= new Date()) throw conflict(CLOSED);
  const uid = user._id;
  let outcome;
  let promoted = [];
  if (poll.mode === 'fissa') {
    const res = await registration.register(Poll, poll, uid, response, { field: 'responses', open: openFilter(), closedMessage: CLOSED });
    outcome = res.outcome;
    if (res.freedSlot) {
      promoted = await registration.promoteWaitlist(Poll, poll._id, { field: 'responses', open: { status: { $in: OPEN } } });
      if (promoted.length) {
        await notificationService.notify(promoted, {
          type: 'boncall',
          title: `Sei dentro per ${whenLabel(poll)}!`,
          body: "Si è liberato un posto nella convocazione e sei passato dalla lista d'attesa ai confermati.",
          link: pollLink(poll),
          group: poll.group,
          dedupeKey: `boncall:promosso:${poll._id}:${new Date().toISOString().slice(0, 13)}`,
        });
      }
    }
  } else {
    ({ outcome } = await respondWithOptions(poll, uid, response, options));
  }
  await afterChange(poll._id);
  const dto = await broadcast(poll._id);
  return { poll: dto, outcome, promoted: promoted.map(String) };
}

/** Dopo ogni risposta: completamento, riapertura e avvisi "mancano N". */
async function afterChange(pollId) {
  const p = await Poll.findById(pollId).lean();
  if (!p || !OPEN.includes(p.status)) return;
  const missing = missingOf(p);
  const best = p.mode === 'opzioni' ? bestOption(p) : null;

  if (missing === 0 && p.status === 'aperta') {
    const done = await Poll.findOneAndUpdate({ _id: pollId, status: 'aperta' }, { $set: { status: 'completa', chosenOption: best?.key || null } }, { new: true });
    if (done && (await claimAlert(pollId, 'completed'))) {
      await notificationService.notify([String(p.author)], {
        type: 'boncall',
        title: 'Convocazione completa!',
        body: `Ci sono tutti i ${p.playersNeeded} giocatori: trasformala in partita.`,
        link: pollLink(p),
        group: p.group,
        dedupeKey: `boncall:completa:${pollId}`,
      });
      await activityService.record(p.group, 'boncall_completa', { poll: pollId, actor: p.author, key: `boncall:completa:${pollId}` });
    }
    return;
  }

  if (missing > 0 && p.status === 'completa') {
    const reopened = await Poll.findOneAndUpdate({ _id: pollId, status: 'completa' }, { $set: { status: 'aperta' } }, { new: true });
    if (reopened) {
      const targets = await silentMembers(reopened, { includeMaybe: true });
      await notificationService.notify(targets, {
        type: 'boncall',
        title: `Si è liberato un posto per ${whenLabel(p)}`,
        body: 'Qualcuno si è ritirato dalla convocazione: c\'è di nuovo spazio.',
        link: pollLink(p),
        group: p.group,
        // Al massimo un avviso all'ora per convocazione.
        dedupeKey: `boncall:posto:${pollId}:${new Date().toISOString().slice(0, 13)}`,
      });
    }
  }

  if (missing === 1 || missing === 2) {
    if (await claimAlert(pollId, `missing${missing}`)) {
      const targets = await silentMembers(p, { includeMaybe: true });
      await notificationService.notify(targets, {
        type: 'boncall',
        title: missing === 1 ? `Manca 1 giocatore per ${whenLabel(p)}!` : `Mancano 2 giocatori per ${whenLabel(p)}`,
        body: 'Basta un "Ci sono" per chiudere la convocazione.',
        link: pollLink(p),
        group: p.group,
        dedupeKey: `boncall:missing${missing}:${pollId}`,
      });
    }
  }
}

// ------------------------------------------------------------------ conversione

/**
 * Trasforma la convocazione in partita. Idempotente: l'indice unico su
 * Match.fromPoll impedisce due partite dalla stessa convocazione, e una
 * seconda chiamata restituisce la partita già creata.
 */
async function convert(poll, group, user, { option } = {}) {
  const matchService = require('./matchService');
  assertCanManage(poll, group, user);
  const existing = await Match.findOne({ fromPoll: poll._id }).lean();
  if (existing) {
    await Poll.updateOne({ _id: poll._id, status: { $ne: 'convertita' } }, { $set: { status: 'convertita', match: existing._id } });
    return { match: await matchService.dtoOf(existing), poll: await broadcast(poll._id), created: false };
  }
  if (!OPEN.includes(poll.status)) throw conflict('Questa convocazione non si può più trasformare in partita.');

  let startsAt;
  let field;
  let chosen = null;
  let participants;
  const now = new Date();
  if (poll.mode === 'fissa') {
    ({ startsAt, field } = poll);
    participants = poll.responses.map((r) => ({
      user: r.user,
      response: r.response,
      respondedAt: r.respondedAt,
      waitlistedAt: r.response === 'attesa' ? r.waitlistedAt : null,
    }));
  } else {
    chosen = option || poll.chosenOption || bestOption(poll)?.key;
    const opt = poll.options.find((o) => o.key === chosen);
    if (!opt) throw unprocessable('Scegli una delle alternative.', { option: 'Alternativa non valida.' });
    ({ startsAt, field } = opt);
    const available = poll.responses
      .filter((r) => r.response === 'ci_sono' && r.options.includes(chosen))
      .sort((a, b) => new Date(a.respondedAt) - new Date(b.respondedAt));
    participants = [
      ...available.map((r, i) =>
        i < poll.playersNeeded
          ? { user: r.user, response: 'ci_sono', respondedAt: r.respondedAt }
          : { user: r.user, response: 'attesa', respondedAt: r.respondedAt, waitlistedAt: r.respondedAt }
      ),
      ...poll.responses.filter((r) => r.response === 'forse').map((r) => ({ user: r.user, response: 'forse', respondedAt: r.respondedAt })),
    ];
  }
  if (new Date(startsAt) <= now) throw unprocessable("La data scelta è già passata: apri una nuova convocazione.", { option: 'Data passata.' });
  const confirmed = participants.filter((p) => p.response === 'ci_sono').length;
  if (confirmed < 2) throw unprocessable('Servono almeno 2 giocatori confermati per creare la partita.');

  let match;
  let created = true;
  try {
    match = await Match.create({
      group: poll.group,
      organizer: poll.author,
      field,
      startsAt,
      durationMinutes: poll.durationMinutes,
      costCents: poll.costCents,
      slots: poll.playersNeeded,
      freeSlots: Math.max(0, poll.playersNeeded - confirmed),
      notes: poll.notes,
      participants,
      fromPoll: poll._id,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    match = await Match.findOne({ fromPoll: poll._id });
    created = false;
  }
  await Poll.updateOne({ _id: poll._id }, { $set: { status: 'convertita', match: match._id, chosenOption: chosen } });

  const matchDto = await matchService.dtoOf(match.toObject ? match.toObject() : match);
  if (created) {
    realtime.toGroup(poll.group, 'match:created', matchDto);
    const day = matchDayLabel(new Date(startsAt));
    const involved = participants.map((p) => String(p.user)).filter((id) => !sameId(id, user._id));
    await notificationService.notify(involved, {
      type: 'boncall',
      title: `Si gioca ${day}!`,
      body: `La convocazione è diventata una partita a ${fieldName(field)} alle ${timeFmt.format(new Date(startsAt))}.`,
      link: `/partite/${match._id}`,
      group: poll.group,
      dedupeKey: `boncall:confermata:${poll._id}`,
    });
    await chatService.postSystem(poll.group, `✅ BONCALL confermata: si gioca ${day} a ${fieldName(field)} alle ${timeFmt.format(new Date(startsAt))}.`);
    await activityService.record(poll.group, 'boncall_confermata', { actor: user._id, poll: poll._id, match: match._id, key: `boncall:confermata:${poll._id}` });
  }
  return { match: matchDto, poll: await broadcast(poll._id), created };
}

async function cancel(poll, group, user) {
  assertCanManage(poll, group, user);
  const updated = await Poll.findOneAndUpdate({ _id: poll._id, status: { $in: OPEN } }, { $set: { status: 'annullata' } }, { new: true }).lean();
  if (!updated) throw conflict('La convocazione è già chiusa.');
  const involved = updated.responses.filter((r) => r.response !== 'non_ci_sono').map((r) => String(r.user)).filter((id) => !sameId(id, user._id));
  await notificationService.notify(involved, {
    type: 'boncall',
    title: 'Convocazione annullata',
    body: `${user.name} ha annullato la convocazione per ${whenLabel(updated)}.`,
    link: pollLink(updated),
    group: updated.group,
    dedupeKey: `boncall:annullata:${poll._id}`,
  });
  return broadcast(poll._id);
}

// ------------------------------------------------------------------ programma periodico

/** Scadenze, promemoria a metà tempo e avviso 2 ore prima della scadenza. */
async function runJobs(now = new Date()) {
  const stats = { expired: 0, reminders: 0, deadlineWarnings: 0 };
  const expiring = await Poll.find({
    $or: [{ status: 'aperta', deadline: { $lte: now } }, { status: 'completa', startsAt: { $lte: now } }],
  }).lean();
  for (const p of expiring) {
    const updated = await Poll.findOneAndUpdate({ _id: p._id, status: p.status }, { $set: { status: 'scaduta' } }, { new: true });
    if (!updated) continue;
    stats.expired += 1;
    if (await claimAlert(p._id, 'expired')) {
      await notificationService.notify([String(p.author)], {
        type: 'boncall',
        title: 'Convocazione scaduta',
        body: `${missingOf(p) ? `Mancavano ${missingOf(p)} giocatori.` : 'Non è stata trasformata in partita in tempo.'} Puoi aprirne una nuova.`,
        link: pollLink(p),
        group: p.group,
        dedupeKey: `boncall:scaduta:${p._id}`,
      });
    }
    await broadcast(p._id);
  }

  const open = await Poll.find({ status: 'aperta', deadline: { $gt: now } }).lean();
  for (const p of open) {
    const start = new Date(p.createdAt).getTime();
    const end = new Date(p.deadline).getTime();
    if (!p.alerts?.reminder && now.getTime() >= start + (end - start) / 2 && (await claimAlert(p._id, 'reminder'))) {
      const targets = await silentMembers(p);
      await notificationService.notify(targets, {
        type: 'promemoria',
        category: 'boncall',
        title: `Ci sei ${whenLabel(p)}?`,
        body: `La convocazione si chiude presto. ${missingOf(p) === 1 ? 'Manca 1 giocatore' : `Mancano ${missingOf(p)} giocatori`}.`,
        link: pollLink(p),
        group: p.group,
        dedupeKey: `boncall:reminder:${p._id}`,
      });
      stats.reminders += targets.length;
    }
    if (!p.alerts?.deadline && end - now.getTime() <= 2 * HOUR && (await claimAlert(p._id, 'deadline'))) {
      await notificationService.notify([String(p.author)], {
        type: 'boncall',
        title: 'La convocazione scade tra meno di 2 ore',
        body: missingOf(p) ? `Mancano ancora ${missingOf(p)} giocatori.` : 'Ci sono tutti: trasformala in partita.',
        link: pollLink(p),
        group: p.group,
        dedupeKey: `boncall:deadline:${p._id}`,
      });
      stats.deadlineWarnings += 1;
    }
  }
  return stats;
}

module.exports = { create, list, respond, convert, cancel, runJobs, toDto, toDtos, dtoOf, missingOf };
