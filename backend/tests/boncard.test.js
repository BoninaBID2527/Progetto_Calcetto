'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond, createGroup, joinGroup, createUser } = require('./helpers');
const { overall, bayes, technicalFrom, attributesFrom } = require('../src/services/playerRating');

useTestDatabase();

describe('Algoritmo BONRATING (funzioni pure)', () => {
  test('media bayesiana: con un solo 10 il voto generale resta 6', () => {
    expect(bayes(10, 1, 4)).toBe(6);
    expect(bayes(0, 0, 4)).toBe(5);
  });

  test('senza voti: overall 50, provvisorio, nessun overall tecnico', () => {
    const o = overall({ ratings: [], perMatch: [], attributeVotes: [], role: null, played: 0 });
    expect(o).toMatchObject({ value: 50, provisional: true, technical: null, form: 0 });
  });

  test('un singolo voto non può alterare enormemente l\'overall', () => {
    const o = overall({ ratings: [10], perMatch: [10], attributeVotes: [], role: 'attaccante', played: 1 });
    expect(o.value).toBe(65);
    expect(o.provisional).toBe(true);
    const low = overall({ ratings: [1], perMatch: [1], attributeVotes: [], role: 'attaccante', played: 1 });
    expect(low.value).toBeGreaterThanOrEqual(40);
  });

  test('con molti voti segue i dati reali, la forma pesa al massimo mezzo punto', () => {
    const ratings = Array(20).fill(8);
    const o = overall({ ratings, perMatch: [8, 8, 8, 8, 8], attributeVotes: [], role: null, played: 5 });
    expect(o.general).toBe(7.5);
    expect(o.form).toBe(0.5);
    expect(o.value).toBe(78);
    expect(o.provisional).toBe(false);
  });

  test('attributi: non disponibili senza voti, provvisori con meno di 3, su scala 10-99', () => {
    const a = attributesFrom([{ tir: 9 }, { tir: 9, vel: 7 }, { tir: 8 }]);
    expect(a.dif).toBeNull();
    expect(a.vel).toMatchObject({ samples: 1, provisional: true });
    expect(a.tir).toMatchObject({ samples: 3, provisional: false });
    expect(a.tir.value).toBe(Math.round(bayes(26, 3, 3) * 10));
  });

  test('overall tecnico: servono almeno 3 attributi e i pesi dipendono dal ruolo', () => {
    expect(technicalFrom(attributesFrom([{ tir: 9, vel: 9 }]), 'attaccante')).toBeNull();
    const votes = Array(6).fill({ tir: 10, dri: 9, vel: 9, dif: 3, fis: 6, pas: 6 });
    const asStriker = technicalFrom(attributesFrom(votes), 'attaccante');
    const asDefender = technicalFrom(attributesFrom(votes), 'difensore');
    expect(asStriker).toBeGreaterThan(asDefender);
  });
});

async function play(ctx, players, { scoreA = 3, scoreB = 1, scorers = [], mvpFor, ratings = [] } = {}) {
  const match = await createMatch(ctx.admin, ctx.group, { slots: players.length });
  for (const u of players) await respond(u, match);
  await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
  const ids = players.map((u) => u.user.id);
  const half = Math.ceil(ids.length / 2);
  await api().put(`/api/matches/${match.id}/teams`).set(ctx.admin.auth).send({ a: { players: ids.slice(0, half) }, b: { players: ids.slice(half) } });
  await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ scoreA, scoreB, scorers });
  for (const [rater, body] of ratings) await api().post(`/api/matches/${match.id}/ratings`).set(rater.auth).send(body);
  if (mvpFor) {
    for (const voter of players) {
      const target = voter === mvpFor ? players.find((p) => p !== mvpFor) : mvpFor;
      await api().post(`/api/matches/${match.id}/mvp-vote`).set(voter.auth).send({ mvpUserId: target.user.id });
    }
  }
  return match;
}

