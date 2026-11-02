'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond } = require('./helpers');
const { balance } = require('../src/services/teamService');

useTestDatabase();

// Generatore pseudo-casuale con seme, per test ripetibili.
function seeded(seed) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const sum = (ids, players) => ids.reduce((s, id) => s + players.find((p) => p.id === id).rating, 0);

describe('Algoritmo "Bilancia"', () => {
  const players = [9, 8.5, 8, 7, 6.5, 6, 5, 5, 4, 3].map((rating, i) => ({ id: `p${i}`, rating }));

  test('due squadre della stessa dimensione, con tutti i giocatori una volta sola', () => {
    const { a, b } = balance(players, { random: seeded(1) });
    expect(a).toHaveLength(5);
    expect(b).toHaveLength(5);
    expect(new Set([...a, ...b]).size).toBe(10);
  });

  test('squadre equilibrate: la differenza di forza resta entro la tolleranza', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { a, b, diff } = balance(players, { random: seeded(seed) });
      expect(diff).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(Math.abs(sum(a, players) - sum(b, players))).toBeCloseTo(diff);
    }
  });

  test('un po\' di casualità: con semi diversi le squadre cambiano', () => {
    const signatures = new Set();
    for (let seed = 1; seed <= 20; seed++) signatures.add(balance(players, { random: seeded(seed) }).a.sort().join());
    expect(signatures.size).toBeGreaterThan(3);
  });

  test('numero dispari: le squadre differiscono al massimo di uno', () => {
    const { a, b } = balance(players.slice(0, 7), { random: seeded(3) });
    expect(Math.abs(a.length - b.length)).toBe(1);
  });

  test('due portieri finiscono in squadre diverse', () => {
    const withKeepers = players.map((p, i) => ({ ...p, role: i === 0 || i === 1 ? 'portiere' : 'attaccante' }));
    for (let seed = 1; seed <= 10; seed++) {
      const { a } = balance(withKeepers, { random: seeded(seed) });
      expect(a.includes('p0')).not.toBe(a.includes('p1'));
    }
  });

  test('i nuovi (valutazione 5) vengono distribuiti come gli altri', () => {
    const fresh = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, rating: 5 }));
    const { diff } = balance(fresh, { random: seeded(9) });
    expect(diff).toBe(0);
  });

  test('con meno di 2 giocatori: 422', () => {
    expect(() => balance([{ id: 'x', rating: 5 }])).toThrow(/almeno 2/);
  });
});

describe('Squadre via API', () => {
  let ctx;
  let match;
  beforeAll(async () => {
    ctx = await groupWithMembers(6);
    match = await createMatch(ctx.admin, ctx.group, { slots: 6 });
    for (const u of ctx.all) await respond(u, match);
  });

  test('solo organizzatore o admin possono bilanciare (403)', async () => {
    expect((await api().post(`/api/matches/${match.id}/teams/balance`).set(ctx.members[0].auth).send({})).status).toBe(403);
  });

  test('Bilancia crea due squadre da 3 con i nomi di default e si può rigenerare', async () => {
    const res = await api().post(`/api/matches/${match.id}/teams/balance`).set(ctx.admin.auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.match.teams.a.name).toBe('Maglie chiare');
    expect(res.body.match.teams.b.name).toBe('Maglie scure');
    expect(res.body.match.teams.a.players).toHaveLength(3);
    expect(res.body.match.teams.method).toBe('bilancia');
    const again = await api().post(`/api/matches/${match.id}/teams/balance`).set(ctx.admin.auth).send({ names: ['Pettorine', 'Senza'] });
    expect(again.body.match.teams.a.name).toBe('Pettorine');
  });

  test('squadre a mano: valida doppioni e non iscritti (422)', async () => {
    const ids = ctx.all.map((u) => u.user.id);
    const dup = await api().put(`/api/matches/${match.id}/teams`).set(ctx.admin.auth).send({ a: { players: [ids[0], ids[1]] }, b: { players: [ids[1]] } });
    expect(dup.status).toBe(422);
    const stranger = await api()
      .put(`/api/matches/${match.id}/teams`)
      .set(ctx.admin.auth)
      .send({ a: { players: [ids[0]] }, b: { players: ['0123456789abcdef01234567'] } });
    expect(stranger.status).toBe(422);
    const ok = await api()
      .put(`/api/matches/${match.id}/teams`)
      .set(ctx.admin.auth)
      .send({ a: { name: 'I Cesarini', players: ids.slice(0, 3) }, b: { name: 'I Muri', players: ids.slice(3) } });
    expect(ok.status).toBe(200);
    expect(ok.body.match.teams.a).toMatchObject({ name: 'I Cesarini' });
    expect(ok.body.match.teams.method).toBe('manuale');
  });

  test('chi si ritira esce anche dalla squadra', async () => {
    const leaving = ctx.members[4];
    await respond(leaving, match, 'non_ci_sono');
    const res = await api().get(`/api/matches/${match.id}`).set(ctx.admin.auth);
    const all = [...res.body.match.teams.a.players, ...res.body.match.teams.b.players].map((u) => u.id);
    expect(all).not.toContain(leaving.user.id);
  });
});
