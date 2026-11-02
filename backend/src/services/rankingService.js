'use strict';

const { Match, Rating } = require('../models');
const { PLAYED_STATUSES, DEFAULTS } = require('../config/appConfig');
const { userResolver } = require('./dto');
const nicknameService = require('./nicknameService');

/** Inizio del periodo: mese di calendario, stagione (dal 1° settembre) o nessun limite. */
function periodStart(period, now = new Date()) {
  if (period === 'mese') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'stagione') {
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return new Date(year, 8, 1);
  }
  return null;
}

const round = (v, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits;
const pct = (v) => `${Math.round(v * 100)}%`;

/** Le definizioni delle classifiche: chi ci entra, come si ordina, cosa si mostra. */
const DEFINITIONS = [
  {
    key: 'forti',
    title: 'I più forti',
    note: 'Media dei voti ricevuti dai compagni più un bonus MVP: 2 × (MVP vinti ÷ partite giocate). Chi non ha ancora voti parte da 5. A parità, conta chi ha più MVP.',
    eligible: (s) => true,
    value: (s) => (s.ratingCount ? s.ratingSum / s.ratingCount : DEFAULTS.newPlayerRating) + (2 * s.mvp) / s.played,
    tie: (s) => [s.mvp, s.played],
    order: 'desc',
    display: (v) => v.toFixed(1).replace('.', ','),
    detail: (s) => `${s.ratingCount ? `media voti ${(s.ratingSum / s.ratingCount).toFixed(1).replace('.', ',')}` : 'nessun voto'} · ${s.mvp} MVP`,
    bar: (v) => Math.min(1, v / 12),
  },
  {
    key: 'mvp',
    title: 'MVP',
    note: "Quante volte è stato eletto MVP. Un MVP condiviso vale uno a testa. A parità, viene prima chi ci è riuscito giocando meno partite.",
    eligible: (s) => s.mvp > 0,
    value: (s) => s.mvp,
    tie: (s) => [-s.played],
    order: 'desc',
    display: (v) => String(v),
    detail: (s) => `${s.played} partite giocate`,
    bar: (v, max) => (max ? v / max : 0),
  },
  {
    key: 'vincenti',
    title: 'I più vincenti',
    note: 'Percentuale di partite vinte (vince la squadra con più gol). A parità di percentuale, conta chi ha vinto più partite.',
    eligible: () => true,
    value: (s) => s.wins / s.played,
    tie: (s) => [s.wins],
    order: 'desc',
    display: pct,
    detail: (s) => `${s.wins} vinte · ${s.draws} pari · ${s.losses} perse`,
    bar: (v) => v,
  },
  {
    key: 'sfortunati',
    title: 'Il club di chi non vince mai',
    note: 'Con affetto: la percentuale di vittorie più bassa, con almeno 5 partite giocate. A parità, sale chi ha perso più partite di un solo gol (sfortuna pura).',
    eligible: (s, ctx) => s.played >= ctx.minUnlucky,
    value: (s) => s.wins / s.played,
    // Il pari merito si rompe con le sconfitte di misura: fa parte del valore.
    rankKey: (s) => [round(s.wins / s.played), -s.oneGoalLosses],
    tie: (s) => [s.losses],
    order: 'asc',
    display: pct,
    detail: (s) => `${s.oneGoalLosses} sconfitte di un gol · ${s.losses} perse su ${s.played}`,
    bar: (v) => 1 - v,
  },
  {
    key: 'presenti',
    title: 'I più presenti',
    note: 'Partite giocate sul totale delle partite del gruppo da quando la persona è entrata. A parità, conta chi ne ha giocate di più.',
    eligible: () => true,
    value: (s) => s.played / Math.max(s.available, s.played),
    tie: (s) => [s.played],
    order: 'desc',
    display: pct,
    detail: (s) => `${s.played} su ${Math.max(s.available, s.played)} partite`,
    bar: (v) => v,
  },
  {
    key: 'bomber',
    title: 'Bomber',
    note: 'Gol segnati, contati solo nelle partite in cui sono stati inseriti i marcatori. A parità, conta la media gol a partita.',
    eligible: (s) => s.goals > 0,
    value: (s) => s.goals,
    tie: (s) => [s.goals / s.played],
    order: 'desc',
    display: (v) => String(v),
    detail: (s) => `${(s.goals / s.played).toFixed(1).replace('.', ',')} gol a partita`,
    bar: (v, max) => (max ? v / max : 0),
  },
];

function compareTuples(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

/**
 * Calcola tutte le classifiche. Funzione pura: riceve le partite giocate già
 * filtrate per periodo, i voti 1-10 e i membri del gruppo.
 *
 * @param {object} input
 * @param {{id, startsAt, teams: {a: string[], b: string[]}, scoreA, scoreB, scorers: {user, goals}[], mvp: string[]}[]} input.matches
 * @param {{match: string, ratee: string, score: number}[]} input.ratings
 * @param {{userId: string, joinedAt: Date}[]} input.members
 * @param {number} input.minMatches
 */
function computeRankings({ matches, ratings, members, minMatches = DEFAULTS.minMatchesForRanking, minUnlucky = DEFAULTS.minMatchesForUnlucky }) {
  const stats = new Map(
    members.map((m) => [
      m.userId,
      { userId: m.userId, joinedAt: m.joinedAt, played: 0, wins: 0, draws: 0, losses: 0, oneGoalLosses: 0, goals: 0, mvp: 0, ratingSum: 0, ratingCount: 0, available: 0 },
    ])
  );
  const matchIds = new Set(matches.map((m) => m.id));

  for (const m of matches) {
    for (const s of stats.values()) if (!s.joinedAt || new Date(m.startsAt) >= new Date(s.joinedAt)) s.available += 1;
    for (const side of ['a', 'b']) {
      const mine = side === 'a' ? m.scoreA : m.scoreB;
      const theirs = side === 'a' ? m.scoreB : m.scoreA;
      for (const id of m.teams[side]) {
        const s = stats.get(id);
        if (!s) continue;
        s.played += 1;
        if (mine > theirs) s.wins += 1;
        else if (mine === theirs) s.draws += 1;
        else {
          s.losses += 1;
          if (theirs - mine === 1) s.oneGoalLosses += 1;
        }
      }
    }
    for (const sc of m.scorers) if (stats.has(sc.user)) stats.get(sc.user).goals += sc.goals;
    for (const id of m.mvp) if (stats.has(id)) stats.get(id).mvp += 1;
  }
  for (const r of ratings) {
    if (!matchIds.has(r.match) || !stats.has(r.ratee)) continue;
    const s = stats.get(r.ratee);
    s.ratingSum += r.score;
    s.ratingCount += 1;
  }

  const ctx = { minMatches, minUnlucky: Math.max(minUnlucky, minMatches) };
  const rankings = DEFINITIONS.map((def) => {
    const minimum = def.key === 'sfortunati' ? ctx.minUnlucky : minMatches;
    const pool = [...stats.values()].filter((s) => s.played >= minimum && def.eligible(s, ctx));
    const sign = def.order === 'asc' ? 1 : -1;
    const rankKey = (s) => (def.rankKey ? def.rankKey(s) : [round(def.value(s))]);
    const sorted = pool
      .map((s) => ({ s, key: rankKey(s), tie: def.tie(s), value: def.value(s) }))
      .sort((x, y) => sign * compareTuples(x.key, y.key) || -compareTuples(x.tie, y.tie) || x.s.userId.localeCompare(y.s.userId));
    const max = Math.max(0, ...sorted.map((e) => e.value));
    let position = 0;
    const entries = sorted.map((e, i) => {
      if (i === 0 || compareTuples(e.key, sorted[i - 1].key) !== 0) position = i + 1;
      return {
        userId: e.s.userId,
        position,
        value: round(e.value, 4),
        display: def.display(e.value),
        detail: def.detail(e.s),
        bar: round(Math.max(0, def.bar(e.value, max)), 3),
        played: e.s.played,
      };
    });
    return { key: def.key, title: def.title, note: def.note, minMatches: minimum, entries };
  });

  return { rankings, stats: Object.fromEntries([...stats].map(([id, s]) => [id, s])) };
}

/** Carica i dati del gruppo, applica il periodo e risolve gli utenti. */
async function groupRankings(group, period = 'sempre', now = new Date()) {
  const since = periodStart(period, now);
  const filter = { group: group._id, status: { $in: PLAYED_STATUSES }, result: { $ne: null } };
  if (since) filter.startsAt = { $gte: since };
  const raw = await Match.find(filter).sort({ startsAt: 1 }).lean();
  const matches = raw
    .filter((m) => m.teams)
    .map((m) => ({
      id: String(m._id),
      startsAt: m.startsAt,
      teams: { a: m.teams.a.players.map(String), b: m.teams.b.players.map(String) },
      scoreA: m.result.scoreA,
      scoreB: m.result.scoreB,
      scorers: (m.result.scorers || []).map((s) => ({ user: String(s.user), goals: s.goals })),
      mvp: m.voting?.closed ? (m.voting.mvp || []).map(String) : [],
    }));
  const ratings = matches.length
    ? (await Rating.find({ match: { $in: matches.map((m) => m.id) } }).lean()).map((r) => ({
        match: String(r.match),
        ratee: String(r.ratee),
        score: r.score,
      }))
    : [];
  const members = group.members.map((m) => ({ userId: String(m.user), joinedAt: m.joinedAt }));
  const { rankings } = computeRankings({ matches, ratings, members, minMatches: group.settings.minMatchesForRanking });

  const resolve = await userResolver(members.map((m) => m.userId), await nicknameService.activeMap(group._id));
  return {
    period,
    since,
    totalMatches: matches.length,
    hasScorers: matches.some((m) => m.scorers.length > 0),
    minMatches: group.settings.minMatchesForRanking,
    rankings: rankings.map((r) => ({ ...r, entries: r.entries.map(({ userId, ...e }) => ({ ...e, user: resolve(userId) })) })),
  };
}

module.exports = { computeRankings, groupRankings, periodStart, DEFINITIONS };
