'use strict';

const mongoose = require('mongoose');
const { api, useTestDatabase, groupWithMembers } = require('./helpers');
const { computeRankings, periodStart } = require('../src/services/rankingService');
const { Match, Rating, Group } = require('../src/models');

useTestDatabase();

const byKey = (rankings, key) => rankings.find((r) => r.key === key);
const ids = (ranking) => ranking.entries.map((e) => e.userId);
const positions = (ranking) => Object.fromEntries(ranking.entries.map((e) => [e.userId, e.position]));

let n = 0;
/** Partita giocata in forma compatta: squadre, punteggio, marcatori, MVP. */
function played(a, b, scoreA, scoreB, { scorers = [], mvp = [], daysAgo = 10 } = {}) {
  n += 1;
  return { id: `m${n}`, startsAt: new Date(Date.now() - daysAgo * 86_400_000), teams: { a, b }, scoreA, scoreB, scorers, mvp };
}

const members = (...names) => names.map((userId) => ({ userId, joinedAt: new Date(Date.now() - 365 * 86_400_000) }));

describe('Calcolo delle classifiche (funzione pura)', () => {
  test('minimo partite: chi ne ha giocate meno non compare', () => {
    const matches = [played(['ale', 'bea'], ['cri', 'dan'], 2, 1), played(['ale', 'cri'], ['bea', 'dan'], 1, 0), played(['ale', 'dan'], ['bea', 'cri'], 0, 3)];
    const { rankings } = computeRankings({ matches, ratings: [], members: members('ale', 'bea', 'cri', 'dan', 'eva'), minMatches: 3 });
    expect(ids(byKey(rankings, 'vincenti')).sort()).toEqual(['ale', 'bea', 'cri', 'dan']);
    const strict = computeRankings({ matches: matches.slice(0, 2), ratings: [], members: members('ale', 'bea'), minMatches: 3 });
    expect(byKey(strict.rankings, 'vincenti').entries).toHaveLength(0);
  });

  test('i più vincenti: percentuale di vittorie, pari merito con posizione condivisa', () => {
    const matches = [played(['ale', 'bea'], ['cri', 'dan'], 2, 1), played(['ale', 'bea'], ['cri', 'dan'], 3, 1), played(['ale', 'cri'], ['bea', 'dan'], 2, 2)];
    const { rankings } = computeRankings({ matches, ratings: [], members: members('ale', 'bea', 'cri', 'dan'), minMatches: 3 });
    const r = byKey(rankings, 'vincenti');
    expect(positions(r)).toEqual({ ale: 1, bea: 1, cri: 3, dan: 3 });
    expect(r.entries[0].display).toBe('67%');
  });

  test('MVP: conta le elezioni (anche condivise) e mostra solo chi ne ha almeno una', () => {
    const matches = [
      played(['ale', 'bea'], ['cri', 'dan'], 1, 0, { mvp: ['ale'] }),
      played(['ale', 'bea'], ['cri', 'dan'], 1, 0, { mvp: ['ale', 'cri'] }),
      played(['ale', 'bea'], ['cri', 'dan'], 1, 0, { mvp: ['cri'] }),
    ];
    const { rankings } = computeRankings({ matches, ratings: [], members: members('ale', 'bea', 'cri', 'dan'), minMatches: 1 });
    const r = byKey(rankings, 'mvp');
    expect(r.entries.map((e) => [e.userId, e.value, e.position])).toEqual([
      ['ale', 2, 1],
      ['cri', 2, 1],
    ]);
  });

  test('i più forti: media voti con bonus MVP; chi non ha voti parte da 5', () => {
    const matches = [played(['ale', 'bea'], ['cri', 'dan'], 1, 0, { mvp: ['bea'] }), played(['ale', 'bea'], ['cri', 'dan'], 0, 1)];
    const ratings = [
      { match: matches[0].id, ratee: 'ale', score: 8 },
      { match: matches[1].id, ratee: 'ale', score: 6 },
      { match: matches[0].id, ratee: 'bea', score: 6 },
      { match: 'altra-partita', ratee: 'cri', score: 10 },
    ];
    const { rankings } = computeRankings({ matches, ratings, members: members('ale', 'bea', 'cri', 'dan'), minMatches: 2 });
    const r = byKey(rankings, 'forti');
    const value = Object.fromEntries(r.entries.map((e) => [e.userId, e.value]));
    expect(value.ale).toBeCloseTo(7); // (8 + 6) / 2, nessun MVP
    expect(value.bea).toBeCloseTo(7); // 6 + 2 × 1/2
    expect(value.cri).toBeCloseTo(5); // il voto di un'altra partita non conta
    // Pari merito tra ale e bea: viene prima chi ha più MVP, ma la posizione è condivisa.
    expect(r.entries.slice(0, 2).map((e) => [e.userId, e.position])).toEqual([
      ['bea', 1],
      ['ale', 1],
    ]);
  });

  test('i più sfortunati: almeno 5 partite, percentuale più bassa, pari merito rotto dalle sconfitte di un gol', () => {
    const matches = [
      played(['ale', 'bea'], ['cri', 'dan'], 1, 2),
      played(['ale', 'bea'], ['cri', 'dan'], 1, 2),
      played(['ale', 'cri'], ['bea', 'dan'], 0, 3),
      played(['ale', 'cri'], ['bea', 'dan'], 0, 4),
      played(['ale', 'bea'], ['cri', 'dan'], 2, 1),
      played(['bea', 'cri'], ['dan', 'eva'], 5, 0),
    ];
    const { rankings } = computeRankings({ matches, ratings: [], members: members('ale', 'bea', 'cri', 'dan', 'eva'), minMatches: 3 });
    const r = byKey(rankings, 'sfortunati');
    expect(r.minMatches).toBe(5);
    // ale: 1 vinta su 5 (20%); cri 3 su 6; bea e dan 4 su 6; eva esclusa (1 sola partita).
    expect(ids(r)[0]).toBe('ale');
    expect(ids(r)).not.toContain('eva');
    expect(r.title).toMatch(/non vince mai/);
  });

  test('sfortunati a pari percentuale: sale chi ha perso più partite di un gol', () => {
    const lose = (a, b, sa, sb) => played(a, b, sa, sb);
    const matches = [
      lose(['ale'], ['zed'], 0, 1),
      lose(['ale'], ['zed'], 0, 1),
      lose(['ale'], ['zed'], 0, 3),
      lose(['ale'], ['zed'], 0, 3),
      lose(['ale'], ['zed'], 0, 3),
      lose(['bob'], ['zed'], 0, 1),
      lose(['bob'], ['zed'], 0, 1),
      lose(['bob'], ['zed'], 0, 1),
      lose(['bob'], ['zed'], 0, 3),
      lose(['bob'], ['zed'], 0, 3),
    ];
    const { rankings } = computeRankings({ matches, ratings: [], members: members('ale', 'bob', 'zed'), minMatches: 3 });
    const r = byKey(rankings, 'sfortunati');
    expect(r.entries.slice(0, 2).map((e) => [e.userId, e.position])).toEqual([
      ['bob', 1],
      ['ale', 2],
    ]);
  });

  test('i più presenti: rispetto alle partite da quando si è entrati nel gruppo', () => {
    const matches = [
      played(['ale', 'bea'], ['cri', 'dan'], 1, 0, { daysAgo: 30 }),
      played(['ale', 'bea'], ['cri', 'eva'], 1, 0, { daysAgo: 20 }),
      played(['ale', 'eva'], ['cri', 'bea'], 1, 0, { daysAgo: 10 }),
      played(['ale', 'eva'], ['cri', 'bea'], 1, 0, { daysAgo: 5 }),
    ];
    const m = [...members('ale', 'bea', 'cri', 'dan'), { userId: 'eva', joinedAt: new Date(Date.now() - 25 * 86_400_000) }];
    const { rankings } = computeRankings({ matches, ratings: [], members: m, minMatches: 1 });
    const value = Object.fromEntries(byKey(rankings, 'presenti').entries.map((e) => [e.userId, e.value]));
    expect(value.ale).toBe(1);
    expect(value.eva).toBe(1); // 3 su 3 da quando è entrata
    expect(value.dan).toBe(0.25);
  });

  test('bomber: solo con marcatori inseriti, pari merito con posizione condivisa', () => {
    const matches = [
      played(['ale', 'bea'], ['cri', 'dan'], 3, 1, { scorers: [{ user: 'ale', goals: 2 }, { user: 'bea', goals: 1 }, { user: 'cri', goals: 1 }] }),
      played(['ale', 'bea'], ['cri', 'dan'], 1, 2, { scorers: [{ user: 'bea', goals: 1 }, { user: 'cri', goals: 2 }] }),
    ];
    const { rankings } = computeRankings({ matches, ratings: [], members: members('ale', 'bea', 'cri', 'dan'), minMatches: 1 });
    const r = byKey(rankings, 'bomber');
    expect(r.entries.map((e) => [e.userId, e.value, e.position])).toEqual([
      ['cri', 3, 1],
      ['ale', 2, 2],
      ['bea', 2, 2],
    ]);
    expect(ids(r)).not.toContain('dan');
  });

  test('nessuna partita: classifiche vuote senza errori', () => {
    const { rankings } = computeRankings({ matches: [], ratings: [], members: members('ale'), minMatches: 3 });
    expect(rankings.every((r) => r.entries.length === 0)).toBe(true);
    expect(rankings.map((r) => r.key)).toEqual(['forti', 'mvp', 'vincenti', 'sfortunati', 'presenti', 'bomber']);
  });

  test('periodi: mese di calendario e stagione dal 1° settembre', () => {
    const now = new Date(2026, 1, 15); // 15 febbraio 2026
    expect(periodStart('mese', now)).toEqual(new Date(2026, 1, 1));
    expect(periodStart('stagione', now)).toEqual(new Date(2025, 8, 1));
    expect(periodStart('stagione', new Date(2026, 9, 3))).toEqual(new Date(2026, 8, 1));
    expect(periodStart('sempre', now)).toBeNull();
  });
});

