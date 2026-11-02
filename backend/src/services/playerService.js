'use strict';

/*
 * BONCARD (carta del giocatore) e BONRATING (progressione). Tutto deriva
 * dal motore statistico; i valori con pochi dati sono marcati come
 * provvisori o non disponibili, mai stimati di nascosto.
 */
const { User, Group } = require('../models');
const { forbidden, notFound } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');
const { publicUser } = require('./dto');
const statsEngine = require('./statsEngine');
const playerRating = require('./playerRating');
const seasonService = require('./seasonService');
const { computeRankings } = require('./rankingService');

const MIN_SAMPLES = 5;

const EDITIONS = [
  { key: 'leggenda', label: 'Leggenda del Gruppo', requirement: 'Almeno 50 presenze oppure 10 MVP nel gruppo.' },
  { key: 'tots', label: 'Team of the Season', requirement: 'Tra i primi 5 de "I più forti" nella stagione precedente conclusa.' },
  { key: 'mvp', label: 'MVP', requirement: "MVP dell'ultima partita del gruppo con votazione chiusa." },
  { key: 'bomber', label: 'Bomber', requirement: 'Capocannoniere della stagione in corso con almeno 3 gol.' },
  { key: 'in_forma', label: 'In Forma', requirement: 'Media degli ultimi 3 voti almeno 7 e almeno mezzo punto sopra la propria media.' },
  { key: 'base', label: 'Base', requirement: 'La carta di partenza di ogni giocatore.' },
];

const inRange = (date, season) => season && new Date(date) >= season.start && new Date(date) < season.end;
const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

async function nicknameFor(groupId, userId) {
  const { activeMap } = require('./nicknameService');
  return (await activeMap(groupId)).get(String(userId)) || null;
}

function assertMember(group, userId) {
  const member = group.members.find((m) => sameId(m.user, userId));
  if (!member) throw notFound('Questo giocatore non fa parte del gruppo.');
  return member;
}

async function groupData(group) {
  const { matches, ratings } = await statsEngine.loadPlayed(group._id);
  return { matches, ratings, rows: statsEngine.playerRows(matches, ratings) };
}

function overallOf(rows, role) {
  return playerRating.overall({
    ratings: rows.flatMap((r) => r.ratings),
    perMatch: rows.map((r) => r.avgRating),
    attributeVotes: rows.flatMap((r) => r.attributes),
    role,
    played: rows.length,
  });
}

/** Edizioni speciali con il motivo, calcolate solo dai dati del gruppo. */
function editionsFor(group, uid, { matches, rows: allRows }, ov, members, { season, prev } = {}) {
  const mine = allRows.filter((r) => r.user === uid);
  const stats = statsEngine.summarize(mine);
  const unlocked = {};

  if (stats.played >= 50 || stats.mvp >= 10) unlocked.leggenda = `${stats.played} presenze e ${stats.mvp} MVP nel gruppo.`;

  if (prev) {
    const prevMatches = matches.filter((m) => inRange(m.startsAt, prev));
    if (prevMatches.length) {
      const ratingsInPrev = new Set(prevMatches.map((m) => m.id));
      const { rankings } = computeRankings({
        matches: prevMatches,
        ratings: allRows.filter((r) => ratingsInPrev.has(r.match)).flatMap((r) => r.ratings.map((score) => ({ match: r.match, ratee: r.user, score }))),
        members,
        minMatches: group.settings.minMatchesForRanking,
      });
      const forti = rankings.find((r) => r.key === 'forti');
      const entry = forti?.entries.find((e) => e.userId === uid);
      if (entry && entry.position <= 5) unlocked.tots = `${entry.position}° tra "I più forti" nella ${prev.label.toLowerCase()}.`;
    }
  }

  const lastWithMvp = [...matches].reverse().find((m) => m.mvp.length);
  if (lastWithMvp?.mvp.includes(uid)) unlocked.mvp = `MVP della partita del ${new Date(lastWithMvp.startsAt).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })}.`;

  const goalsBy = new Map();
  for (const r of allRows.filter((x) => inRange(x.startsAt, season))) goalsBy.set(r.user, (goalsBy.get(r.user) || 0) + r.goals);
  const top = Math.max(0, ...goalsBy.values());
  if (season && top >= 3 && goalsBy.get(uid) === top) unlocked.bomber = `${top} gol nella ${season.label.toLowerCase()}: nessuno ne ha fatti di più.`;

  const lastRated = mine.map((r) => r.avgRating).filter((v) => v !== null).slice(-3);
  if (lastRated.length === 3) {
    const avg = lastRated.reduce((a, b) => a + b, 0) / 3;
    if (avg >= 7 && avg >= ov.general + 0.5) unlocked.in_forma = `Media ${String(round1(avg)).replace('.', ',')} nelle ultime 3 partite valutate.`;
  }
  unlocked.base = 'Sempre disponibile.';

  const list = EDITIONS.map((e) => ({ ...e, unlocked: Boolean(unlocked[e.key]), reason: unlocked[e.key] || null }));
  return { current: list.find((e) => e.unlocked), list };
}

