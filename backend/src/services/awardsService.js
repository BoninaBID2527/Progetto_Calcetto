'use strict';

/*
 * Premi di partita opzionali. Quelli oggettivi (bomber della serata) sono
 * calcolati dai marcatori; quelli soggettivi si decidono con una votazione
 * anonima tra chi ha giocato oppure li assegna l'organizzatore. Nessuna
 * prestazione viene inventata: senza marcatori o senza voti il premio resta
 * vuoto.
 */
const { Match, Group, AwardVote } = require('../models');
const { conflict, forbidden, unprocessable, notFound } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');
const { userResolver } = require('./dto');
const nicknameService = require('./nicknameService');
const notificationService = require('./notificationService');
const chatService = require('./chatService');
const activityService = require('./activityService');
const { playersOf } = require('./teamService');
const realtime = require('./realtime');

const DEFAULT_LABELS = {
  portiere: 'Miglior portiere',
  difensore: 'Miglior difensore',
  bomber: 'Bomber della serata',
  sorpresa: 'Sorpresa della serata',
  ironico: 'Premio ironico',
};
const KEYS = Object.keys(DEFAULT_LABELS);

/** I premi attivi in un gruppo, con etichetta e modalità iniziale. */
function enabledFor(group) {
  const cfg = group?.settings?.awards || {};
  return KEYS.filter((k) => (k === 'ironico' ? cfg.ironico?.enabled : cfg[k])).map((key) => ({
    key,
    label: key === 'ironico' ? cfg.ironico?.label || DEFAULT_LABELS.ironico : DEFAULT_LABELS[key],
    mode: key === 'bomber' ? 'automatico' : 'voto',
  }));
}

function bomberWinners(match) {
  const goals = new Map();
  for (const s of match.result?.scorers || []) goals.set(String(s.user), (goals.get(String(s.user)) || 0) + s.goals);
  const max = Math.max(0, ...goals.values());
  return max > 0 ? [...goals].filter(([, g]) => g === max).map(([u]) => u) : [];
}

const winnersMap = (match) => new Map((match.awardWinners || []).map((w) => [w.key, (w.users || []).map(String)]));

/** Ricalcola i vincitori che dipendono solo dai dati (bomber) senza toccare gli altri. */
function withAutomatic(match, base) {
  const map = new Map(base);
  if ((match.awards || []).some((a) => a.key === 'bomber')) map.set('bomber', bomberWinners(match));
  return map;
}

const toArray = (map) => [...map].map(([key, users]) => ({ key, users }));

/** Al primo risultato: attiva i premi del gruppo e calcola il bomber. */
function initial(group, match) {
  const awards = enabledFor(group);
  const draft = { awards, result: match.result };
  return { awards, awardWinners: toArray(withAutomatic(draft, new Map())) };
}

/** Dopo la correzione di un risultato: il bomber segue i marcatori aggiornati. */
async function refreshAutomatic(matchId) {
  const match = await Match.findById(matchId).lean();
  if (!match || !(match.awards || []).some((a) => a.key === 'bomber')) return;
  await Match.updateOne({ _id: matchId }, { $set: { awardWinners: toArray(withAutomatic(match, winnersMap(match))) } });
}

function assertOpen(match) {
  if (!match.awards?.length) throw conflict('In questa partita non ci sono premi attivi.');
  if (!match.voting || match.voting.awardsClosed || new Date() >= new Date(match.voting.closesAt)) throw conflict('La votazione dei premi è chiusa.');
}

function awardOf(match, key) {
  const award = (match.awards || []).find((a) => a.key === key);
  if (!award) throw notFound('Premio non attivo in questa partita.');
  return award;
}

async function vote(match, user, key, nominee) {
  assertOpen(match);
  const award = awardOf(match, key);
  if (award.mode !== 'voto') throw conflict(award.mode === 'automatico' ? 'Questo premio si calcola da solo.' : "Questo premio l'ha già assegnato l'organizzatore.");
  const players = playersOf(match);
  if (!players.some((id) => sameId(id, user._id))) throw forbidden('Votano solo i giocatori di questa partita.');
  if (sameId(nominee, user._id)) throw unprocessable('Non puoi votare te stesso: scegli un compagno.', { nominee: 'Voto a sé stessi.' });
  if (!players.some((id) => sameId(id, nominee))) throw unprocessable('Si vota tra chi ha giocato.', { nominee: 'Non ha giocato.' });
  try {
    await AwardVote.create({ match: match._id, voter: user._id, award: key, nominee });
  } catch (err) {
    if (err.code === 11000) throw conflict('Hai già votato questo premio.');
    throw err;
  }
  realtime.toGroup(match.group, 'voting:updated', { matchId: String(match._id) });
  return state(match._id, user);
}

