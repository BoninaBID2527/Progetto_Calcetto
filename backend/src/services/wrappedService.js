'use strict';

/*
 * BONWRAPPED: il riepilogo di una stagione di un giocatore. Ogni numero e
 * ogni "momento" nasce dalle partite e dai voti salvati; se una sezione non
 * ha dati sufficienti viene omessa (mai riempita con valori inventati) e se
 * le partite sono troppo poche l'intero riepilogo dichiara che non basta.
 */
const { User, Achievement } = require('../models');
const { notFound } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');
const { getField } = require('../config/appConfig');
const statsEngine = require('./statsEngine');
const seasonService = require('./seasonService');
const rankingService = require('./rankingService');
const nicknameService = require('./nicknameService');
const achievementService = require('./achievementService');
const awardsService = require('./awardsService');
const { publicUser } = require('./dto');

const MIN_MATCHES = 3; // sotto questa soglia il riepilogo non si genera
const MIN_FACED = 3; // scontri o partite insieme per parlare di rivalità o intesa
const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const matchRef = (r) => ({ matchId: r.match, date: r.startsAt, field: r.field, fieldName: getField(r.field)?.name || r.field, score: `${r.goalsFor}-${r.goalsAgainst}`, result: r.result });

function longestStreak(rows) {
  let best = null;
  let cur = 0;
  let from = null;
  for (const r of rows) {
    if (r.result === 'V') {
      if (!cur) from = r;
      cur += 1;
      if (!best || cur > best.length) best = { length: cur, from: from.startsAt, to: r.startsAt };
    } else cur = 0;
  }
  return best;
}

async function windowFor(group, seasonKey) {
  if (!seasonKey) return { season: null, since: null, until: null };
  if (seasonKey === 'corrente') {
    const current = await seasonService.current(group);
    return current ? { season: current, since: current.start, until: current.end } : { season: { key: null, label: 'Fuori stagione' }, since: new Date(0), until: new Date(0) };
  }
  const { season } = await seasonService.byKey(group, seasonKey);
  return { season, since: season.start, until: season.end };
}

