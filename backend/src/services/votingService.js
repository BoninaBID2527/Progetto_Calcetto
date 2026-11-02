'use strict';

const { Match, MvpVote, Rating, PrizeVote, Group } = require('../models');
const { conflict, forbidden, unprocessable } = require('../utils/AppError');
const { sameId, formatDateTime } = require('../utils/helpers');
const { appConfig, DEFAULTS } = require('../config/appConfig');
const { userResolver } = require('./dto');
const nicknameService = require('./nicknameService');
const notificationService = require('./notificationService');
const chatService = require('./chatService');
const matchService = require('./matchService');
const realtime = require('./realtime');
const { playersOf, teamOf } = require('./teamService');
const activityService = require('./activityService');

const HOUR = 3_600_000;

// ------------------------------------------------------------------ risultato

async function setResult(match, user, { scoreA, scoreB, scorers }) {
  if (!['chiusa', 'giocata'].includes(match.status)) {
    throw conflict(match.status === 'aperta' ? 'Chiudi le iscrizioni prima di inserire il risultato.' : 'Questa partita non accetta più risultati.');
  }
  const players = playersOf(match);
  if (!match.teams || !match.teams.a.players.length || !match.teams.b.players.length) {
    throw unprocessable('Prima fai le squadre: servono per sapere chi ha vinto.', { teams: 'Squadre mancanti.' });
  }
  const goals = { a: 0, b: 0 };
  const merged = new Map();
  for (const s of scorers) {
    const team = teamOf(match, s.userId);
    if (!team) throw unprocessable('Tra i marcatori ci sono solo giocatori delle due squadre.', { scorers: 'Marcatore non in squadra.' });
    goals[team] += s.goals;
    merged.set(s.userId, (merged.get(s.userId) || 0) + s.goals);
  }
  if (goals.a > scoreA || goals.b > scoreB) {
    throw unprocessable('I gol dei marcatori superano il punteggio della squadra.', { scorers: 'Troppi gol assegnati.' });
  }

  const first = !match.result;
  const now = new Date();
  const set = {
    status: 'giocata',
    result: {
      scoreA,
      scoreB,
      scorers: [...merged].map(([u, g]) => ({ user: u, goals: g })),
      recordedBy: user._id,
      recordedAt: now,
    },
  };
  if (first) {
    const group = await Group.findById(match.group).lean();
    set.voting = { opensAt: now, closesAt: new Date(now.getTime() + DEFAULTS.votingHours * HOUR), closed: false, mvp: [] };
    set.prizePoll = { options: [...appConfig.prizeOptions, ...(group.settings.extraPrizeOptions || [])], closed: false, winners: [] };
  }
  const updated = await Match.findOneAndUpdate({ _id: match._id, status: match.status }, { $set: set }, { new: true }).lean();
  if (!updated) throw conflict('La partita è stata modificata nel frattempo. Ricarica e riprova.');

  const field = matchService.fieldName(match.field);
  const line = `${updated.teams.a.name} ${scoreA} - ${scoreB} ${updated.teams.b.name}`;
  if (first) {
    const others = players.filter((id) => !sameId(id, user._id));
    await notificationService.notify(others, {
      type: 'risultato',
      title: `Finale a ${field}: ${scoreA} - ${scoreB}`,
      body: line,
      link: `/partite/${match._id}`,
      group: match.group,
    });
    await notificationService.notify(players, {
      type: 'votazione_aperta',
      title: "Vota l'MVP della serata",
      body: `Hai tempo fino a ${formatDateTime(set.voting.closesAt)}. Si vota anche il terzo tempo!`,
      link: `/partite/${match._id}#votazioni`,
      group: match.group,
    });
    await chatService.postSystem(match.group, `Finale a ${field}: ${line}. Votazioni aperte per MVP e terzo tempo!`);
    await activityService.record(match.group, 'risultato', {
      actor: user._id,
      match: match._id,
      data: { scoreA, scoreB, teamA: updated.teams.a.name, teamB: updated.teams.b.name },
      key: `risultato:${match._id}`,
    });
  } else {
    await chatService.postSystem(match.group, `Risultato corretto: ${line}.`);
  }
  return matchService.broadcast(match._id);
}

// ------------------------------------------------------------------ chiusura delle votazioni

