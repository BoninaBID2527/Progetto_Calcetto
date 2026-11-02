'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond, createUser, joinGroup } = require('./helpers');
const activityService = require('../src/services/activityService');
const { Activity } = require('../src/models');

useTestDatabase();

async function playedMatch(ctx, players) {
  const match = await createMatch(ctx.admin, ctx.group, { slots: players.length });
  for (const u of players) await respond(u, match);
  await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
  const ids = players.map((u) => u.user.id);
  const half = Math.ceil(ids.length / 2);
  await api().put(`/api/matches/${match.id}/teams`).set(ctx.admin.auth).send({ a: { players: ids.slice(0, half) }, b: { players: ids.slice(half) } });
  await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ scoreA: 3, scoreB: 1, scorers: [{ userId: ids[0], goals: 2 }] });
  return match;
}

describe('Feed attività', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });

  test('registra eventi reali: ingresso, nuova partita, iscrizione, risultato, MVP', async () => {
    const match = await playedMatch(ctx, ctx.all);
    const [a, b, c, d] = ctx.all;
    for (const [voter, mvp] of [[a, b], [b, a], [c, b], [d, b]]) {
      await api().post(`/api/matches/${match.id}/mvp-vote`).set(voter.auth).send({ mvpUserId: mvp.user.id });
    }
    const res = await api().get(`/api/groups/${ctx.group.id}/activity?limit=50`).set(ctx.members[0].auth);
    expect(res.status).toBe(200);
    const types = res.body.items.map((i) => i.type);
    expect(types).toEqual(expect.arrayContaining(['membro_entrato', 'partita_creata', 'iscrizione', 'risultato', 'mvp']));
    const mvp = res.body.items.find((i) => i.type === 'mvp');
    expect(mvp.target.id).toBe(b.user.id);
    expect(mvp.match.field).toBe('santena');
    const result = res.body.items.find((i) => i.type === 'risultato');
    expect(result.data).toMatchObject({ scoreA: 3, scoreB: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/@calcetto\.test/);
  });

  test('a pagine con before; chi non è nel gruppo riceve 403', async () => {
    const first = await api().get(`/api/groups/${ctx.group.id}/activity?limit=3`).set(ctx.admin.auth);
    expect(first.body.items).toHaveLength(3);
    expect(first.body.hasMore).toBe(true);
    const next = await api().get(`/api/groups/${ctx.group.id}/activity?limit=3&before=${first.body.items[2].id}`).set(ctx.admin.auth);
    expect(next.body.items[0].id).not.toBe(first.body.items[2].id);
    const stranger = await createUser('Estraneo');
    expect((await api().get(`/api/groups/${ctx.group.id}/activity`).set(stranger.auth)).status).toBe(403);
  });

  test('la stessa chiave non crea mai due attività', async () => {
    await activityService.record(ctx.group.id, 'record', { key: 'prova:1', data: { n: 1 } });
    await activityService.record(ctx.group.id, 'record', { key: 'prova:1', data: { n: 2 } });
    expect(await Activity.countDocuments({ group: ctx.group.id, key: 'prova:1' })).toBe(1);
  });
});

describe('Dashboard', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });

  test('prossima partita, votazioni da fare, statistiche personali e posizioni', async () => {
    const played = await playedMatch(ctx, ctx.all);
    const later = await createMatch(ctx.admin, ctx.group, { startsAt: new Date(Date.now() + 9 * 86_400_000).toISOString() });
    const sooner = await createMatch(ctx.admin, ctx.group, { startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    const res = await api().get(`/api/groups/${ctx.group.id}/dashboard`).set(ctx.admin.auth);
    expect(res.status).toBe(200);
    const d = res.body.dashboard;
    expect(d.nextMatch.id).toBe(sooner.id);
    expect(d.upcoming.map((m) => m.id)).toContain(later.id);
    expect(d.openVoting.map((v) => v.matchId)).toEqual([played.id]);
    expect(d.me).toMatchObject({ played: 1, wins: 1, goals: 2, minSamples: 5 });
    expect(d.me.form).toEqual(['V']);
    expect(d.positions.map((p) => p.key)).toEqual(['forti', 'mvp', 'vincenti', 'sfortunati', 'presenti', 'bomber']);
    expect(d.activity.length).toBeGreaterThan(0);

    // Dopo aver votato, la votazione sparisce dalle "cose da fare".
    await api().post(`/api/matches/${played.id}/mvp-vote`).set(ctx.admin.auth).send({ mvpUserId: ctx.members[0].user.id });
    const after = await api().get(`/api/groups/${ctx.group.id}/dashboard`).set(ctx.admin.auth);
    expect(after.body.dashboard.openVoting).toEqual([]);
  });

  test('un nuovo membro senza partite vede statistiche vuote, non inventate', async () => {
    const fresh = await createUser('Nuovo');
    await joinGroup(fresh, ctx.group);
    const res = await api().get(`/api/groups/${ctx.group.id}/dashboard`).set(fresh.auth);
    expect(res.body.dashboard.me).toMatchObject({ played: 0, winRate: null, avgRating: null, form: [] });
    expect(res.body.dashboard.positions.every((p) => p.position === null)).toBe(true);
  });
});
