'use strict';

/*
 * Hall of Fame: vincitori delle stagioni chiuse, record assoluti e giocatori
 * più premiati. Tutto deriva dai dati reali tramite il motore statistico;
 * dove i dati non bastano il record è null, mai inventato.
 */
const statsEngine = require('./statsEngine');
const seasonService = require('./seasonService');
const nicknameService = require('./nicknameService');
const { computeRankings } = require('./rankingService');
const { userResolver } = require('./dto');

const TITLES = [
  { key: 'forti', title: 'I più forti' },
  { key: 'mvp', title: 'MVP' },
  { key: 'bomber', title: 'Bomber' },
  { key: 'vincenti', title: 'I più vincenti' },
];

const dec = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');

function longestWinStreak(rows) {
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user)) byUser.set(r.user, []);
    byUser.get(r.user).push(r);
  }
  let best = null;
  for (const [user, list] of byUser) {
    let cur = 0;
    let from = null;
    for (const r of list) {
      if (r.result === 'V') {
        if (!cur) from = r.startsAt;
        cur += 1;
        if (!best || cur > best.length) best = { users: [user], length: cur, from, to: r.startsAt };
        else if (cur === best.length && !best.users.includes(user)) best.users.push(user);
      } else cur = 0;
    }
  }
  return best;
}

/** Il valore massimo con tutti i pari merito. */
function topBy(map, minValue = 1) {
  const max = Math.max(0, ...map.values());
  if (max < minValue) return null;
  return { value: max, users: [...map].filter(([, v]) => v === max).map(([u]) => u) };
}

async function forGroup(group, now = new Date()) {
  const { matches, ratings } = await statsEngine.loadPlayed(group._id);
  const rows = statsEngine.playerRows(matches, ratings);
  const members = group.members.map((m) => ({ userId: String(m.user), joinedAt: m.joinedAt }));
  const minMatches = group.settings.minMatchesForRanking;

  // Vincitori delle stagioni già concluse (solo quelle con almeno una partita).
  const seasons = [];
  const titleCount = new Map();
  for (const season of (await seasonService.list(group, now)).filter((s) => s.closed)) {
    const inSeason = matches.filter((m) => new Date(m.startsAt) >= season.start && new Date(m.startsAt) < season.end);
    if (!inSeason.length) continue;
    const ids = new Set(inSeason.map((m) => m.id));
    const { rankings } = computeRankings({ matches: inSeason, ratings: ratings.filter((r) => ids.has(r.match)), members, minMatches });
    const winners = TITLES.map((t) => {
      const ranking = rankings.find((r) => r.key === t.key);
      const first = ranking.entries.filter((e) => e.position === 1);
      for (const e of t.key === 'forti' ? first : []) titleCount.set(e.userId, (titleCount.get(e.userId) || 0) + 1);
      return { key: t.key, title: t.title, display: first[0]?.display || null, users: first.map((e) => e.userId) };
    });
    seasons.push({ key: season.key, label: season.label, start: season.start, end: season.end, matches: inSeason.length, winners });
  }

  // Record assoluti.
  const perUser = new Map();
  for (const r of rows) {
    if (!perUser.has(r.user)) perUser.set(r.user, []);
    perUser.get(r.user).push(r);
  }
  const summaries = new Map([...perUser].map(([u, list]) => [u, statsEngine.summarize(list)]));
  const goalsInMatch = rows.filter((r) => r.hasScorers && r.goals > 0).sort((a, b) => b.goals - a.goals);
  const widest = [...matches].sort((a, b) => Math.abs(b.scoreA - b.scoreB) - Math.abs(a.scoreA - a.scoreB))[0];
  const streak = longestWinStreak(rows);
  const presences = topBy(new Map([...summaries].map(([u, s]) => [u, s.played])));
  const mvps = topBy(new Map([...summaries].map(([u, s]) => [u, s.mvp])));
  const scorer = topBy(new Map([...summaries].map(([u, s]) => [u, s.goals])));
  const rated = [...summaries].filter(([, s]) => s.avgRating !== null && s.played >= minMatches);
  const bestAvg = rated.length ? Math.max(...rated.map(([, s]) => s.avgRating)) : null;

  const awardsBy = new Map();
  for (const [u, s] of summaries) awardsBy.set(u, { mvp: s.mvp, awards: 0, seasonTitles: titleCount.get(u) || 0 });
  for (const m of matches) for (const w of m.awardWinners) for (const u of w.users) if (awardsBy.has(u)) awardsBy.get(u).awards += 1;

  const records = [
    {
      key: 'gol_partita',
      title: 'Più gol in una partita',
      value: goalsInMatch[0] ? String(goalsInMatch[0].goals) : null,
      users: goalsInMatch[0] ? goalsInMatch.filter((r) => r.goals === goalsInMatch[0].goals).map((r) => r.user) : [],
      matchId: goalsInMatch[0]?.match || null,
      date: goalsInMatch[0]?.startsAt || null,
    },
    {
      key: 'vittoria_larga',
      title: 'Vittoria più larga',
      value: widest && widest.scoreA !== widest.scoreB ? `${Math.max(widest.scoreA, widest.scoreB)}-${Math.min(widest.scoreA, widest.scoreB)}` : null,
      users: widest && widest.scoreA !== widest.scoreB ? (widest.scoreA > widest.scoreB ? widest.teams.a : widest.teams.b) : [],
      matchId: widest?.id || null,
      date: widest?.startsAt || null,
    },
    { key: 'serie_vittorie', title: 'Serie di vittorie più lunga', value: streak && streak.length >= 2 ? `${streak.length}` : null, users: streak && streak.length >= 2 ? streak.users : [], date: streak?.to || null },
    { key: 'presenze', title: 'Più presenze', value: presences ? String(presences.value) : null, users: presences?.users || [] },
    { key: 'mvp', title: 'Più MVP', value: mvps ? String(mvps.value) : null, users: mvps?.users || [] },
    { key: 'capocannoniere', title: 'Capocannoniere di sempre', value: scorer ? String(scorer.value) : null, users: scorer?.users || [] },
    {
      key: 'voto_medio',
      title: 'Miglior voto medio',
      note: `Con almeno ${minMatches} partite giocate.`,
      value: bestAvg === null ? null : dec(bestAvg),
      users: bestAvg === null ? [] : rated.filter(([, s]) => s.avgRating === bestAvg).map(([u]) => u),
    },
  ];

  const mostAwarded = [...awardsBy]
    .map(([userId, a]) => ({ userId, ...a, total: a.mvp + a.awards + a.seasonTitles }))
    .filter((a) => a.total > 0)
    .sort((a, b) => b.total - a.total || b.mvp - a.mvp || a.userId.localeCompare(b.userId))
    .slice(0, 5);

  const allUsers = new Set([...records.flatMap((r) => r.users), ...seasons.flatMap((s) => s.winners.flatMap((w) => w.users)), ...mostAwarded.map((a) => a.userId)]);
  const resolve = await userResolver([...allUsers], await nicknameService.activeMap(group._id));
  const withUsers = (ids) => ids.map((id) => resolve(id));

  return {
    totalMatches: matches.length,
    seasons: seasons.map((s) => ({ ...s, winners: s.winners.map(({ users, ...w }) => ({ ...w, users: withUsers(users) })) })),
    records: records.map(({ users, ...r }) => ({ ...r, available: r.value !== null, users: withUsers(users) })),
    mostAwarded: mostAwarded.map(({ userId, ...a }) => ({ ...a, user: resolve(userId) })),
  };
}

module.exports = { forGroup };