function publicStats(s) {
  return { played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, goals: s.goals, mvp: s.mvp, winRate: s.winRate, avgRating: round1(s.avgRating), ratingsCount: s.ratingsCount };
}

function publicOverall(ov) {
  const attributes = Object.fromEntries(
    Object.entries(ov.attributes).map(([k, a]) => [k, a ? { value: a.value, samples: a.samples, provisional: a.provisional } : null])
  );
  return {
    overall: { value: ov.value, provisional: ov.provisional, general: ov.general, technical: ov.technical, form: ov.form, samples: ov.samples },
    attributes,
  };
}

/** BONCARD: dati della carta nel contesto del gruppo o della carriera (solo per sé). */
async function card(group, targetId, viewer, scope = 'gruppo') {
  assertMember(group, targetId);
  const uid = String(targetId);
  const user = await User.findById(uid).lean();
  if (!user) throw notFound('Giocatore non trovato.');
  if (scope === 'carriera' && !sameId(viewer._id, uid)) throw forbidden('La carriera completa è visibile solo al diretto interessato.');

  const data = await groupData(group);
  let rows = data.rows.filter((r) => r.user === uid);
  let groupsCount = 1;
  if (scope === 'carriera') {
    const groups = await Group.find({ 'members.user': uid }).select('_id').lean();
    groupsCount = groups.length;
    rows = [];
    for (const g of groups) {
      const { matches, ratings } = await statsEngine.loadPlayed(g._id);
      rows.push(...statsEngine.playerRows(matches, ratings).filter((r) => r.user === uid));
    }
    rows.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }
  const ov = overallOf(rows, user.preferredRole);
  const season = await seasonService.current(group);
  const prev = scope === 'gruppo' ? await seasonService.previous(group) : null;
  const members = group.members.map((m) => ({ userId: String(m.user), joinedAt: m.joinedAt }));
  const editions = scope === 'gruppo' ? editionsFor(group, uid, data, ov, members, { season, prev }) : { current: { ...EDITIONS[5], unlocked: true }, list: [] };

  return {
    user: publicUser(user, await nicknameFor(group._id, uid)),
    scope,
    context: scope === 'gruppo' ? `${group.name}` : `Carriera · ${groupsCount} ${groupsCount === 1 ? 'gruppo' : 'gruppi'}`,
    stats: publicStats(statsEngine.summarize(rows)),
    season: { label: season ? season.label : 'Fuori stagione', stats: publicStats(statsEngine.summarize(rows.filter((r) => inRange(r.startsAt, season)))) },
    ...publicOverall(ov),
    edition: editions.current,
    editions: editions.list,
    minSamples: MIN_SAMPLES,
    weights: playerRating.WEIGHTS[user.preferredRole] ? user.preferredRole : 'non indicato',
  };
}

function streak(rows, ok) {
  let best = 0;
  let cur = 0;
  let from = null;
  let bestRange = null;
  for (const r of rows) {
    if (ok(r)) {
      if (!cur) from = r.startsAt;
      cur += 1;
      if (cur > best) {
        best = cur;
        bestRange = { from, to: r.startsAt };
      }
    } else cur = 0;
  }
  return { length: best, ...bestRange };
}

