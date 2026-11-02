'use strict';

const { DEFAULTS } = require('../config/appConfig');
const statsEngine = require('./statsEngine');
const { userResolver } = require('./dto');
const nicknameService = require('./nicknameService');
const seasonService = require('./seasonService');
const playerRating = require('./playerRating');

const MIN_RATED = 3; // voti/partite valutate necessari alle classifiche "di voto"
const FORM_WINDOW = 5;

/** Inizio del periodo "mese", o della stagione del 1° settembre (solo come ripiego puro: il gruppo usa la stagione configurata). */
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
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const oneDecimal = (v) => v.toFixed(1).replace('.', ',');

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
  {
    key: 'forma',
    title: 'In forma',
    requirement: 'Almeno 3 partite valutate dai compagni.',
    note: 'Media dei voti di partita ricevuti nelle ultime 5 partite valutate. Servono almeno 3 partite valutate. A parità, conta la media complessiva del periodo.',
    eligible: (s) => s.matchAvgs.length >= MIN_RATED,
    minimum: () => 0,
    value: (s) => mean(s.matchAvgs.slice(-FORM_WINDOW)),
    tie: (s) => [round(mean(s.matchAvgs))],
    order: 'desc',
    display: oneDecimal,
    detail: (s) => `ultime ${Math.min(FORM_WINDOW, s.matchAvgs.length)} partite valutate`,
    bar: (v) => v / 10,
  },
  {
    key: 'media_gol',
    title: 'Media gol',
    requirement: 'Almeno il minimo di partite del gruppo con i marcatori inseriti.',
    note: 'Gol segnati divisi per le partite giocate in cui sono stati inseriti i marcatori. Servono almeno tante partite con marcatori quante il minimo del gruppo. A parità, conta chi ha segnato più gol.',
    eligible: (s, ctx) => s.scoredPlayed >= Math.max(1, ctx.minMatches),
    minimum: () => 0,
    value: (s) => s.goals / s.scoredPlayed,
    tie: (s) => [s.goals],
    order: 'desc',
    display: (v) => v.toFixed(2).replace('.', ','),
    detail: (s) => `${s.goals} gol in ${s.scoredPlayed} partite con marcatori`,
    bar: (v, max) => (max ? v / max : 0),
  },
  {
    key: 'difensore',
    title: 'Miglior difensore',
    requirement: 'Almeno 3 valutazioni dell’attributo DIF.',
    note: "Attributo Difesa (DIF) ricevuto dai compagni, con media bayesiana: con pochi voti resta vicino a 5. Servono almeno 3 valutazioni DIF. A parità, conta chi ha più valutazioni.",
    eligible: (s) => s.difCount >= MIN_RATED,
    minimum: () => 0,
    value: (s) => playerRating.bayes(s.difSum, s.difCount, playerRating.constants.K_ATTRIBUTE),
    tie: (s) => [s.difCount],
    order: 'desc',
    display: oneDecimal,
    detail: (s) => `${s.difCount} valutazioni DIF`,
    bar: (v) => v / 10,
  },
  {
    key: 'portiere',
    title: 'Miglior portiere',
    requirement: 'Ruolo portiere e almeno 3 voti ricevuti.',
    note: 'Voto generale bayesiano dei soli giocatori con ruolo portiere nel profilo. Servono almeno 3 voti. A parità, conta chi ha più voti.',
    eligible: (s) => s.role === 'portiere' && s.ratingCount >= MIN_RATED,
    minimum: () => 0,
    value: (s) => playerRating.bayes(s.ratingSum, s.ratingCount, playerRating.constants.K_GENERAL),
    tie: (s) => [s.ratingCount],
    order: 'desc',
    display: oneDecimal,
    detail: (s) => `${s.ratingCount} voti ricevuti`,
    bar: (v) => v / 10,
  },
  {
    key: 'rendimento',
    title: 'Rendimento',
    requirement: 'Almeno 3 voti ricevuti nel periodo.',
    note: 'Voto medio ricevuto nel periodo scelto. Servono almeno 3 voti. A parità, conta chi ha più voti.',
    eligible: (s) => s.ratingCount >= MIN_RATED,
    minimum: () => 0,
    value: (s) => s.ratingSum / s.ratingCount,
    tie: (s) => [s.ratingCount],
    order: 'desc',
    display: oneDecimal,
    detail: (s) => `${s.ratingCount} voti ricevuti`,
    bar: (v) => v / 10,
  },
  {
    key: 'crescita',
    title: 'Crescita',
    requirement: 'Almeno 3 voti nel periodo e 3 nella stagione precedente.',
    note: 'Voto medio del periodo meno quello della stagione precedente. Servono almeno 3 voti in entrambe. A parità, conta il voto medio attuale.',
    eligible: (s) => s.ratingCount >= MIN_RATED && s.previous && s.previous.count >= MIN_RATED,
    minimum: () => 0,
    value: (s) => s.ratingSum / s.ratingCount - s.previous.avg,
    tie: (s) => [round(s.ratingSum / s.ratingCount)],
    order: 'desc',
    display: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}`,
    detail: (s) => `da ${s.previous.avg.toFixed(1).replace('.', ',')} a ${(s.ratingSum / s.ratingCount).toFixed(1).replace('.', ',')}`,
    bar: (v) => Math.min(1, Math.max(0, (v + 3) / 6)),
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
function computeRankings({ matches, ratings, members, roles = {}, previousAvg = {}, minMatches = DEFAULTS.minMatchesForRanking, minUnlucky = DEFAULTS.minMatchesForUnlucky }) {
  const stats = new Map(
    members.map((m) => [
      m.userId,
      { userId: m.userId, joinedAt: m.joinedAt, played: 0, wins: 0, draws: 0, losses: 0, oneGoalLosses: 0, goals: 0, mvp: 0, ratingSum: 0, ratingCount: 0, available: 0, scoredPlayed: 0, difSum: 0, difCount: 0, matchAvgs: [], role: roles[m.userId] || null, previous: previousAvg[m.userId] || null },
    ])
  );
  const matchIds = new Set(matches.map((m) => m.id));
  const ordered = [...matches].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  // Voti ricevuti per partita, per la media delle ultime partite (forma).
  const perMatch = new Map();
  for (const r of ratings) {
    if (!matchIds.has(r.match) || !stats.has(r.ratee)) continue;
    const key = `${r.match}:${r.ratee}`;
    if (!perMatch.has(key)) perMatch.set(key, []);
    perMatch.get(key).push(r.score);
  }

  for (const m of ordered) {
    for (const s of stats.values()) if (!s.joinedAt || new Date(m.startsAt) >= new Date(s.joinedAt)) s.available += 1;
    for (const side of ['a', 'b']) {
      const mine = side === 'a' ? m.scoreA : m.scoreB;
      const theirs = side === 'a' ? m.scoreB : m.scoreA;
      for (const id of m.teams[side]) {
        const s = stats.get(id);
        if (!s) continue;
        s.played += 1;
        if (m.scorers.length) s.scoredPlayed += 1;
        const received = perMatch.get(`${m.id}:${id}`);
        if (received) s.matchAvgs.push(mean(received));
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
    if (typeof r.attributes?.dif === 'number') {
      s.difSum += r.attributes.dif;
      s.difCount += 1;
    }
  }

  const ctx = { minMatches, minUnlucky: Math.max(minUnlucky, minMatches) };
  const rankings = DEFINITIONS.map((def) => {
    const minimum = def.minimum ? def.minimum(ctx) : def.key === 'sfortunati' ? ctx.minUnlucky : minMatches;
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
    const available = entries.length > 0;
    return {
      key: def.key,
      title: def.title,
      note: def.note,
      requirement: def.requirement || `Almeno ${minimum} partite giocate nel periodo.`,
      minMatches: minimum,
      available,
      unavailableReason: available ? null : `Nessuno soddisfa ancora il requisito: ${(def.requirement || `Almeno ${minimum} partite giocate nel periodo.`).replace(/\.$/, '')}.`,
      entries,
    };
  });

  return { rankings, stats: Object.fromEntries([...stats].map(([id, s]) => [id, s])) };
}

async function loadComputed(group, { since, until }, extra = {}) {
  const { matches, ratings } = await statsEngine.loadPlayed(group._id, { since, until });
  const members = group.members.map((m) => ({ userId: String(m.user), joinedAt: m.joinedAt }));
  const computed = computeRankings({ matches, ratings, members, minMatches: group.settings.minMatchesForRanking, ...extra });
  return { matches, ratings, members, ...computed };
}

/** Voto medio e numero di voti per giocatore (serve a "Crescita"). */
function averages(ratings, matches) {
  const ids = new Set(matches.map((m) => m.id));
  const acc = {};
  for (const r of ratings) {
    if (!ids.has(r.match)) continue;
    acc[r.ratee] = acc[r.ratee] || { sum: 0, count: 0 };
    acc[r.ratee].sum += r.score;
    acc[r.ratee].count += 1;
  }
  return Object.fromEntries(Object.entries(acc).map(([id, a]) => [id, { avg: a.sum / a.count, count: a.count }]));
}

/**
 * Classifiche del gruppo. `period`: mese | stagione | sempre; con `season`
 * (chiave di una stagione del gruppo) si guarda quella stagione. Ogni voce
 * porta anche `previousPosition` nella stagione precedente, se esiste.
 */
async function groupRankings(group, options = {}, now = new Date()) {
  const { period = 'sempre', season: seasonKey = null } = typeof options === 'string' ? { period: options } : options;
  let window = { since: periodStart(period === 'mese' ? 'mese' : null, now), until: null };
  let season = null;
  let previous = null;
  if (seasonKey) {
    const found = await seasonService.byKey(group, seasonKey, now);
    season = found.season;
    previous = found.previous;
  } else if (period === 'stagione') {
    season = await seasonService.current(group, now);
    previous = await seasonService.previous(group, now);
  }
  const outOfSeason = (seasonKey || period === 'stagione') && !season;
  if (season) window = { since: season.start, until: season.end };
  if (outOfSeason) window = { since: new Date(0), until: new Date(0) }; // nessuna stagione in corso: nessuna partita

  const members = group.members.map((m) => ({ userId: String(m.user), joinedAt: m.joinedAt }));
  const resolve = await userResolver(members.map((m) => m.userId), await nicknameService.activeMap(group._id));
  const roles = Object.fromEntries(members.map((m) => [m.userId, resolve(m.userId)?.preferredRole || null]));

  let previousAvg = {};
  const previousPositions = {};
  if (previous) {
    const before = await statsEngine.loadPlayed(group._id, { since: previous.start, until: previous.end });
    previousAvg = averages(before.ratings, before.matches);
    const prevResult = computeRankings({ matches: before.matches, ratings: before.ratings, members, roles, minMatches: group.settings.minMatchesForRanking });
    for (const r of prevResult.rankings) previousPositions[r.key] = Object.fromEntries(r.entries.map((e) => [e.userId, e.position]));
  }

  const { matches, rankings } = await loadComputed(group, window, { roles, previousAvg });
  return {
    period: season ? 'stagione' : period,
    since: window.since,
    until: window.until,
    season: season ? { key: season.key, label: season.label, start: season.start, end: season.end } : outOfSeason ? { key: null, label: 'Fuori stagione' } : null,
    previous: previous ? { key: previous.key, label: previous.label } : null,
    totalMatches: matches.length,
    hasScorers: matches.some((m) => m.scorers.length > 0),
    minMatches: group.settings.minMatchesForRanking,
    rankings: rankings.map((r) => ({
      ...r,
      entries: r.entries.map(({ userId, ...e }) => ({ ...e, previousPosition: previousPositions[r.key]?.[userId] ?? null, user: resolve(userId) })),
    })),
  };
}

module.exports = { computeRankings, groupRankings, periodStart, DEFINITIONS };
