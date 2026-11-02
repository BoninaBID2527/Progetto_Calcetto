'use strict';

const { Match, MvpVote } = require('../models');
const { sameId } = require('../utils/helpers');
const matchService = require('./matchService');
const statsEngine = require('./statsEngine');
const rankingService = require('./rankingService');
const activityService = require('./activityService');
const pollService = require('./pollService');

const MIN_SAMPLES = 5; // sotto queste partite le percentuali sono "provvisorie"

/** Tutto ciò che serve alla home del gruppo, calcolato dai dati salvati. */
async function forUser(group, user) {
  const uid = String(user._id);
  const upcomingRaw = await Match.find({ group: group._id, status: { $in: ['aperta', 'chiusa'] } }).sort({ startsAt: 1 }).limit(4).lean();
  const upcoming = await matchService.toDtos(upcomingRaw);

  const votingRaw = await Match.find({ group: group._id, status: 'giocata', 'voting.closed': false }).lean();
  const mine = votingRaw.filter((m) => [...(m.teams?.a?.players || []), ...(m.teams?.b?.players || [])].some((p) => sameId(p, uid)));
  const voted = mine.length ? await MvpVote.find({ match: { $in: mine.map((m) => m._id) }, voter: uid }).select('match').lean() : [];
  const openVoting = mine
    .filter((m) => !voted.some((v) => sameId(v.match, m._id)))
    .map((m) => ({ matchId: String(m._id), field: m.field, startsAt: m.startsAt, closesAt: m.voting.closesAt }));

  const { matches, ratings } = await statsEngine.loadPlayed(group._id);
  const rows = statsEngine.playerRows(matches, ratings).filter((r) => r.user === uid);
  const summary = statsEngine.summarize(rows);

  const season = await rankingService.groupRankings(group, 'stagione');
  const positions = season.rankings.map((r) => {
    const entry = r.entries.find((e) => e.user.id === uid);
    return { key: r.key, title: r.title, position: entry?.position || null, value: entry?.display || null, total: r.entries.length, minMatches: r.minMatches };
  });

  const openPolls = await pollService.list(group, { scope: 'aperte' });

  return {
    nextMatch: upcoming[0] || null,
    openPolls,
    upcoming: upcoming.slice(1),
    openVoting,
    me: { ...summary, form: rows.slice(-5).map((r) => r.result), minSamples: MIN_SAMPLES },
    positions,
    seasonMatches: season.totalMatches,
    activity: (await activityService.list(group._id, { limit: 8 })).items,
  };
}

module.exports = { forUser, MIN_SAMPLES };
