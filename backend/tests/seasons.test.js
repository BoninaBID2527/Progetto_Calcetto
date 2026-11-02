'use strict';

const mongoose = require('mongoose');
const { api, useTestDatabase, groupWithMembers } = require('./helpers');
const { computeRankings } = require('../src/services/rankingService');
const seasonService = require('../src/services/seasonService');
const { Match, Rating, Group } = require('../src/models');

useTestDatabase();

const byKey = (rankings, key) => rankings.find((r) => r.key === key);
const day = 86_400_000;
let n = 0;
function played(a, b, scoreA, scoreB, { scorers = [], daysAgo = 10 } = {}) {
  n += 1;
  return { id: `s${n}`, startsAt: new Date(Date.now() - daysAgo * day), teams: { a, b }, scoreA, scoreB, scorers, mvp: [] };
}
const members = (...ids) => ids.map((userId) => ({ userId, joinedAt: new Date(Date.now() - 900 * day) }));
const rate = (match, ratee, score, attributes) => ({ match: match.id, ratee, score, attributes });

describe('Nuove classifiche (funzione pura)', () => {
  const m = [1, 2, 3, 4, 5, 6].map((i) => played(['ale', 'bea'], ['cri', 'dan'], 2, 1, { daysAgo: 70 - i * 10, scorers: i <= 4 ? [{ user: 'ale', goals: 2 }] : [] }));

  test('in forma: media delle ultime 5 partite valutate, servono almeno 3 partite valutate', () => {
    const ratings = [
      rate(m[0], 'ale', 2),
      rate(m[1], 'ale', 6),
      rate(m[2], 'ale', 6),
      rate(m[3], 'ale', 8),
      rate(m[4], 'ale', 8),
      rate(m[5], 'ale', 10),
      rate(m[0], 'bea', 9),
      rate(m[1], 'bea', 9),
    ];
    const r = byKey(computeRankings({ matches: m, ratings, members: members('ale', 'bea', 'cri', 'dan') }).rankings, 'forma');
    expect(r.entries.map((e) => e.userId)).toEqual(['ale']); // bea ha solo 2 partite valutate
    expect(r.entries[0].value).toBeCloseTo((6 + 6 + 8 + 8 + 10) / 5); // la prima (2) esce dalla finestra
    expect(r.available).toBe(true);
  });

  test('media gol: solo partite con marcatori, requisito esplicito', () => {
    const r = byKey(computeRankings({ matches: m, ratings: [], members: members('ale', 'bea', 'cri', 'dan'), minMatches: 3 }).rankings, 'media_gol');
    expect(r.entries.map((e) => [e.userId, e.value])).toEqual([
      ['ale', 2], // 8 gol in 4 partite con marcatori (non in 6)
      ['bea', 0],
      ['cri', 0],
      ['dan', 0],
    ].map(([u, v]) => [u, v]));
    const none = byKey(computeRankings({ matches: [played(['ale'], ['bea'], 1, 0)], ratings: [], members: members('ale', 'bea'), minMatches: 1 }).rankings, 'media_gol');
    expect(none.available).toBe(false);
    expect(none.unavailableReason).toMatch(/marcatori/);
  });

  test('difensore: DIF bayesiano con almeno 3 valutazioni', () => {
    const ratings = [rate(m[0], 'cri', 7, { dif: 9 }), rate(m[1], 'cri', 7, { dif: 9 }), rate(m[2], 'cri', 7, { dif: 9 }), rate(m[0], 'dan', 7, { dif: 10 }), rate(m[1], 'dan', 7, { dif: 10 })];
    const r = byKey(computeRankings({ matches: m, ratings, members: members('ale', 'bea', 'cri', 'dan') }).rankings, 'difensore');
    expect(r.entries.map((e) => e.userId)).toEqual(['cri']);
    expect(r.entries[0].value).toBeCloseTo((27 + 3 * 5) / 6);
  });

  test('portiere: solo chi ha ruolo portiere e almeno 3 voti', () => {
    const ratings = [rate(m[0], 'ale', 9), rate(m[1], 'ale', 9), rate(m[2], 'ale', 9), rate(m[0], 'bea', 9), rate(m[1], 'bea', 9), rate(m[2], 'bea', 9)];
    const r = byKey(computeRankings({ matches: m, ratings, members: members('ale', 'bea'), roles: { ale: 'portiere', bea: 'attaccante' } }).rankings, 'portiere');
    expect(r.entries.map((e) => e.userId)).toEqual(['ale']);
    expect(r.entries[0].value).toBeCloseTo((27 + 4 * 5) / 7);
    const nobody = byKey(computeRankings({ matches: m, ratings, members: members('ale', 'bea') }).rankings, 'portiere');
    expect(nobody.available).toBe(false);
  });

  test('rendimento e crescita: media del periodo e differenza con la stagione precedente, parità condivisa', () => {
    const ratings = [rate(m[0], 'ale', 8), rate(m[1], 'ale', 8), rate(m[2], 'ale', 8), rate(m[0], 'bea', 8), rate(m[1], 'bea', 8), rate(m[2], 'bea', 8), rate(m[0], 'cri', 5), rate(m[1], 'cri', 5)];
    const previousAvg = { ale: { avg: 6, count: 5 }, bea: { avg: 6, count: 2 }, cri: { avg: 4, count: 9 } };
    const { rankings } = computeRankings({ matches: m, ratings, members: members('ale', 'bea', 'cri'), previousAvg });
    const rend = byKey(rankings, 'rendimento');
    expect(rend.entries.map((e) => [e.userId, e.position])).toEqual([['ale', 1], ['bea', 1]]); // cri: solo 2 voti
    const crescita = byKey(rankings, 'crescita');
    expect(crescita.entries.map((e) => e.userId)).toEqual(['ale']); // bea: solo 2 voti nella stagione precedente
    expect(crescita.entries[0].display).toBe('+2,0');
  });
});

