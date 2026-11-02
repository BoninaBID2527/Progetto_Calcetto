'use strict';

/*
 * MATCHDAY: tutto il prepartita in una risposta. Overall e forma vengono
 * dallo stesso algoritmo della BONCARD; le rivalità solo da scontri reali.
 */
const { getField } = require('../config/appConfig');
const statsEngine = require('./statsEngine');
const playerRating = require('./playerRating');
const matchService = require('./matchService');
const { autoRivalries } = require('./headToHead');

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

async function forMatch(match) {
  const dto = await matchService.dtoOf(typeof match.toObject === 'function' ? match.toObject() : match);
  const { matches, ratings } = await statsEngine.loadPlayed(match.group);
  const rows = statsEngine.playerRows(matches, ratings).filter((r) => r.match !== String(match._id));
  const confirmed = dto.participants.filter((p) => p.response === 'ci_sono').map((p) => p.user);

  const players = confirmed.map((u) => {
    const mine = rows.filter((r) => r.user === u.id);
    const ov = playerRating.overall({
      ratings: mine.flatMap((r) => r.ratings),
      perMatch: mine.map((r) => r.avgRating),
      attributeVotes: mine.flatMap((r) => r.attributes),
      role: u.preferredRole,
      played: mine.length,
    });
    const last3 = mine.map((r) => r.avgRating).filter((v) => v !== null).slice(-3);
    const formAvg = avg(last3);
    return {
      user: u,
      overall: ov.value,
      provisional: ov.provisional,
      played: mine.length,
      goals: mine.reduce((s, r) => s + r.goals, 0),
      mvp: mine.filter((r) => r.mvp).length,
      form: mine.slice(-5).map((r) => r.result),
      inForm: last3.length === 3 && formAvg >= 7 && formAvg >= ov.general + 0.5,
      formAvg: formAvg === null ? null : Math.round(formAvg * 10) / 10,
    };
  });

  const byId = new Map(players.map((p) => [p.user.id, p]));
  const teamInfo = (team) => {
    if (!team) return null;
    const list = team.players.map((u) => byId.get(u.id)).filter(Boolean);
    return { name: team.name, count: list.length, avgOverall: list.length ? Math.round(avg(list.map((p) => p.overall))) : null };
  };

  const rivalries = autoRivalries(rows, confirmed.map((u) => u.id), { limit: 3 }).map((h) => ({
    a: byId.get(h.users[0]).user,
    b: byId.get(h.users[1]).user,
    opposed: h.opposed,
    streak: h.streak,
  }));

  return {
    match: dto,
    field: getField(match.field),
    players: players.sort((x, y) => y.overall - x.overall),
    teams: dto.teams ? { a: teamInfo(dto.teams.a), b: teamInfo(dto.teams.b) } : null,
    inForm: players.filter((p) => p.inForm).map((p) => ({ user: p.user, formAvg: p.formAvg })),
    rivalries,
  };
}

module.exports = { forMatch };
