'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond } = require('./helpers');
const { Match, Achievement, Group, Notification } = require('../src/models');
const achievementService = require('../src/services/achievementService');
const awardsService = require('../src/services/awardsService');

useTestDatabase();

async function played(ctx, { scorers = [], result = { scoreA: 3, scoreB: 2 }, size = 4 } = {}) {
  const players = ctx.all.slice(0, size);
  const match = await createMatch(ctx.admin, ctx.group, { slots: size });
  for (const u of players) await respond(u, match);
  await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
  const ids = players.map((u) => u.user.id);
  await api().put(`/api/matches/${match.id}/teams`).set(ctx.admin.auth).send({ a: { players: ids.slice(0, size / 2) }, b: { players: ids.slice(size / 2) } });
  const res = await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ ...result, scorers: scorers.map(([u, goals]) => ({ userId: ctx.all[u].user.id, goals })) });
  return { match, players, res };
}

const enable = (ctx, awards) => api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { awards } });
const awardsOf = async (user, match) => (await api().get(`/api/matches/${match.id}/awards`).set(user.auth)).body.awards;
const voteAward = (user, match, key, nominee) => api().post(`/api/matches/${match.id}/awards/${key}/vote`).set(user.auth).send({ nominee: nominee.user.id });
const mvp = (user, match, who) => api().post(`/api/matches/${match.id}/mvp-vote`).set(user.auth).send({ mvpUserId: who.user.id });

