'use strict';

/*
 * Terzo tempo: storico e statistiche delle votazioni "dove si va dopo la
 * partita". Solo dati aggregati: chi ha votato cosa resta anonimo, come
 * nelle votazioni. "Chi perde offre il primo giro" è un gesto facoltativo del
 * gruppo e qui compare soltanto come informazione, mai come obbligo o debito.
 */
const { Match, PrizeVote } = require('../models');
const { getField } = require('../config/appConfig');
const { playersOf } = require('./teamService');
const seasonService = require('./seasonService');
const votingService = require('./votingService');

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

async function windowFor(group, { season, period }) {
  if (season) {
    const found = await seasonService.byKey(group, season);
    return { range: { $gte: found.season.start, $lt: found.season.end }, season: found.season };
  }
  if (period === 'stagione') {
    const current = await seasonService.current(group);
    return current ? { range: { $gte: current.start, $lt: current.end }, season: current } : { range: { $gte: new Date(0), $lt: new Date(0) }, season: null };
  }
  return { range: null, season: null };
}

/** Streak attuale: da quante partite vince la stessa opzione (solo vittorie uniche, dalla più recente). */
function currentStreak(history) {
  let key = null;
  let length = 0;
  for (const h of history) {
    if (h.winners.length !== 1) break;
    if (key === null) key = h.winners[0].key;
    if (h.winners[0].key !== key) break;
    length += 1;
  }
  return length >= 2 ? { key, label: history[0].winners[0].label, emoji: history[0].winners[0].emoji, length } : null;
}

async function forGroup(group, { season = null, period = 'sempre', limit = 30 } = {}) {
  // Chiude le votazioni scadute prima di leggerle, così lo storico è sempre aggiornato.
  await votingService.finalizeExpired();
  const { range, season: seasonInfo } = await windowFor(group, { season, period });
  const filter = { group: group._id, prizePoll: { $ne: null }, ...(range ? { startsAt: range } : {}) };
  const matches = await Match.find(filter).sort({ startsAt: -1 }).lean();
  const votes = matches.length ? await PrizeVote.find({ match: { $in: matches.map((m) => m._id) } }).select('match option').lean() : [];
  const tally = new Map();
  for (const v of votes) {
    const key = String(v.match);
    if (!tally.has(key)) tally.set(key, new Map());
    tally.get(key).set(v.option, (tally.get(key).get(v.option) || 0) + 1);
  }

  const withLoser = Boolean(group.settings.loserPaysFirstRound);
  const entry = (m) => {
    const t = tally.get(String(m._id)) || new Map();
    const options = m.prizePoll.options.map((o) => ({ key: o.key, label: o.label, emoji: o.emoji, votes: t.get(o.key) || 0 }));
    const eligible = playersOf(m).length;
    const loser = withLoser && m.result && m.teams ? votingService.loserTeam(m) : undefined;
    return {
      matchId: String(m._id),
      startsAt: m.startsAt,
      field: m.field,
      fieldName: getField(m.field)?.name || m.field,
      score: m.result ? `${m.teams.a.name} ${m.result.scoreA} - ${m.result.scoreB} ${m.teams.b.name}` : null,
      closed: Boolean(m.prizePoll.closed),
      closesAt: m.voting?.closesAt || null,
      closedAt: m.prizePoll.closedAt || null,
      options,
      winners: (m.prizePoll.winners || []).map((k) => options.find((o) => o.key === k)).filter(Boolean),
      votedCount: options.reduce((a, o) => a + o.votes, 0),
      eligibleCount: eligible,
      // Solo informazione, se il gruppo ha attivato il gesto: nessun debito, nessun importo.
      ...(withLoser && m.prizePoll.closed && loser !== undefined ? { loserTeam: loser ? m.teams[loser].name : null, draw: !loser } : {}),
    };
  };

  const all = matches.map(entry);
  const closed = all.filter((e) => e.closed);
  const open = all.filter((e) => !e.closed).map(({ matchId, startsAt, fieldName, closesAt, votedCount, eligibleCount, options }) => ({ matchId, startsAt, fieldName, closesAt, votedCount, eligibleCount, options }));

  const byOption = new Map();
  for (const e of closed) {
    for (const o of e.options) {
      if (!byOption.has(o.key)) byOption.set(o.key, { key: o.key, label: o.label, emoji: o.emoji, wins: 0, votes: 0 });
      byOption.get(o.key).votes += o.votes;
    }
    for (const w of e.winners) byOption.get(w.key).wins += 1;
  }
  const totalVotes = closed.reduce((a, e) => a + e.votedCount, 0);
  const eligible = closed.reduce((a, e) => a + e.eligibleCount, 0);
  const options = [...byOption.values()]
    .map((o) => ({ ...o, share: totalVotes ? round(o.votes / totalVotes) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.votes - a.votes || a.label.localeCompare(b.label));
  const topWins = options[0]?.wins || 0;
  const withVotes = closed.filter((e) => e.votedCount > 0);

  return {
    period: seasonInfo ? 'stagione' : period,
    season: seasonInfo ? { key: seasonInfo.key, label: seasonInfo.label } : null,
    loserPaysFirstRound: withLoser,
    open,
    stats: {
      polls: closed.length,
      pollsWithVotes: withVotes.length,
      totalVotes,
      participationRate: eligible ? round(totalVotes / eligible) : null,
      options,
      // Il premio più scelto: chi ha vinto più serate; parità = più opzioni.
      mostChosen: topWins > 0 ? options.filter((o) => o.wins === topWins) : [],
      streak: currentStreak(withVotes),
    },
    history: closed.slice(0, Math.min(Math.max(limit, 1), 100)),
    hasMore: closed.length > limit,
  };
}

module.exports = { forGroup };