function winnersOf(tally) {
  const max = Math.max(0, ...tally.values());
  return max > 0 ? [...tally].filter(([, v]) => v === max).map(([k]) => k) : [];
}

async function closeMvp(matchId) {
  const votes = await MvpVote.find({ match: matchId }).lean();
  const tally = new Map();
  for (const v of votes) tally.set(String(v.mvp), (tally.get(String(v.mvp)) || 0) + 1);
  const winners = winnersOf(tally);
  const updated = await Match.findOneAndUpdate(
    { _id: matchId, 'voting.closed': false },
    { $set: { 'voting.closed': true, 'voting.closedAt': new Date(), 'voting.mvp': winners } },
    { new: true }
  ).lean();
  if (!updated) return false;
  const resolve = await userResolver(winners, await nicknameService.activeMap(updated.group));
  const names = winners.map((id) => resolve(id)).map((u) => (u.nickname ? `${u.name} «${u.nickname}»` : u.name));
  const top = tally.get(winners[0]);
  const text = names.length
    ? `${names.length > 1 ? 'MVP condiviso' : 'MVP della serata'}: ${names.join(' e ')} (${top} ${top === 1 ? 'voto' : 'voti'}).`
    : "Votazione MVP chiusa senza voti: stavolta nessuna stella.";
  await chatService.postSystem(updated.group, text);
  if (winners.length) {
    await activityService.record(updated.group, 'mvp', { target: winners[0], match: matchId, data: { winners, votes: top }, key: `mvp:${matchId}` });
  }
  return true;
}

async function closePrize(matchId) {
  const votes = await PrizeVote.find({ match: matchId }).lean();
  const tally = new Map();
  for (const v of votes) tally.set(v.option, (tally.get(v.option) || 0) + 1);
  const winners = winnersOf(tally);
  const updated = await Match.findOneAndUpdate(
    { _id: matchId, 'prizePoll.closed': false },
    { $set: { 'prizePoll.closed': true, 'prizePoll.closedAt': new Date(), 'prizePoll.winners': winners } },
    { new: true }
  ).lean();
  if (!updated) return false;
  const labels = winners.map((k) => updated.prizePoll.options.find((o) => o.key === k)).map((o) => `${o.label} ${o.emoji}`);
  const loser = loserTeam(updated);
  const group = await Group.findById(updated.group).lean();
  let text = labels.length ? `Terzo tempo: vince ${labels.join(' e ')}!` : 'Terzo tempo: nessun voto, ognuno a casa sua.';
  if (group?.settings.loserPaysFirstRound && labels.length) {
    text += loser ? ` Il primo giro lo offrono le ${updated.teams[loser].name}.` : ' Pareggio: si fa alla romana.';
  }
  await chatService.postSystem(updated.group, text);
  if (winners.length) {
    await activityService.record(updated.group, 'premio', { match: matchId, data: { winners, labels }, key: `premio:${matchId}` });
  }
  return true;
}

/** Chiude MVP e premio se la scadenza è passata (o se `force`). */
async function finalize(matchId, { force = false, now = new Date() } = {}) {
  const match = await Match.findById(matchId).lean();
  if (!match?.voting) return match;
  const due = force || now >= new Date(match.voting.closesAt);
  if (!due) return match;
  const changed = [];
  if (!match.voting.closed) changed.push(await closeMvp(matchId));
  if (match.prizePoll && !match.prizePoll.closed) changed.push(await closePrize(matchId));
  if (changed.some(Boolean)) {
    await matchService.broadcast(matchId);
    realtime.toGroup(match.group, 'voting:updated', { matchId: String(matchId) });
  }
  return Match.findById(matchId).lean();
}

async function finalizeIfDue(match) {
  if (match.voting && (!match.voting.closed || !match.prizePoll?.closed) && new Date() >= new Date(match.voting.closesAt)) {
    return finalize(match._id);
  }
  return typeof match.toObject === 'function' ? match.toObject() : match;
}

/** Usata dal programma periodico. */
async function finalizeExpired(now = new Date()) {
  const due = await Match.find({ 'voting.closed': false, 'voting.closesAt': { $lte: now } }).select('_id').lean();
  const duePrize = await Match.find({ 'prizePoll.closed': false, 'voting.closesAt': { $lte: now } }).select('_id').lean();
  const ids = [...new Set([...due, ...duePrize].map((m) => String(m._id)))];
  for (const id of ids) await finalize(id, { now });
  return ids.length;
}