describe('Premi partita', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(5);
  });

  test('spenti per impostazione predefinita; solo un admin li attiva', async () => {
    const { match } = await played(ctx);
    const a = await awardsOf(ctx.admin, match);
    expect(a.enabled).toBe(false);
    expect(a.awards).toEqual([]);
    expect((await enable(ctx, { bomber: true })).status).toBe(200);
    const denied = await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.members[0].auth).send({ settings: { awards: { bomber: true } } });
    expect(denied.status).toBe(403);
    const bad = await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { awards: { inventato: true } } });
    expect(bad.status).toBe(422);
  });

  test('bomber automatico dai marcatori (con pari merito); senza marcatori resta vuoto', async () => {
    await enable(ctx, { bomber: true, portiere: true, ironico: { enabled: true, label: 'Il Rimpianto' } });
    const withGoals = await played(ctx, { scorers: [[0, 2], [2, 2], [1, 1]] });
    const a = await awardsOf(ctx.members[0], withGoals.match);
    const bomber = a.awards.find((x) => x.key === 'bomber');
    expect(bomber).toMatchObject({ mode: 'automatico', decided: true });
    expect(bomber.winners.map((u) => u.id).sort()).toEqual([ctx.all[0].user.id, ctx.all[2].user.id].sort());
    expect(a.awards.map((x) => x.label)).toEqual(['Miglior portiere', 'Bomber della serata', 'Il Rimpianto']);
    const none = await played(ctx);
    expect((await awardsOf(ctx.admin, none.match)).awards.find((x) => x.key === 'bomber').winners).toEqual([]);
    // Correggendo il risultato il bomber segue i nuovi marcatori.
    await api().put(`/api/matches/${withGoals.match.id}/result`).set(ctx.admin.auth).send({ scoreA: 3, scoreB: 2, scorers: [{ userId: ctx.all[3].user.id, goals: 2 }] });
    const fixed = (await awardsOf(ctx.admin, withGoals.match)).awards.find((x) => x.key === 'bomber');
    expect(fixed.winners.map((u) => u.id)).toEqual([ctx.all[3].user.id]);
  });

  test('voto: solo chi ha giocato, non per sé, una volta sola, anonimo finché aperto', async () => {
    const { match } = await played(ctx);
    const [a0, a1, b0, b1] = ctx.all;
    expect((await voteAward(a0, match, 'portiere', a0)).status).toBe(422);
    expect((await voteAward(ctx.all[4], match, 'portiere', a1)).status).toBe(403); // non ha giocato
    expect((await voteAward(a0, match, 'portiere', ctx.all[4])).status).toBe(422); // candidato che non ha giocato
    expect((await voteAward(a0, match, 'portiere', b1)).status).toBe(201);
    expect((await voteAward(a0, match, 'portiere', b0)).status).toBe(409);
    expect((await voteAward(a0, match, 'bomber', b0)).status).toBe(409); // automatico
    const mine = (await awardsOf(a0, match)).awards.find((x) => x.key === 'portiere');
    expect(mine).toMatchObject({ myVote: b1.user.id, votedCount: 1, decided: false, winners: [] });
    expect((await awardsOf(a1, match)).awards.find((x) => x.key === 'portiere').myVote).toBeNull();
    expect(JSON.stringify(await awardsOf(a1, match))).not.toContain('voter');
  });

  test('chiusura: vince chi ha più voti, parità condivisa, notifica e messaggio una sola volta', async () => {
    const { match } = await played(ctx);
    const [a0, a1, b0, b1] = ctx.all;
    await voteAward(a0, match, 'portiere', b0);
    await voteAward(a1, match, 'portiere', b0);
    await voteAward(b0, match, 'portiere', a0);
    await voteAward(b1, match, 'portiere', a0);
    await voteAward(a0, match, 'ironico', b1);
    const close = await api().post(`/api/matches/${match.id}/voting/close`).set(ctx.admin.auth);
    expect(close.status).toBe(200);
    const closed = await awardsOf(a1, match);
    expect(closed.closed).toBe(true);
    const portiere = closed.awards.find((x) => x.key === 'portiere');
    expect(portiere.winners.map((u) => u.id).sort()).toEqual([a0.user.id, b0.user.id].sort());
    expect(closed.awards.find((x) => x.key === 'ironico').winners.map((u) => u.id)).toEqual([b1.user.id]);
    expect((await voteAward(b1, match, 'portiere', a1)).status).toBe(409);
    // Richiudere non duplica nulla.
    await api().post(`/api/matches/${match.id}/voting/close`).set(ctx.admin.auth);
    const won = await Notification.find({ user: b0.user.id, type: 'premio', title: /portiere/i }).lean();
    expect(won).toHaveLength(1);
    expect(await awardsService.close(match.id)).toBe(false);
    const stored = await Match.findById(match.id).lean();
    expect(stored.awardWinners.find((w) => w.key === 'portiere').users).toHaveLength(2);
  });

  test("l'MVP non si chiude in anticipo finché mancano voti ai premi", async () => {
    const { match, players } = await played(ctx);
    for (const u of players) await mvp(u, match, players.find((p) => p !== u));
    let m = await Match.findById(match.id).lean();
    expect(m.voting.closed).toBe(false);
    for (const key of ['portiere', 'ironico']) for (const u of players) await voteAward(u, match, key, players.find((p) => p !== u));
    m = await Match.findById(match.id).lean();
    // I voti ai premi non chiudono da soli: si chiude all'MVP successivo o alla scadenza.
    expect(m.voting.awardsClosed).toBe(false);
    const close = await api().post(`/api/matches/${match.id}/voting/close`).set(ctx.admin.auth);
    expect(close.status).toBe(200);
    expect((await Match.findById(match.id).lean()).voting.awardsClosed).toBe(true);
  });

  test("assegnazione dell'organizzatore: solo gestori, solo a chi ha giocato, il bomber non si assegna", async () => {
    const { match } = await played(ctx);
    const [a0, , b0] = ctx.all;
    const url = (k) => `/api/matches/${match.id}/awards/${k}/assign`;
    expect((await api().post(url('ironico')).set(ctx.members[3].auth).send({ userIds: [a0.user.id] })).status).toBe(403);
    expect((await api().post(url('ironico')).set(ctx.admin.auth).send({ userIds: [ctx.all[4].user.id] })).status).toBe(422);
    expect((await api().post(url('bomber')).set(ctx.admin.auth).send({ userIds: [a0.user.id] })).status).toBe(409);
    expect((await api().post(url('sorpresa')).set(ctx.admin.auth).send({ userIds: [a0.user.id] })).status).toBe(404); // non attivo qui
    expect((await api().post('/api/matches/' + match.id + '/awards/boh/assign').set(ctx.admin.auth).send({ userIds: [a0.user.id] })).status).toBe(400);
    const ok = await api().post(url('ironico')).set(ctx.admin.auth).send({ userIds: [b0.user.id] });
    expect(ok.status).toBe(200);
    const aw = ok.body.awards.awards.find((x) => x.key === 'ironico');
    expect(aw).toMatchObject({ mode: 'assegnato', decided: true });
    expect(aw.winners[0].id).toBe(b0.user.id);
    expect((await voteAward(a0, match, 'ironico', b0)).status).toBe(409);
  });

  test('chi non è nel gruppo non vede i premi', async () => {
    const { match } = await played(ctx);
    const outsider = (await groupWithMembers(2)).admin;
    expect((await api().get(`/api/matches/${match.id}/awards`).set(outsider.auth)).status).toBe(403);
  });
});