async function forPlayer(group, targetId, { season: seasonKey = 'corrente' } = {}) {
  const member = group.members.find((m) => sameId(m.user, targetId));
  if (!member) throw notFound('Questo giocatore non fa parte del gruppo.');
  const uid = String(targetId);
  const user = await User.findById(uid).lean();
  const { season, since, until } = await windowFor(group, seasonKey === 'sempre' ? null : seasonKey);
  const { matches, ratings } = await statsEngine.loadPlayed(group._id, { since, until });
  const rows = statsEngine.playerRows(matches, ratings).filter((r) => r.user === uid);
  const nick = (await nicknameService.activeMap(group._id)).get(uid) || null;

  const base = {
    user: publicUser(user, nick),
    season: season ? { key: season.key, label: season.label, start: season.start, end: season.end } : null,
    period: season ? 'stagione' : 'sempre',
    minMatches: MIN_MATCHES,
  };
  if (rows.length < MIN_MATCHES) {
    return {
      ...base,
      enough: false,
      played: rows.length,
      reason: `Servono almeno ${MIN_MATCHES} partite giocate${season ? ` in ${season.label.toLowerCase()}` : ''} per creare il riepilogo: finora ${rows.length}.`,
    };
  }

  const s = statsEngine.summarize(rows);
  const scored = rows.filter((r) => r.hasScorers);
  const rated = rows.filter((r) => r.avgRating !== null);

  // Momenti: solo ciò che è davvero accaduto.
  const moments = [];
  const firstGoal = rows.find((r) => r.goals > 0);
  if (firstGoal) moments.push({ key: 'primo_gol', title: 'Il primo gol', text: `Hai sbloccato il tuo contatore${firstGoal.goals > 1 ? ` con una doppietta` : ''}.`, ...matchRef(firstGoal) });
  const hatTrick = rows.filter((r) => r.goals >= 3).sort((a, b) => b.goals - a.goals)[0];
  if (hatTrick) moments.push({ key: 'tripletta', title: hatTrick.goals === 3 ? 'Una tripletta' : `${hatTrick.goals} gol in una partita`, text: 'Una serata da incorniciare.', ...matchRef(hatTrick) });
  const streak = longestStreak(rows);
  if (streak && streak.length >= 3) moments.push({ key: 'serie', title: `${streak.length} vittorie di fila`, text: 'La tua serie più lunga.', matchId: null, date: streak.to });
  const biggest = rows.filter((r) => r.result === 'V').sort((a, b) => b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst))[0];
  if (biggest && biggest.goalsFor - biggest.goalsAgainst >= 4) moments.push({ key: 'goleada', title: 'La goleada', text: `Vittoria per ${biggest.goalsFor - biggest.goalsAgainst} gol di scarto.`, ...matchRef(biggest) });
  for (const r of rows.filter((x) => x.mvp).slice(0, 3)) moments.push({ key: 'mvp', title: 'MVP della serata', text: 'Eletto dai compagni.', ...matchRef(r) });

  // Rivalità e intesa: avversario più incontrato e compagno più frequente, con soglia minima.
  const faced = new Map();
  const together = new Map();
  for (const r of rows) {
    for (const o of r.opponents) {
      const t = faced.get(o) || { id: o, played: 0, wins: 0, draws: 0, losses: 0 };
      t.played += 1;
      if (r.result === 'V') t.wins += 1;
      else if (r.result === 'P') t.draws += 1;
      else t.losses += 1;
      faced.set(o, t);
    }
    for (const m of r.mates) {
      const t = together.get(m) || { id: m, played: 0, wins: 0, draws: 0, losses: 0 };
      t.played += 1;
      if (r.result === 'V') t.wins += 1;
      else if (r.result === 'P') t.draws += 1;
      else t.losses += 1;
      together.set(m, t);
    }
  }
  const rival = [...faced.values()].filter((t) => t.played >= MIN_FACED).sort((a, b) => b.played - a.played || b.wins - a.wins || a.id.localeCompare(b.id))[0] || null;
  const partner = [...together.values()].filter((t) => t.played >= MIN_FACED).sort((a, b) => b.wins / b.played - a.wins / a.played || b.played - a.played || a.id.localeCompare(b.id))[0] || null;

  // Premi di partita e traguardi del periodo.
  const awardLabels = { ...awardsService.DEFAULT_LABELS, ironico: group.settings.awards?.ironico?.label || awardsService.DEFAULT_LABELS.ironico };
  const awardCount = new Map();
  for (const m of matches) for (const w of m.awardWinners) if (w.users.includes(uid)) awardCount.set(w.key, (awardCount.get(w.key) || 0) + 1);
  const unlocked = await Achievement.find({ group: group._id, user: uid, ...(since ? { unlockedAt: { $gte: since, $lt: until } } : {}) }).sort({ unlockedAt: 1 }).lean();
  const labelOf = new Map(achievementService.DEFINITIONS.map((d) => [d.key, d.label]));

  // Progressione: prima e seconda metà delle partite valutate, solo con dati sufficienti.
  let progression = null;
  if (rated.length >= 4) {
    const half = Math.floor(rated.length / 2);
    progression = {
      points: rated.map((r) => ({ date: r.startsAt, rating: round1(r.avgRating) })),
      first: round1(mean(rated.slice(0, half).map((r) => r.avgRating))),
      second: round1(mean(rated.slice(rated.length - half).map((r) => r.avgRating))),
    };
    progression.delta = round1(progression.second - progression.first);
  }

  // Posizioni nelle classifiche del periodo (stessi criteri e minimi delle classifiche).
  const rank = await rankingService.groupRankings(group, season?.key ? { season: season.key } : { period: 'sempre' });
  const standings = ['forti', 'vincenti', 'mvp', 'bomber', 'presenti']
    .map((k) => {
      const r = rank.rankings.find((x) => x.key === k);
      const e = r.entries.find((x) => x.user.id === uid);
      return e ? { key: k, title: r.title, position: e.position, of: r.entries.length, display: e.display } : null;
    })
    .filter(Boolean);

  const best = [...rated].sort((a, b) => b.avgRating - a.avgRating || b.goals - a.goals || Number(b.mvp) - Number(a.mvp))[0] || null;
  const mostGoals = rows.filter((r) => r.hasScorers && r.goals > 0).sort((a, b) => b.goals - a.goals)[0] || null;
  const opponentUsers = async (id) => (id ? publicUser(await User.findById(id).lean(), (await nicknameService.activeMap(group._id)).get(id) || null) : null);

  return {
    ...base,
    enough: true,
    summary: {
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      winRate: s.winRate,
      goals: scored.length ? s.goals : null,
      goalsMatches: scored.length,
      mvp: s.mvp,
      avgRating: round1(s.avgRating),
      ratingsCount: s.ratingsCount,
      firstMatchAt: rows[0].startsAt,
      lastMatchAt: rows.at(-1).startsAt,
    },
    bestMatch: best ? { ...matchRef(best), rating: round1(best.avgRating), goals: best.hasScorers ? best.goals : null, mvp: best.mvp } : null,
    moments,
    rivalry: rival ? { user: await opponentUsers(rival.id), played: rival.played, wins: rival.wins, draws: rival.draws, losses: rival.losses } : null,
    partner: partner ? { user: await opponentUsers(partner.id), played: partner.played, wins: partner.wins, draws: partner.draws, losses: partner.losses } : null,
    awards: { mvp: s.mvp, matchAwards: [...awardCount].map(([key, count]) => ({ key, label: awardLabels[key] || key, count })) },
    achievements: unlocked.map((a) => ({ key: a.key, label: labelOf.get(a.key) || a.key, unlockedAt: a.unlockedAt })),
    progression,
    records: {
      mostGoals: mostGoals ? { goals: mostGoals.goals, ...matchRef(mostGoals) } : null,
      bestRating: best ? { rating: round1(best.avgRating), ...matchRef(best) } : null,
      winStreak: streak && streak.length >= 2 ? streak : null,
    },
    standings,
  };
}

module.exports = { forPlayer, MIN_MATCHES };