// ------------------------------------------------------------------ voti

function assertCanVote(match, user, { prize = false } = {}) {
  const section = prize ? match.prizePoll : match.voting;
  if (!section) throw conflict('Le votazioni si aprono quando viene inserito il risultato.');
  if (section.closed || new Date() >= new Date(match.voting.closesAt)) throw conflict('La votazione è chiusa.');
  if (!playersOf(match).some((id) => sameId(id, user._id))) throw forbidden('Votano solo i giocatori di questa partita.');
}

async function notifyVotingChange(matchId) {
  const match = await Match.findById(matchId).lean();
  const [mvpVotes, prizeVotes] = await Promise.all([MvpVote.countDocuments({ match: matchId }), PrizeVote.countDocuments({ match: matchId })]);
  realtime.toGroup(match.group, 'voting:updated', {
    matchId: String(matchId),
    mvpVotes,
    prizeVotes,
    eligible: playersOf(match).length,
  });
  return { match, mvpVotes, prizeVotes };
}

async function castMvp(match, user, mvpUserId) {
  assertCanVote(match, user);
  if (sameId(mvpUserId, user._id)) throw unprocessable('Non puoi votare te stesso: scegli un compagno.', { mvpUserId: 'Voto a sé stessi.' });
  if (!playersOf(match).some((id) => sameId(id, mvpUserId))) {
    throw unprocessable("L'MVP si sceglie tra chi ha giocato.", { mvpUserId: 'Non ha giocato.' });
  }
  try {
    await MvpVote.create({ match: match._id, voter: user._id, mvp: mvpUserId });
  } catch (err) {
    if (err.code === 11000) throw conflict("Hai già votato l'MVP di questa partita.");
    throw err;
  }
  const { match: fresh, mvpVotes } = await notifyVotingChange(match._id);
  if (mvpVotes >= playersOf(fresh).length && (await closeMvp(match._id))) await matchService.broadcast(match._id);
  return state(match._id, user);
}

async function rate(match, user, ratings) {
  assertCanVote(match, user);
  const players = playersOf(match);
  for (const r of ratings) {
    if (sameId(r.userId, user._id)) throw unprocessable('Non puoi darti un voto da solo.', { ratings: 'Voto a sé stessi.' });
    if (!players.some((id) => sameId(id, r.userId))) throw unprocessable('Si votano solo i giocatori della partita.', { ratings: 'Non ha giocato.' });
  }
  for (const r of ratings) {
    await Rating.updateOne(
      { match: match._id, rater: user._id, ratee: r.userId },
      { $set: { score: r.score, group: match.group } },
      { upsert: true }
    );
  }
  return state(match._id, user);
}

async function votePrize(match, user, option) {
  assertCanVote(match, user, { prize: true });
  if (!match.prizePoll.options.some((o) => o.key === option)) throw unprocessable('Opzione del premio non valida.', { option: 'Scegli una delle opzioni.' });
  try {
    await PrizeVote.create({ match: match._id, voter: user._id, option });
  } catch (err) {
    if (err.code === 11000) throw conflict('Hai già votato il terzo tempo.');
    throw err;
  }
  const { match: fresh, prizeVotes } = await notifyVotingChange(match._id);
  if (prizeVotes >= playersOf(fresh).length && (await closePrize(match._id))) await matchService.broadcast(match._id);
  return state(match._id, user);
}

async function closeNow(match) {
  if (!match.voting) throw conflict('Non ci sono votazioni da chiudere.');
  await finalize(match._id, { force: true });
  return matchService.dtoOf(await Match.findById(match._id).lean());
}

// ------------------------------------------------------------------ stato e pagella

function loserTeam(match) {
  if (!match.result) return null;
  if (match.result.scoreA === match.result.scoreB) return null;
  return match.result.scoreA < match.result.scoreB ? 'a' : 'b';
}