/** Assegnazione esplicita dell'organizzatore: vale subito e chiude il voto di quel premio. */
async function assign(match, key, userIds) {
  if (!match.awards?.length) throw conflict('In questa partita non ci sono premi attivi.');
  const award = awardOf(match, key);
  if (award.mode === 'automatico') throw conflict('Il bomber della serata si calcola dai marcatori.');
  const players = playersOf(match);
  for (const id of userIds) if (!players.some((p) => sameId(p, id))) throw unprocessable('Si premia solo chi ha giocato.', { userIds: 'Non ha giocato.' });
  const unique = [...new Set(userIds.map(String))];
  const awards = match.awards.map((a) => ({ key: a.key, label: a.label, mode: a.key === key ? 'assegnato' : a.mode }));
  const winners = winnersMap(match);
  winners.set(key, unique);
  await Match.updateOne({ _id: match._id }, { $set: { awards, awardWinners: toArray(winners) } });
  await announce(match._id, [key], { assigned: true });
  realtime.toGroup(match.group, 'voting:updated', { matchId: String(match._id) });
  return state(match._id, { _id: null });
}

/** Chiude i premi a voto: una sola volta, in un'unica operazione atomica. */
async function close(matchId) {
  const match = await Match.findById(matchId).lean();
  if (!match || !match.awards?.length || match.voting?.awardsClosed) return false;
  const votes = await AwardVote.find({ match: matchId }).lean();
  const winners = withAutomatic(match, winnersMap(match));
  const closedKeys = [];
  for (const award of match.awards) {
    if (award.mode !== 'voto') continue;
    const tally = new Map();
    for (const v of votes.filter((x) => x.award === award.key)) tally.set(String(v.nominee), (tally.get(String(v.nominee)) || 0) + 1);
    const max = Math.max(0, ...tally.values());
    winners.set(award.key, max > 0 ? [...tally].filter(([, n]) => n === max).map(([u]) => u) : []);
    closedKeys.push(award.key);
  }
  const updated = await Match.findOneAndUpdate(
    { _id: matchId, 'voting.awardsClosed': { $ne: true } },
    { $set: { 'voting.awardsClosed': true, awardWinners: toArray(winners) } },
    { new: true }
  ).lean();
  if (!updated) return false;
  await announce(matchId, match.awards.map((a) => a.key), {});
  return true;
}

/** Messaggio in chat, voce nel feed e notifica ai vincitori (una sola volta per premio e partita). */
async function announce(matchId, keys, { assigned = false } = {}) {
  const match = await Match.findById(matchId).lean();
  const winners = winnersMap(match);
  const everyone = [...new Set([...winners.values()].flat())];
  const resolve = await userResolver(everyone, await nicknameService.activeMap(match.group));
  const name = (id) => {
    const u = resolve(id);
    return u.nickname ? `${u.name} «${u.nickname}»` : u.name;
  };
  for (const key of keys) {
    const award = match.awards.find((a) => a.key === key);
    const users = winners.get(key) || [];
    if (!award || !users.length) continue;
    const dedupe = `premio_partita:${matchId}:${key}:${[...users].sort().join(',')}`;
    const entry = await activityService.record(match.group, 'premio_partita', { target: users[0], match: matchId, data: { award: key, label: award.label, winners: users, assigned }, key: dedupe });
    if (!entry) continue; // già annunciato
    await chatService.postSystem(match.group, `${award.label}: ${users.map(name).join(' e ')}${assigned ? ' (scelto dall\'organizzatore)' : ''}.`);
    await notificationService.notify(users, {
      type: 'premio',
      title: `Hai vinto: ${award.label}`,
      body: 'Un riconoscimento dai compagni di squadra.',
      link: `/partite/${matchId}#premi`,
      group: match.group,
      dedupeKey: dedupe,
    });
  }
}

/** Vero se qualche premio a voto non ha ancora ricevuto il voto di tutti i giocatori. */
async function hasPendingVotes(match) {
  const voting = (match.awards || []).filter((a) => a.mode === 'voto');
  if (!voting.length || match.voting?.awardsClosed) return false;
  const total = playersOf(match).length;
  for (const a of voting) if ((await AwardVote.countDocuments({ match: match._id, award: a.key })) < total) return true;
  return false;
}

/** Stato dei premi visto da `user`: i voti degli altri non si vedono mai, i totali sì. */
async function state(matchId, user) {
  const match = await Match.findById(matchId).lean();
  const players = playersOf(match);
  const resolve = await userResolver([...players, ...[...winnersMap(match).values()].flat()], await nicknameService.activeMap(match.group));
  const votes = await AwardVote.find({ match: matchId }).lean();
  const winners = winnersMap(match);
  const closed = Boolean(match.voting?.awardsClosed);
  return {
    matchId: String(matchId),
    enabled: (match.awards || []).length > 0,
    closesAt: match.voting?.closesAt || null,
    closed,
    awards: (match.awards || []).map((a) => {
      const mine = user._id ? votes.find((v) => v.award === a.key && sameId(v.voter, user._id)) : null;
      const decided = a.mode !== 'voto' || closed;
      return {
        key: a.key,
        label: a.label,
        mode: a.mode,
        open: a.mode === 'voto' && !closed && Boolean(match.voting) && new Date() < new Date(match.voting.closesAt),
        votedCount: votes.filter((v) => v.award === a.key).length,
        eligibleCount: players.length,
        myVote: mine ? String(mine.nominee) : null,
        decided,
        winners: decided ? (winners.get(a.key) || []).map((id) => resolve(id)) : [],
      };
    }),
    players: players.map((id) => resolve(id)),
  };
}

module.exports = { KEYS, DEFAULT_LABELS, enabledFor, initial, refreshAutomatic, vote, assign, close, hasPendingVotes, state, announce };
