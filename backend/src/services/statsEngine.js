'use strict';

/*
 * Motore statistico unico. Trasforma le partite giocate di un gruppo in un
 * formato compatto da cui derivano classifiche, dashboard, BONCARD,
 * rivalità e riepiloghi. Nessun'altra parte del codice legge i risultati
 * "a mano".
 */
const { Match, Rating } = require('../models');
const { PLAYED_STATUSES } = require('../config/appConfig');

/** Partite giocate con risultato e squadre, normalizzate, in ordine cronologico. */
async function loadPlayed(groupId, { since = null, until = null } = {}) {
  const filter = { group: groupId, status: { $in: PLAYED_STATUSES }, result: { $ne: null } };
  if (since || until) filter.startsAt = { ...(since ? { $gte: since } : {}), ...(until ? { $lt: until } : {}) };
  const raw = await Match.find(filter).sort({ startsAt: 1 }).lean();
  const matches = raw
    .filter((m) => m.teams)
    .map((m) => ({
      id: String(m._id),
      startsAt: m.startsAt,
      field: m.field,
      teams: { a: m.teams.a.players.map(String), b: m.teams.b.players.map(String) },
      teamNames: { a: m.teams.a.name, b: m.teams.b.name },
      scoreA: m.result.scoreA,
      scoreB: m.result.scoreB,
      scorers: (m.result.scorers || []).map((s) => ({ user: String(s.user), goals: s.goals })),
      mvp: m.voting?.closed ? (m.voting.mvp || []).map(String) : [],
      awardWinners: (m.awardWinners || []).map((w) => ({ key: w.key, users: w.users.map(String) })),
    }));
  const ratings = matches.length
    ? (await Rating.find({ match: { $in: matches.map((m) => m.id) } }).lean()).map((r) => ({
        match: String(r.match),
        rater: String(r.rater),
        ratee: String(r.ratee),
        score: r.score,
        attributes: r.attributes || null,
      }))
    : [];
  return { matches, ratings };
}

/** Una riga per giocatore e partita: squadra, esito, gol, MVP, voto medio ricevuto. */
function playerRows(matches, ratings) {
  const ratingsBy = new Map();
  for (const r of ratings) {
    const k = `${r.match}:${r.ratee}`;
    if (!ratingsBy.has(k)) ratingsBy.set(k, []);
    ratingsBy.get(k).push(r);
  }
  const rows = [];
  for (const m of matches) {
    for (const side of ['a', 'b']) {
      const own = side === 'a' ? m.scoreA : m.scoreB;
      const other = side === 'a' ? m.scoreB : m.scoreA;
      for (const user of m.teams[side]) {
        const received = ratingsBy.get(`${m.id}:${user}`) || [];
        rows.push({
          match: m.id,
          startsAt: m.startsAt,
          field: m.field,
          user,
          team: side,
          mates: m.teams[side].filter((u) => u !== user),
          opponents: m.teams[side === 'a' ? 'b' : 'a'],
          goalsFor: own,
          goalsAgainst: other,
          result: own > other ? 'V' : own === other ? 'P' : 'S',
          goals: m.scorers.filter((s) => s.user === user).reduce((a, s) => a + s.goals, 0),
          hasScorers: m.scorers.length > 0,
          mvp: m.mvp.includes(user),
          ratings: received.map((r) => r.score),
          avgRating: received.length ? received.reduce((a, r) => a + r.score, 0) / received.length : null,
          attributes: received.map((r) => r.attributes).filter(Boolean),
        });
      }
    }
  }
  return rows;
}

/** Riepilogo oggettivo di un giocatore (dalle sue righe). */
function summarize(rows) {
  const played = rows.length;
  const wins = rows.filter((r) => r.result === 'V').length;
  const draws = rows.filter((r) => r.result === 'P').length;
  const ratings = rows.flatMap((r) => r.ratings);
  return {
    played,
    wins,
    draws,
    losses: played - wins - draws,
    goals: rows.reduce((a, r) => a + r.goals, 0),
    mvp: rows.filter((r) => r.mvp).length,
    ratingsCount: ratings.length,
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    winRate: played ? wins / played : null,
  };
}

module.exports = { loadPlayed, playerRows, summarize };