describe('Stagioni via API', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });
  const url = (p) => `/api/groups/${ctx.group.id}${p}`;

  test('impostazioni: default annuale da settembre, solo gli admin le cambiano', async () => {
    const res = await api().get(url('/seasons')).set(ctx.members[0].auth);
    expect(res.status).toBe(200);
    expect(res.body.mode).toEqual({ mode: 'annuale', startMonth: 9 });
    expect(res.body.seasons[0]).toMatchObject({ current: true, closed: false });
    const denied = await api().patch(url('')).set(ctx.members[0].auth).send({ settings: { season: { mode: 'mensile' } } });
    expect(denied.status).toBe(403);
    const ok = await api().patch(url('')).set(ctx.admin.auth).send({ settings: { season: { mode: 'mensile' } } });
    expect(ok.status).toBe(200);
    expect((await api().get(url('/seasons')).set(ctx.admin.auth)).body.seasons[0].label).toMatch(/\d{4}$/);
  });

  test('stagioni personalizzate: solo in modalità personalizzata, niente sovrapposizioni, solo admin', async () => {
    const body = { name: 'Estate', startsAt: '2025-06-01T00:00:00.000Z', endsAt: '2025-09-01T00:00:00.000Z' };
    expect((await api().post(url('/seasons')).set(ctx.admin.auth).send(body)).status).toBe(422); // modalità mensile
    await api().patch(url('')).set(ctx.admin.auth).send({ settings: { season: { mode: 'personalizzata' } } });
    expect((await api().post(url('/seasons')).set(ctx.members[0].auth).send(body)).status).toBe(403);
    expect((await api().post(url('/seasons')).set(ctx.admin.auth).send({ ...body, endsAt: body.startsAt })).status).toBe(422);
    const created = await api().post(url('/seasons')).set(ctx.admin.auth).send(body);
    expect(created.status).toBe(201);
    const overlap = await api().post(url('/seasons')).set(ctx.admin.auth).send({ ...body, name: 'Sovrapposta', startsAt: '2025-08-01T00:00:00.000Z', endsAt: '2025-10-01T00:00:00.000Z' });
    expect(overlap.status).toBe(422);
    const adjacent = await api().post(url('/seasons')).set(ctx.admin.auth).send({ name: 'Autunno', startsAt: '2025-09-01T00:00:00.000Z', endsAt: '2025-12-01T00:00:00.000Z' });
    expect(adjacent.status).toBe(201);
    const list = await api().get(url('/seasons')).set(ctx.members[1].auth);
    expect(list.body.seasons.map((s) => s.label)).toEqual(['Autunno', 'Estate']);
    expect((await api().delete(url(`/seasons/${created.body.season.id}`)).set(ctx.members[0].auth)).status).toBe(403);
    expect((await api().delete(url(`/seasons/${created.body.season.id}`)).set(ctx.admin.auth)).status).toBe(204);
    expect((await api().delete(url(`/seasons/${created.body.season.id}`)).set(ctx.admin.auth)).status).toBe(404);
  });

  test('fuori da ogni stagione personalizzata: BONCARD e classifica non si rompono', async () => {
    const group = await Group.findById(ctx.group.id);
    const group2 = await seasonService.current(group, new Date('2030-01-01'));
    expect(group2).toBeNull();
    const card = await api().get(url(`/players/${ctx.admin.user.id}/card`)).set(ctx.admin.auth);
    expect(card.status).toBe(200);
    const rk = await api().get(url('/rankings?period=stagione')).set(ctx.admin.auth);
    expect(rk.status).toBe(200);
    expect(rk.body.totalMatches).toBe(0);
    expect(rk.body.season.label).toBe('Fuori stagione');
    const prog = await api().get(url(`/players/${ctx.admin.user.id}/progression`)).set(ctx.admin.auth);
    expect(prog.status).toBe(200);
  });
});

