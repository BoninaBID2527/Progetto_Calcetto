'use strict';

const { Match, Rating } = require('../models');
const { conflict, unprocessable } = require('../utils/AppError');
const { DEFAULTS } = require('../config/appConfig');
const { sameId } = require('../utils/helpers');
const matchService = require('./matchService');

/**
 * Divide i giocatori in due squadre equilibrate.
 *
 * Valuta tutte le divisioni possibili (fino a 16 giocatori sono al massimo
 * 6.435 combinazioni) e, per non proporre sempre le stesse squadre, sceglie a
 * caso tra quelle la cui differenza di forza è entro `tolerance` dalla
 * migliore. Due portieri finiscono in squadre diverse quando possibile.
 *
 * @param {{id: string, rating: number, role?: string}[]} players
 * @param {{random?: () => number, tolerance?: number}} options
 */
function balance(players, { random = Math.random, tolerance = 0.6 } = {}) {
  const n = players.length;
  if (n < 2) throw unprocessable('Servono almeno 2 giocatori per fare le squadre.');
  const sizeA = Math.floor(n / 2);
  const goalkeepers = players.map((p, i) => (p.role === 'portiere' ? i : -1)).filter((i) => i >= 0);

  const cost = (inA) => {
    let sumA = 0;
    let sumB = 0;
    players.forEach((p, i) => (inA[i] ? (sumA += p.rating) : (sumB += p.rating)));
    const gkA = goalkeepers.filter((i) => inA[i]).length;
    const gkSplitPenalty = goalkeepers.length >= 2 && (gkA === 0 || gkA === goalkeepers.length) ? 1.5 : 0;
    return { diff: Math.abs(sumA - sumB), score: Math.abs(sumA - sumB) + gkSplitPenalty };
  };

  const candidates = [];
  const choose = (start, picked) => {
    if (picked.length === sizeA) {
      const inA = new Array(n).fill(false);
      picked.forEach((i) => (inA[i] = true));
      candidates.push({ inA, ...cost(inA) });
      return;
    }
    for (let i = start; i < n; i++) {
      if (n - i < sizeA - picked.length) break;
      picked.push(i);
      choose(i + 1, picked);
      picked.pop();
    }
  };

  if (n <= 16) {
    choose(0, []);
  } else {
    for (let k = 0; k < 4000; k++) {
      const order = players.map((_, i) => i).sort(() => random() - 0.5);
      const inA = new Array(n).fill(false);
      order.slice(0, sizeA).forEach((i) => (inA[i] = true));
      candidates.push({ inA, ...cost(inA) });
    }
  }

  const best = Math.min(...candidates.map((c) => c.score));
  const good = candidates.filter((c) => c.score <= best + tolerance);
  const pick = good[Math.floor(random() * good.length)];
  // A caso quale gruppo diventa "A", così anche i colori delle maglie cambiano.
  const flip = random() < 0.5;
  const a = players.filter((_, i) => pick.inA[i] !== flip).map((p) => p.id);
  const b = players.filter((_, i) => pick.inA[i] === flip).map((p) => p.id);
  const strength = (ids) => ids.reduce((s, id) => s + players.find((p) => p.id === id).rating, 0);
  return { a, b, diff: Math.abs(strength(a) - strength(b)), strengthA: strength(a), strengthB: strength(b) };
}

/** Media dei voti ricevuti nel gruppo; chi non ne ha mai ricevuti vale 5. */
async function ratingsFor(groupId, userIds) {
  const ratings = await Rating.find({ group: groupId, ratee: { $in: userIds } }).lean();
  const sums = new Map();
  for (const r of ratings) {
    const key = String(r.ratee);
    const s = sums.get(key) || { total: 0, count: 0 };
    s.total += r.score;
    s.count += 1;
    sums.set(key, s);
  }
  return new Map(
    userIds.map((id) => {
      const s = sums.get(String(id));
      return [String(id), s ? s.total / s.count : DEFAULTS.newPlayerRating];
    })
  );
}

function assertEditable(match) {
  if (!['aperta', 'chiusa', 'giocata'].includes(match.status)) throw conflict('Le squadre non si possono più modificare.');
  if (match.status === 'giocata' && match.result) throw conflict('Il risultato è già stato inserito: le squadre sono definitive.');
}

const teamNames = (match, names) => names || [match.teams?.a?.name || DEFAULTS.teamNames[0], match.teams?.b?.name || DEFAULTS.teamNames[1]];

async function autoBalance(match, { names, random } = {}) {
  assertEditable(match);
  const confirmed = match.participants.filter((p) => p.response === 'ci_sono');
  const { User } = require('../models');
  const users = await User.find({ _id: { $in: confirmed.map((p) => p.user) } }).lean();
  const ratings = await ratingsFor(match.group, users.map((u) => u._id));
  const players = users.map((u) => ({ id: String(u._id), rating: ratings.get(String(u._id)), role: u.preferredRole }));
  const result = balance(players, { random });
  const [nameA, nameB] = teamNames(match, names);
  await Match.updateOne(
    { _id: match._id },
    { $set: { teams: { a: { name: nameA, players: result.a }, b: { name: nameB, players: result.b }, method: 'bilancia', updatedAt: new Date() } } }
  );
  const dto = await matchService.broadcast(match._id);
  return { match: dto, strength: { a: result.strengthA, b: result.strengthB, diff: result.diff } };
}

async function setManual(match, { a, b }) {
  assertEditable(match);
  const confirmed = match.participants.filter((p) => p.response === 'ci_sono').map((p) => String(p.user));
  const all = [...a.players, ...b.players];
  if (new Set(all).size !== all.length) throw unprocessable('Un giocatore non può stare in entrambe le squadre.', { teams: 'Giocatore ripetuto.' });
  const outsiders = all.filter((id) => !confirmed.includes(id));
  if (outsiders.length) throw unprocessable('Nelle squadre ci vanno solo i presenti.', { teams: 'Giocatore non iscritto.' });
  const [nameA, nameB] = teamNames(match, [a.name, b.name].every(Boolean) ? [a.name, b.name] : null);
  await Match.updateOne(
    { _id: match._id },
    { $set: { teams: { a: { name: a.name || nameA, players: a.players }, b: { name: b.name || nameB, players: b.players }, method: 'manuale', updatedAt: new Date() } } }
  );
  return { match: await matchService.broadcast(match._id) };
}

const playersOf = (match) => [...(match.teams?.a?.players || []), ...(match.teams?.b?.players || [])];
const teamOf = (match, userId) => {
  if ((match.teams?.a?.players || []).some((id) => sameId(id, userId))) return 'a';
  if ((match.teams?.b?.players || []).some((id) => sameId(id, userId))) return 'b';
  return null;
};

module.exports = { balance, ratingsFor, autoBalance, setManual, playersOf, teamOf };