describe('Classifiche via API', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
    const group = await Group.findById(ctx.group.id);
    // I membri risultano nel gruppo da prima delle partite inserite qui sotto.
    group.members.forEach((m) => (m.joinedAt = new Date(Date.now() - 400 * 86_400_000)));
    await group.save();
    const [a, b, c, d] = ctx.all.map((u) => new mongoose.Types.ObjectId(u.user.id));
    const make = (daysAgo, scoreA, scoreB, extra = {}) => ({
      group: group._id,
      organizer: a,
      field: 'villastellone',
      startsAt: new Date(Date.now() - daysAgo * 86_400_000),
      slots: 4,
      freeSlots: 0,
      status: 'giocata',
      participants: [a, b, c, d].map((user) => ({ user, response: 'ci_sono' })),
      teams: { a: { name: 'Maglie chiare', players: [a, b] }, b: { name: 'Maglie scure', players: [c, d] }, method: 'manuale' },
      result: { scoreA, scoreB, scorers: [] },
      voting: { opensAt: new Date(), closesAt: new Date(), closed: true, mvp: [a] },
      ...extra,
    });
    const docs = await Match.insertMany([make(200, 3, 1), make(150, 2, 1), make(100, 4, 0), make(1, 0, 1)]);
    await Rating.create({ match: docs[0]._id, group: group._id, rater: b, ratee: a, score: 9 });
    // Una partita annullata non conta.
    await Match.create(make(50, 9, 0, { status: 'annullata' }));
  });

  test('restituisce le sei classifiche con note esplicative e utenti con soprannome', async () => {
    const res = await api().get(`/api/groups/${ctx.group.id}/rankings?period=sempre`).set(ctx.members[0].auth);
    expect(res.status).toBe(200);
    expect(res.body.totalMatches).toBe(4);
    expect(res.body.rankings).toHaveLength(6);
    expect(res.body.rankings.every((r) => r.note.length > 20)).toBe(true);
    const mvp = res.body.rankings.find((r) => r.key === 'mvp');
    expect(mvp.entries[0]).toMatchObject({ value: 4, position: 1, user: { id: ctx.admin.user.id, name: 'Admin' } });
    expect(JSON.stringify(res.body)).not.toMatch(/@calcetto\.test/);
  });

  test('il filtro per periodo considera solo le partite nel periodo', async () => {
    const res = await api().get(`/api/groups/${ctx.group.id}/rankings?period=mese`).set(ctx.admin.auth);
    expect(res.body.totalMatches).toBeLessThanOrEqual(1);
    expect((await api().get(`/api/groups/${ctx.group.id}/rankings?period=anno`).set(ctx.admin.auth)).status).toBe(422);
  });
});