describe('BONCARD e BONRATING via API', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });

  test('carta di un nuovo giocatore: tutto a zero, attributi non disponibili, edizione Base', async () => {
    const res = await api().get(`/api/groups/${ctx.group.id}/players/${ctx.members[0].user.id}/card`).set(ctx.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.card).toMatchObject({ scope: 'gruppo', stats: { played: 0, goals: 0, winRate: null }, overall: { value: 50, provisional: true }, edition: { key: 'base' } });
    expect(Object.values(res.body.card.attributes).every((a) => a === null)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/@calcetto\.test/);
  });

  test('voti per abilità, gol e MVP: la carta usa i dati reali e sblocca le edizioni giuste', async () => {
    const [a, b, c] = ctx.members;
    const attrs = { score: 8, attributes: { tir: 9, vel: 8, dri: 8 } };
    await play(ctx, ctx.all, {
      scoreA: 4,
      scoreB: 1,
      scorers: [{ userId: ctx.admin.user.id, goals: 3 }],
      mvpFor: ctx.admin,
      ratings: [a, b, c].map((r) => [r, { ratings: [{ userId: ctx.admin.user.id, ...attrs }] }]),
    });
    const res = await api().get(`/api/groups/${ctx.group.id}/players/${ctx.admin.user.id}/card`).set(a.auth);
    const card = res.body.card;
    expect(card.stats).toMatchObject({ played: 1, wins: 1, goals: 3, mvp: 1, ratingsCount: 3 });
    expect(card.attributes.tir).toMatchObject({ samples: 3, provisional: false });
    expect(card.attributes.dif).toBeNull();
    expect(card.overall.technical).not.toBeNull();
    const unlocked = card.editions.filter((e) => e.unlocked).map((e) => e.key);
    expect(unlocked).toEqual(expect.arrayContaining(['mvp', 'bomber', 'base']));
    expect(card.edition.key).toBe('mvp');
    expect(card.editions.find((e) => e.key === 'leggenda')).toMatchObject({ unlocked: false, requirement: expect.stringMatching(/50 presenze/) });
  });

  test('voti per abilità fuori scala: 422', async () => {
    const match = await play(ctx, ctx.all.slice(0, 2));
    const res = await api()
      .post(`/api/matches/${match.id}/ratings`)
      .set(ctx.admin.auth)
      .send({ ratings: [{ userId: ctx.members[0].user.id, score: 7, attributes: { tir: 12 } }] });
    expect(res.status).toBe(422);
  });

  test('chi non è nel gruppo: 404 per il giocatore; la carriera di un altro: 403; la propria: aggrega i gruppi', async () => {
    const stranger = await createUser('Estraneo');
    expect((await api().get(`/api/groups/${ctx.group.id}/players/${stranger.user.id}/card`).set(ctx.admin.auth)).status).toBe(404);
    expect((await api().get(`/api/groups/${ctx.group.id}/players/${ctx.admin.user.id}/card?scope=carriera`).set(ctx.members[0].auth)).status).toBe(403);
    const other = await createGroup(ctx.admin, { name: 'Secondo gruppo' });
    await joinGroup(ctx.members[0], other);
    const own = await api().get(`/api/groups/${ctx.group.id}/players/${ctx.admin.user.id}/card?scope=carriera`).set(ctx.admin.auth);
    expect(own.status).toBe(200);
    expect(own.body.card.context).toMatch(/Carriera · 2 gruppi/);
    expect(own.body.card.stats.played).toBeGreaterThanOrEqual(1);
  });

  test('progressione: andamento, record, campione piccolo dichiarato e stagioni', async () => {
    const res = await api().get(`/api/groups/${ctx.group.id}/players/${ctx.admin.user.id}/progression`).set(ctx.members[1].auth);
    expect(res.status).toBe(200);
    const p = res.body.progression;
    expect(p.timeline.length).toBe(p.winRate.played);
    expect(p.timeline[0]).toMatchObject({ result: 'V', goals: 3, mvp: true });
    expect(p.winRate.reliable).toBe(false);
    expect(p.records.mostGoals.goals).toBe(3);
    expect(p.records.winStreak.length).toBeGreaterThanOrEqual(1);
    expect(p.seasons.length).toBeGreaterThanOrEqual(1);
    expect(p.goalsPerMatch.matches).toBeGreaterThanOrEqual(1);
  });
});