describe('Stagioni, confronto con la precedente e Hall of Fame', () => {
  let ctx;
  let ids;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
    const group = await Group.findById(ctx.group.id);
    group.members.forEach((m) => (m.joinedAt = new Date(Date.now() - 900 * day)));
    group.settings.season = { mode: 'trimestrale', startMonth: 1 };
    group.settings.minMatchesForRanking = 1;
    await group.save();
    ids = ctx.all.map((u) => new mongoose.Types.ObjectId(u.user.id));
    const [a, b, c, d] = ids;
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    const thisStart = new Date(now.getFullYear(), q * 3, 1);
    const at = (date, offsetDays) => new Date(date.getTime() + offsetDays * day);
    const prevStart = new Date(thisStart.getFullYear(), thisStart.getMonth() - 3, 1);
    const make = (startsAt, teamA, teamB, scoreA, scoreB, extra = {}) => ({
      group: group._id,
      organizer: a,
      field: 'villastellone',
      startsAt,
      slots: 4,
      freeSlots: 0,
      status: 'giocata',
      participants: [a, b, c, d].map((user) => ({ user, response: 'ci_sono' })),
      teams: { a: { name: 'Chiare', players: teamA }, b: { name: 'Scure', players: teamB }, method: 'manuale' },
      result: { scoreA, scoreB, scorers: extra.scorers || [] },
      voting: { opensAt: startsAt, closesAt: startsAt, closed: true, mvp: extra.mvp || [] },
    });
    // Stagione precedente: a e b dominano, c vince una.
    await Match.insertMany([
      make(at(prevStart, 3), [a, b], [c, d], 5, 1, { scorers: [{ user: a, goals: 4 }, { user: b, goals: 1 }, { user: c, goals: 1 }], mvp: [a] }),
      make(at(prevStart, 10), [a, b], [c, d], 3, 0, { mvp: [a] }),
      make(at(prevStart, 17), [a, c], [b, d], 1, 0, { mvp: [c] }),
      // Stagione corrente: ribaltone, d e c vincono.
      make(at(thisStart, 0.5), [a, b], [c, d], 0, 2, { scorers: [{ user: c, goals: 2 }], mvp: [c] }),
      make(at(thisStart, 0.6), [a, b], [c, d], 1, 4, { scorers: [{ user: d, goals: 3 }, { user: a, goals: 1 }], mvp: [d] }),
    ]);
  });
  const url = (p) => `/api/groups/${ctx.group.id}${p}`;

  test('periodo "stagione": solo le partite della stagione corrente, con la posizione nella precedente', async () => {
    const res = await api().get(url('/rankings?period=stagione')).set(ctx.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.totalMatches).toBe(2);
    expect(res.body.previous).toMatchObject({ label: expect.stringMatching(/trimestre/) });
    const vincenti = res.body.rankings.find((r) => r.key === 'vincenti');
    const [a, b, c, d] = ctx.all.map((u) => u.user.id);
    const pos = Object.fromEntries(vincenti.entries.map((e) => [e.user.id, [e.position, e.previousPosition]]));
    expect(pos[c][0]).toBe(1);
    expect(pos[a][1]).toBe(1); // a dominava nella stagione precedente
    expect(pos[d][1]).toBe(4);
    expect(pos[b][0]).toBeGreaterThan(pos[c][0]);
  });

  test('una stagione si apre per chiave, anche quella passata', async () => {
    const list = await api().get(url('/seasons')).set(ctx.admin.auth);
    const past = list.body.seasons.find((s) => s.closed);
    const res = await api().get(url(`/rankings?season=${encodeURIComponent(past.key)}`)).set(ctx.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.totalMatches).toBe(3);
    expect(res.body.season.key).toBe(past.key);
    const bomber = res.body.rankings.find((r) => r.key === 'bomber');
    expect(bomber.entries[0]).toMatchObject({ value: 4, user: { id: ctx.all[0].user.id } });
    expect((await api().get(url('/rankings?season=inesistente')).set(ctx.admin.auth)).status).toBe(404);
  });

  test('Hall of Fame: vincitori delle stagioni chiuse e record da dati reali', async () => {
    const res = await api().get(url('/hall-of-fame')).set(ctx.members[0].auth);
    expect(res.status).toBe(200);
    const hof = res.body.hallOfFame;
    expect(hof.totalMatches).toBe(5);
    const past = hof.seasons.find((s) => s.matches === 3);
    expect(past).toBeTruthy();
    const bomber = past.winners.find((w) => w.key === 'bomber');
    expect(bomber.users.map((u) => u.id)).toEqual([ctx.all[0].user.id]);
    const rec = Object.fromEntries(hof.records.map((r) => [r.key, r]));
    expect(rec.gol_partita).toMatchObject({ value: '4', available: true });
    expect(rec.vittoria_larga.value).toBe('5-1');
    expect(rec.capocannoniere.value).toBe('5'); // a: 4 + 1
    expect(rec.mvp.value).toBe('2');
    expect(rec.presenze.value).toBe('5');
    expect(hof.mostAwarded[0].user.id).toBe(ctx.all[0].user.id);
    expect(JSON.stringify(res.body)).not.toMatch(/@calcetto\.test/);
  });

  test('Hall of Fame vuota: record non disponibili, nessun valore inventato', async () => {
    const empty = await groupWithMembers(3);
    const res = await api().get(`/api/groups/${empty.group.id}/hall-of-fame`).set(empty.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.hallOfFame.seasons).toEqual([]);
    expect(res.body.hallOfFame.records.every((r) => r.available === false && r.value === null)).toBe(true);
    expect(res.body.hallOfFame.mostAwarded).toEqual([]);
  });

  test('chi non è nel gruppo non vede stagioni né Hall of Fame', async () => {
    const outsider = (await groupWithMembers(2)).admin;
    expect((await api().get(url('/hall-of-fame')).set(outsider.auth)).status).toBe(403);
    expect((await api().get(url('/seasons')).set(outsider.auth)).status).toBe(403);
  });
});
