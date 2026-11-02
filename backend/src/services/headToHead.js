'use strict';

/*
 * Confronti testa a testa tra due giocatori, calcolati dalle righe del
 * motore statistico. Usato da MATCHDAY e dalla sezione Rivalità.
 */
const MIN_MEETINGS = 3; // sotto questa soglia il confronto è "da confermare"

function headToHead(rows, a, b) {
  const byMatch = new Map();
  for (const r of rows) {
    if (r.user !== a && r.user !== b) continue;
    if (!byMatch.has(r.match)) byMatch.set(r.match, {});
    byMatch.get(r.match)[r.user === a ? 'a' : 'b'] = r;
  }
  const shared = [...byMatch.values()].filter((x) => x.a && x.b).sort((x, y) => new Date(x.a.startsAt) - new Date(y.a.startsAt));
  const together = shared.filter((x) => x.a.team === x.b.team);
  const opposed = shared.filter((x) => x.a.team !== x.b.team);
  const avg = (list) => (list.length ? Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 10) / 10 : null);

  const winsA = opposed.filter((x) => x.a.result === 'V').length;
  const winsB = opposed.filter((x) => x.b.result === 'V').length;
  // Serie in corso: vittorie consecutive dello stesso giocatore negli scontri diretti più recenti.
  let streak = { holder: null, length: 0 };
  for (const x of [...opposed].reverse()) {
    const winner = x.a.result === 'V' ? 'a' : x.b.result === 'V' ? 'b' : null;
    if (!winner) break;
    if (!streak.holder) streak = { holder: winner, length: 1 };
    else if (streak.holder === winner) streak.length += 1;
    else break;
  }

  return {
    users: [a, b],
    together: { played: together.length, wins: together.filter((x) => x.a.result === 'V').length },
    opposed: {
      played: opposed.length,
      winsA,
      winsB,
      draws: opposed.length - winsA - winsB,
      goalsA: opposed.reduce((s, x) => s + x.a.goals, 0),
      goalsB: opposed.reduce((s, x) => s + x.b.goals, 0),
    },
    mvp: { a: shared.filter((x) => x.a.mvp).length, b: shared.filter((x) => x.b.mvp).length },
    avgRating: { a: avg(shared.flatMap((x) => x.a.ratings)), b: avg(shared.flatMap((x) => x.b.ratings)) },
    last: opposed
      .slice(-5)
      .reverse()
      .map((x) => ({ matchId: x.a.match, date: x.a.startsAt, field: x.a.field, resultA: x.a.result, score: `${x.a.goalsFor}-${x.a.goalsAgainst}` })),
    streak: streak.holder ? { user: streak.holder === 'a' ? a : b, length: streak.length } : null,
    reliable: opposed.length >= MIN_MEETINGS,
    minMeetings: MIN_MEETINGS,
  };
}

/** Rivalità "naturali": coppie che si sono affrontate più spesso, a parità le più equilibrate. */
function autoRivalries(rows, userIds, { limit = 6 } = {}) {
  const pairs = [];
  for (let i = 0; i < userIds.length; i++) {
    for (let j = i + 1; j < userIds.length; j++) {
      const h = headToHead(rows, userIds[i], userIds[j]);
      if (h.opposed.played >= MIN_MEETINGS) pairs.push(h);
    }
  }
  return pairs
    .sort((x, y) => y.opposed.played - x.opposed.played || Math.abs(x.opposed.winsA - x.opposed.winsB) - Math.abs(y.opposed.winsA - y.opposed.winsB))
    .slice(0, limit);
}

module.exports = { headToHead, autoRivalries, MIN_MEETINGS };