describe('Achievement', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });

  test('prima partita, primo gol e serie: assegnati dal backend, una volta sola, con notifica', async () => {
    const m1 = await played(ctx, { scorers: [[0, 1]] });
    const mine = await api().get(`/api/groups/${ctx.group.id}/players/${ctx.all[0].user.id}/achievements`).set(ctx.all[0].auth);
    expect(mine.status).toBe(200);
    const by = Object.fromEntries(mine.body.achievements.map((a) => [a.key, a]));
    expect(by.prima_partita.unlocked).toBe(true);
    expect(by.primo_gol.unlocked).toBe(true);
    expect(by.presenze_10).toMatchObject({ unlocked: false, progress: { current: 1, target: 10 } });
    expect(by.primo_mvp.unlocked).toBe(false);
    // Chi non ha segnato non ha il primo gol.
    const other = await api().get(`/api/groups/${ctx.group.id}/players/${ctx.all[1].user.id}/achievements`).set(ctx.all[1].auth);
    expect(other.body.achievements.find((a) => a.key === 'primo_gol').unlocked).toBe(false);
    const notes = await Notification.find({ user: ctx.all[0].user.id, type: 'achievement' }).lean();
    expect(notes.map((n) => n.title).sort()).toEqual(['Traguardo sbloccato: Prima partita', 'Traguardo sbloccato: Primo gol']);
    // Altre partite vinte di fila: il tris arriva, niente doppioni.
    await played(ctx);
    await played(ctx);
    expect(await Achievement.countDocuments({ user: ctx.all[0].user.id, group: ctx.group.id, key: 'prima_partita' })).toBe(1);
    const serie = (await api().get(`/api/groups/${ctx.group.id}/players/${ctx.all[0].user.id}/achievements`).set(ctx.all[0].auth)).body.achievements.find((a) => a.key === 'serie_3');
    expect(serie.unlocked).toBe(true);
    void m1;
  });

  test('il primo MVP arriva solo a votazione chiusa', async () => {
    const { match, players } = await played(ctx);
    for (const u of players) await mvp(u, match, players[0] === u ? players[1] : players[0]);
    const mvpUser = players[0];
    const list = (await api().get(`/api/groups/${ctx.group.id}/players/${mvpUser.user.id}/achievements`).set(mvpUser.auth)).body.achievements;
    expect(list.find((a) => a.key === 'primo_mvp').unlocked).toBe(true);
  });

  test('ricalcolo idempotente anche con richieste simultanee', async () => {
    await Promise.all(Array.from({ length: 5 }, () => achievementService.evaluateGroup(ctx.group.id)));
    const total = await Achievement.countDocuments({ group: ctx.group.id });
    expect(await achievementService.evaluateGroup(ctx.group.id)).toBe(0);
    expect(await Achievement.countDocuments({ group: ctx.group.id })).toBe(total);
  });

  test('storico: un traguardo arretrato si registra con la data della partita e senza notifiche', async () => {
    const old = await groupWithMembers(4);
    const group = await Group.findById(old.group.id);
    group.members.forEach((m) => (m.joinedAt = new Date(Date.now() - 400 * 86_400_000)));
    await group.save();
    const { match } = await played(old);
    await Match.collection.updateOne({ _id: new (require('mongoose').Types.ObjectId)(match.id) }, { $set: { startsAt: new Date(Date.now() - 200 * 86_400_000) } });
    await Achievement.deleteMany({ group: old.group.id });
    await Notification.deleteMany({ group: old.group.id });
    expect(await achievementService.evaluateGroup(old.group.id)).toBeGreaterThan(0);
    const a = await Achievement.findOne({ group: old.group.id, key: 'prima_partita' }).lean();
    expect(Date.now() - new Date(a.unlockedAt).getTime()).toBeGreaterThan(150 * 86_400_000);
    expect(await Notification.countDocuments({ group: old.group.id, type: 'achievement' })).toBe(0);
  });

  test('i non membri non vedono i traguardi del gruppo (403) e un id non del gruppo dà 403', async () => {
    const outsider = (await groupWithMembers(2)).admin;
    expect((await api().get(`/api/groups/${ctx.group.id}/players/${ctx.all[0].user.id}/achievements`).set(outsider.auth)).status).toBe(403);
    expect((await api().get(`/api/groups/${ctx.group.id}/players/${outsider.user.id}/achievements`).set(ctx.admin.auth)).status).toBe(403);
  });
});