/** BONRATING: andamento, forma, record e confronto tra stagioni. */
async function progression(group, targetId) {
  const member = assertMember(group, targetId);
  const uid = String(targetId);
  const user = await User.findById(uid).lean();
  const data = await groupData(group);
  const rows = data.rows.filter((r) => r.user === uid);

  let sum = 0;
  let n = 0;
  const timeline = rows.map((r) => {
    sum += r.ratings.reduce((a, b) => a + b, 0);
    n += r.ratings.length;
    return {
      matchId: r.match,
      date: r.startsAt,
      field: r.field,
      result: r.result,
      score: `${r.goalsFor}-${r.goalsAgainst}`,
      goals: r.goals,
      mvp: r.mvp,
      rating: round1(r.avgRating),
      ratingsCount: r.ratings.length,
      cumulative: round1(playerRating.bayes(sum, n, playerRating.constants.K_GENERAL)),
    };
  });

  const scored = rows.filter((r) => r.hasScorers);
  const lastFive = rows.slice(-5);
  const lastRated = lastFive.map((r) => r.avgRating).filter((v) => v !== null);
  const available = data.matches.filter((m) => new Date(m.startsAt) >= new Date(member.joinedAt)).length;
  const s = statsEngine.summarize(rows);

  const best = [...rows]
    .filter((r) => r.avgRating !== null || r.goals > 0 || r.mvp)
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0) || b.goals - a.goals || Number(b.mvp) - Number(a.mvp))
    .slice(0, 3)
    .map((r) => ({ matchId: r.match, date: r.startsAt, field: r.field, rating: round1(r.avgRating), goals: r.goals, mvp: r.mvp, result: r.result, score: `${r.goalsFor}-${r.goalsAgainst}` }));

  const mostGoals = rows.reduce((b, r) => (r.goals > (b?.goals || 0) ? r : b), null);
  const bestRated = rows.filter((r) => r.avgRating !== null).reduce((b, r) => (!b || r.avgRating > b.avgRating ? r : b), null);

  const bySeason = new Map();
  const custom = await seasonService.customFor(group);
  for (const r of rows) {
    const season = seasonService.seasonAt(group, r.startsAt, custom);
    if (!season) continue; // partita fuori da ogni stagione personalizzata
    if (!bySeason.has(season.key)) bySeason.set(season.key, { key: season.key, label: season.label, start: season.start, rows: [] });
    bySeason.get(season.key).rows.push(r);
  }

  return {
    user: publicUser(user, await nicknameFor(group._id, uid)),
    timeline,
    form: { results: lastFive.map((r) => r.result), avgRating: lastRated.length ? round1(lastRated.reduce((a, b) => a + b, 0) / lastRated.length) : null, rated: lastRated.length },
    goalsPerMatch: { value: scored.length ? Math.round((scored.reduce((a, r) => a + r.goals, 0) / scored.length) * 100) / 100 : null, matches: scored.length },
    winRate: { value: s.winRate, played: s.played, reliable: s.played >= MIN_SAMPLES },
    mvp: s.mvp,
    presences: { played: s.played, available: Math.max(available, s.played), rate: available ? s.played / Math.max(available, s.played) : null },
    best,
    records: {
      mostGoals: mostGoals ? { goals: mostGoals.goals, matchId: mostGoals.match, date: mostGoals.startsAt } : null,
      bestRating: bestRated ? { rating: round1(bestRated.avgRating), matchId: bestRated.match, date: bestRated.startsAt } : null,
      winStreak: streak(rows, (r) => r.result === 'V'),
      unbeaten: streak(rows, (r) => r.result !== 'S'),
    },
    seasons: [...bySeason.values()]
      .sort((a, b) => a.start - b.start)
      .map((x) => ({ key: x.key, label: x.label, ...publicStats(statsEngine.summarize(x.rows)) })),
    minSamples: MIN_SAMPLES,
  };
}

module.exports = { card, progression, EDITIONS };
