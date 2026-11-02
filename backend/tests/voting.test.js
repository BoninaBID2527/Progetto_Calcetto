'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond } = require('./helpers');
const { Match, MvpVote } = require('../src/models');

useTestDatabase();

/** Partita chiusa con 4 giocatori, squadre fatte: [a0, a1] contro [b0, b1]. */
async function playedSetup(ctx, { result = { scoreA: 3, scoreB: 2 } } = {}) {
  const players = ctx.all.slice(0, 4);
  const match = await createMatch(ctx.admin, ctx.group, { slots: 4 });
  for (const u of players) await respond(u, match);
  await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
  const ids = players.map((u) => u.user.id);
  await api().put(`/api/matches/${match.id}/teams`).set(ctx.admin.auth).send({ a: { players: ids.slice(0, 2) }, b: { players: ids.slice(2) } });
  let res = null;
  if (result) res = await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send(result);
  return { match, players, res };
}

const vote = (user, match, mvp) => api().post(`/api/matches/${match.id}/mvp-vote`).set(user.auth).send({ mvpUserId: mvp.user.id });
const prize = (user, match, option) => api().post(`/api/matches/${match.id}/prize-vote`).set(user.auth).send({ option });
const state = async (user, match) => (await api().get(`/api/matches/${match.id}/voting`).set(user.auth)).body.voting;