/** Stato delle votazioni visto da `user`: totali sì, voti degli altri mai. */
async function state(matchId, user) {
  const match = await Match.findById(matchId).lean();
  const players = playersOf(match);
  const resolve = await userResolver(players, await nicknameService.activeMap(match.group));
  const [mvpVotes, prizeVotes, myRatings] = await Promise.all([
    MvpVote.find({ match: matchId }).lean(),
    PrizeVote.find({ match: matchId }).lean(),
    Rating.find({ match: matchId, rater: user._id }).lean(),
  ]);
  const myMvp = mvpVotes.find((v) => sameId(v.voter, user._id));
  const myPrize = prizeVotes.find((v) => sameId(v.voter, user._id));
  const mvpClosed = Boolean(match.voting?.closed);
  const tally = new Map();
  for (const v of mvpVotes) tally.set(String(v.mvp), (tally.get(String(v.mvp)) || 0) + 1);

  return {
    matchId: String(match._id),
    isPlayer: players.some((id) => sameId(id, user._id)),
    players: players.map((id) => ({ ...resolve(id), team: teamOf(match, id) })),
    mvp: match.voting
      ? {
          open: !mvpClosed,
          closesAt: match.voting.closesAt,
          votedCount: mvpVotes.length,
          eligibleCount: players.length,
          hasVoted: Boolean(myMvp),
          myVote: myMvp ? String(myMvp.mvp) : null,
          winners: (match.voting.mvp || []).map(String),
          results: mvpClosed
            ? [...tally].map(([id, votes]) => ({ user: resolve(id), votes })).sort((a, b) => b.votes - a.votes)
            : null,
        }
      : null,
    ratings: { mine: Object.fromEntries(myRatings.map((r) => [String(r.ratee), r.score])) },
    prize: match.prizePoll
      ? {
          open: !match.prizePoll.closed,
          options: match.prizePoll.options.map((o) => ({
            key: o.key,
            label: o.label,
            emoji: o.emoji,
            votes: prizeVotes.filter((v) => v.option === o.key).length,
          })),
          votedCount: prizeVotes.length,
          eligibleCount: players.length,
          myVote: myPrize ? myPrize.option : null,
          winners: match.prizePoll.winners || [],
        }
      : null,
  };
}

async function report(matchId) {
  const raw = await Match.findById(matchId).lean();
  const match = await matchService.dtoOf(raw);
  const group = await Group.findById(raw.group).lean();
  const field = appConfig.fields.find((f) => f.key === raw.field);
  const loser = loserTeam(raw);
  const prizes = (match.prizePoll?.winners || []).map((k) => match.prizePoll.options.find((o) => o.key === k)).filter(Boolean);
  const display = (u) => (u.nickname ? `${u.name} «${u.nickname}»` : u.name);
  const loserPays = group.settings.loserPaysFirstRound && match.result ? (loser ? match.teams[loser].name : null) : undefined;

  const lines = [`⚽ ${appConfig.appName} · Pagella della serata`, `${field.name} · ${formatDateTime(new Date(raw.startsAt))}`];
  if (match.result) lines.push(`${match.teams.a.name} ${match.result.scoreA} - ${match.result.scoreB} ${match.teams.b.name}`);
  if (match.voting?.closed) lines.push(match.voting.mvp.length ? `⭐ MVP: ${match.voting.mvp.map(display).join(' e ')}` : '⭐ MVP: nessuno');
  if (match.result?.scorers.length) {
    lines.push(`🥅 Marcatori: ${match.result.scorers.map((s) => `${display(s.user)}${s.goals > 1 ? ` (${s.goals})` : ''}`).join(', ')}`);
  }
  if (prizes.length) lines.push(`🏆 Terzo tempo: ${prizes.map((p) => `${p.label} ${p.emoji}`).join(' e ')}`);
  if (loserPays !== undefined) lines.push(loserPays ? `🍻 Il primo giro lo offrono: ${loserPays}` : '🍻 Pareggio: si fa alla romana');

  return {
    match,
    field,
    winner: match.result ? (loser === 'a' ? 'b' : loser === 'b' ? 'a' : null) : null,
    mvp: match.voting?.closed ? match.voting.mvp : [],
    prizes,
    loserPays: loserPays ?? null,
    loserPaysEnabled: Boolean(group.settings.loserPaysFirstRound),
    text: lines.join('\n'),
  };
}

module.exports = {
  setResult,
  castMvp,
  rate,
  votePrize,
  closeNow,
  finalize,
  finalizeIfDue,
  finalizeExpired,
  state,
  report,
  loserTeam,
};
