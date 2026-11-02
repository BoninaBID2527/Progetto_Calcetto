'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond } = require('./helpers');
const { balance } = require('../src/services/teamService');
const { headToHead } = require('../src/services/headToHead');

useTestDatabase();

function seeded(seed) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Bilancia v2', () => {
  const roles = ['difensore', 'difensore', 'attaccante', 'attaccante', 'centrocampista', 'centrocampista'];
  const players = roles.map((role, i) => ({ id: `p${i}`, rating: 6, role }));

  test('difensori e attaccanti divisi tra le due squadre', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { a } = balance(players, { random: seeded(seed) });
      expect(a.filter((id) => ['p0', 'p1'].includes(id))).toHaveLength(1);
      expect(a.filter((id) => ['p2', 'p3'].includes(id))).toHaveLength(1);
    }
  });

  test('"Rigenera" non ripropone la formazione attuale quando c\'è un\'alternativa equilibrata', () => {
    const first = balance(players, { random: seeded(4) });
    for (let seed = 1; seed <= 15; seed++) {
      const next = balance(players, { random: seeded(seed), avoid: first });
      expect([next.a.sort().join(), next.b.sort().join()]).not.toContain([...first.a].sort().join());
    }
  });
});

describe('Testa a testa', () => {
  const row = (match, user, team, result, goals = 0) => ({ match, startsAt: new Date(2026, 0, Number(match.slice(1))), user, team, result, goals, mvp: false, ratings: [], goalsFor: 2, goalsAgainst: 1, field: 'santena' });
  test('conta scontri diretti, gol, partite insieme e la serie in corso', () => {
    const rows = [
      row('m1', 'a', 'a', 'V', 1), row('m1', 'b', 'b', 'S'),
      row('m2', 'a', 'a', 'S'), row('m2', 'b', 'b', 'V', 2),
      row('m3', 'a', 'b', 'V'), row('m3', 'b', 'a', 'S'),
      row('m4', 'a', 'a', 'V', 1), row('m4', 'b', 'b', 'S'),
      row('m5', 'a', 'a', 'V'), row('m5', 'b', 'a', 'V'),
    ];
    const h = headToHead(rows, 'a', 'b');
    expect(h.opposed).toMatchObject({ played: 4, winsA: 3, winsB: 1, goalsA: 2, goalsB: 2 });
    expect(h.together).toMatchObject({ played: 1, wins: 1 });
    expect(h.streak).toEqual({ user: 'a', length: 2 });
    expect(h.reliable).toBe(true);
    expect(headToHead(rows.slice(0, 4), 'a', 'b').reliable).toBe(false);
  });
});

describe('MATCHDAY via API', () => {
  test('overall dei convocati, media delle squadre, rivalità solo con abbastanza scontri', async () => {
    const ctx = await groupWithMembers(4);
    const [a, b, c, d] = ctx.all;
    // Tre partite con a e b sempre avversari.
    for (let i = 0; i < 3; i++) {
      const m = await createMatch(ctx.admin, ctx.group, { slots: 4 });
      for (const u of ctx.all) await respond(u, m);
      await api().post(`/api/matches/${m.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
      await api().put(`/api/matches/${m.id}/teams`).set(ctx.admin.auth).send({ a: { players: [a.user.id, c.user.id] }, b: { players: [b.user.id, d.user.id] } });
      await api().put(`/api/matches/${m.id}/result`).set(ctx.admin.auth).send({ scoreA: 2, scoreB: 1 });
      await api().post(`/api/matches/${m.id}/ratings`).set(b.auth).send({ ratings: [{ userId: a.user.id, score: 9 }] });
    }
    const next = await createMatch(ctx.admin, ctx.group, { slots: 4 });
    for (const u of ctx.all) await respond(u, next);
    await api().post(`/api/matches/${next.id}/teams/balance`).set(ctx.admin.auth).send({});
    const res = await api().get(`/api/matches/${next.id}/matchday`).set(c.auth);
    expect(res.status).toBe(200);
    const md = res.body.matchday;
    expect(md.players).toHaveLength(4);
    expect(md.players[0].user.id).toBe(a.user.id); // il migliore per overall
    expect(md.players[0].played).toBe(3);
    expect(md.teams.a.avgOverall).toEqual(expect.any(Number));
    expect(md.rivalries.length).toBeGreaterThanOrEqual(1);
    expect(md.rivalries[0].opposed.played).toBe(3);
    expect(md.field.name).toBe('Santena');
    expect(JSON.stringify(md)).not.toMatch(/@calcetto\.test/);
  });
});