describe('Risultato', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(6);
  });

  test('su una partita aperta: 409; senza squadre: 422', async () => {
    const open = await createMatch(ctx.admin, ctx.group);
    expect((await api().put(`/api/matches/${open.id}/result`).set(ctx.admin.auth).send({ scoreA: 1, scoreB: 0 })).status).toBe(409);
    await api().post(`/api/matches/${open.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
    expect((await api().put(`/api/matches/${open.id}/result`).set(ctx.admin.auth).send({ scoreA: 1, scoreB: 0 })).status).toBe(422);
  });

  test('solo organizzatore o admin inseriscono il risultato (403)', async () => {
    const { match } = await playedSetup(ctx, { result: null });
    expect((await api().put(`/api/matches/${match.id}/result`).set(ctx.members[0].auth).send({ scoreA: 1, scoreB: 0 })).status).toBe(403);
  });

  test('marcatori non in squadra o con più gol del punteggio: 422', async () => {
    const { match, players } = await playedSetup(ctx, { result: null });
    const outsider = ctx.all[5].user.id;
    expect(
      (await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ scoreA: 1, scoreB: 0, scorers: [{ userId: outsider, goals: 1 }] })).status
    ).toBe(422);
    expect(
      (await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ scoreA: 1, scoreB: 0, scorers: [{ userId: players[0].user.id, goals: 2 }] })).status
    ).toBe(422);
  });

  test('risultato valido: partita giocata, votazioni aperte per 48 ore, notifiche ai giocatori', async () => {
    const { match, players, res } = await playedSetup(ctx, {
      result: { scoreA: 3, scoreB: 2, scorers: [{ userId: undefined, goals: 0 }].filter((s) => s.userId) },
    });
    expect(res.status).toBe(200);
    expect(res.body.match.status).toBe('giocata');
    const hours = (new Date(res.body.match.voting.closesAt) - new Date(res.body.match.voting.opensAt)) / 3_600_000;
    expect(hours).toBeCloseTo(48);
    expect(res.body.match.prizePoll.options.map((o) => o.key)).toEqual(['birra', 'pizza', 'panino']);
    const notes = await api().get('/api/notifications').set(players[1].auth);
    const types = notes.body.notifications.map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['risultato', 'votazione_aperta']));
  });
});

describe('Votazione MVP', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(6);
  });

  test('niente voto a sé stessi (422), chi non ha giocato non vota (403), un voto solo (409)', async () => {
    const { match, players } = await playedSetup(ctx);
    expect((await vote(players[0], match, players[0])).status).toBe(422);
    expect((await vote(ctx.all[5], match, players[0])).status).toBe(403);
    expect((await vote(players[0], match, ctx.all[5])).status).toBe(422);
    expect((await vote(players[0], match, players[1])).status).toBe(201);
    expect((await vote(players[0], match, players[2])).status).toBe(409);
  });

  test('concorrenza: due voti contemporanei della stessa persona ne registrano uno', async () => {
    const { match, players } = await playedSetup(ctx);
    const [r1, r2] = await Promise.all([vote(players[1], match, players[2]), vote(players[1], match, players[3])]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await MvpVote.countDocuments({ match: match.id })).toBe(1);
  });

  test('voti anonimi: lo stato mostra solo i totali e il proprio voto', async () => {
    const { match, players } = await playedSetup(ctx);
    await vote(players[0], match, players[2]);
    const seen = await state(players[1], match);
    expect(seen.mvp).toMatchObject({ votedCount: 1, eligibleCount: 4, hasVoted: false, myVote: null, results: null });
    const own = await state(players[0], match);
    expect(own.mvp.myVote).toBe(players[2].user.id);
    expect(JSON.stringify(seen)).not.toMatch(/voter/);
  });

  test('quando hanno votato tutti la votazione si chiude; in parità l\'MVP è condiviso', async () => {
    const { match, players } = await playedSetup(ctx);
    const [p0, p1, p2, p3] = players;
    await vote(p0, match, p1);
    await vote(p1, match, p0);
    await vote(p2, match, p1);
    await vote(p3, match, p0);
    const res = await api().get(`/api/matches/${match.id}`).set(p0.auth);
    expect(res.body.match.voting.closed).toBe(true);
    expect(res.body.match.voting.mvp.map((u) => u.id).sort()).toEqual([p0.user.id, p1.user.id].sort());
    const s = await state(p0, match);
    expect(s.mvp.results.map((r) => r.votes)).toEqual([2, 2]);
    expect((await vote(p0, match, p2)).status).toBe(409);
  });

  test('dopo 48 ore la votazione si chiude da sola anche se non hanno votato tutti', async () => {
    const { match, players } = await playedSetup(ctx);
    await vote(players[0], match, players[3]);
    await Match.updateOne({ _id: match.id }, { $set: { 'voting.closesAt': new Date(Date.now() - 1000) } });
    expect((await vote(players[1], match, players[3])).status).toBe(409);
    const res = await api().get(`/api/matches/${match.id}`).set(players[0].auth);
    expect(res.body.match.voting.closed).toBe(true);
    expect(res.body.match.voting.mvp.map((u) => u.id)).toEqual([players[3].user.id]);
    expect(res.body.match.prizePoll.closed).toBe(true);
  });

  test('voti 1-10 ai compagni: validati, modificabili, mai a sé stessi', async () => {
    const { match, players } = await playedSetup(ctx);
    const url = `/api/matches/${match.id}/ratings`;
    expect((await api().post(url).set(players[0].auth).send({ ratings: [{ userId: players[1].user.id, score: 11 }] })).status).toBe(422);
    expect((await api().post(url).set(players[0].auth).send({ ratings: [{ userId: players[0].user.id, score: 8 }] })).status).toBe(422);
    const ok = await api().post(url).set(players[0].auth).send({ ratings: [{ userId: players[1].user.id, score: 7 }, { userId: players[2].user.id, score: 6 }] });
    expect(ok.status).toBe(200);
    const changed = await api().post(url).set(players[0].auth).send({ ratings: [{ userId: players[1].user.id, score: 9 }] });
    expect(changed.body.voting.ratings.mine).toEqual({ [players[1].user.id]: 9, [players[2].user.id]: 6 });
  });

  test('l\'organizzatore può chiudere le votazioni in anticipo; un membro no (403)', async () => {
    const { match, players } = await playedSetup(ctx);
    expect((await api().post(`/api/matches/${match.id}/voting/close`).set(players[1].auth)).status).toBe(403);
    const res = await api().post(`/api/matches/${match.id}/voting/close`).set(ctx.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.match.voting.closed).toBe(true);
    // Ora si può archiviare.
    const archived = await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'archiviata' });
    expect(archived.body.match.status).toBe('archiviata');
  });
});

describe('Terzo tempo e pagella', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(5);
    await api()
      .patch(`/api/groups/${ctx.group.id}`)
      .set(ctx.admin.auth)
      .send({ settings: { loserPaysFirstRound: true, extraPrizeOptions: [{ label: 'Gelato', emoji: '🍦' }] } });
  });

  test('sondaggio con le opzioni base più quelle extra del gruppo; un voto a testa', async () => {
    const { match, players } = await playedSetup(ctx);
    const s = await state(players[0], match);
    expect(s.prize.options.map((o) => o.key)).toEqual(['birra', 'pizza', 'panino', 'extra-gelato']);
    expect((await prize(players[0], match, 'caviale')).status).toBe(422);
    expect((await prize(players[0], match, 'pizza')).status).toBe(201);
    expect((await prize(players[0], match, 'birra')).status).toBe(409);
    expect((await prize(ctx.all[4], match, 'birra')).status).toBe(403);
  });

  test('vince l\'opzione più votata; contatore dei premi e pagella con "chi perde offre"', async () => {
    const { match, players } = await playedSetup(ctx, {
      result: { scoreA: 4, scoreB: 2, scorers: [] },
    });
    const [p0, p1, p2, p3] = players;
    await api()
      .put(`/api/matches/${match.id}/result`)
      .set(ctx.admin.auth)
      .send({ scoreA: 4, scoreB: 2, scorers: [{ userId: p0.user.id, goals: 3 }, { userId: p2.user.id, goals: 1 }] });
    await prize(p0, match, 'pizza');
    await prize(p1, match, 'pizza');
    await prize(p2, match, 'birra');
    const last = await prize(p3, match, 'pizza');
    expect(last.body.voting.prize.winners).toEqual(['pizza']);
    expect(last.body.voting.prize.open).toBe(false);

    const stats = await api().get(`/api/groups/${ctx.group.id}/prize-stats`).set(p0.auth);
    expect(stats.body.prizes.find((p) => p.key === 'pizza').count).toBe(1);

    await Promise.all([vote(p0, match, p2), vote(p1, match, p0), vote(p2, match, p0), vote(p3, match, p0)]);
    const report = await api().get(`/api/matches/${match.id}/report`).set(p1.auth);
    expect(report.status).toBe(200);
    expect(report.body.report.winner).toBe('a');
    expect(report.body.report.loserPays).toBe('Maglie scure');
    expect(report.body.report.text).toMatch(/Maglie chiare 4 - 2 Maglie scure/);
    expect(report.body.report.text).toMatch(/MVP: Admin/);
    expect(report.body.report.text).toMatch(/Pizza 🍕/);
    expect(report.body.report.text).toMatch(/Marcatori: Admin \(3\), Membro2/);
  });

  test('in parità vincono tutte le opzioni a pari voti', async () => {
    const { match, players } = await playedSetup(ctx);
    await prize(players[0], match, 'birra');
    await prize(players[1], match, 'panino');
    await prize(players[2], match, 'birra');
    const last = await prize(players[3], match, 'panino');
    expect(last.body.voting.prize.winners.sort()).toEqual(['birra', 'panino']);
  });
});
