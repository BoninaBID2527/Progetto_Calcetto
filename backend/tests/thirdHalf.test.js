'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond } = require('./helpers');
const { Match, PrizeVote } = require('../src/models');
const mongoose = require('mongoose');

useTestDatabase();

const day = 86_400_000;
const url = (ctx, q = '') => `/api/groups/${ctx.group.id}/third-half${q}`;
const get = async (who, ctx, q) => (await api().get(url(ctx, q)).set(who.auth)).body.thirdHalf;

/** Partita giocata (4 giocatori) con risultato e votazione del terzo tempo già aperta. */
async function played(ctx, { scoreA = 3, scoreB = 1 } = {}) {
  const players = ctx.all.slice(0, 4);
  const match = await createMatch(ctx.admin, ctx.group, { slots: 4 });
  for (const u of players) await respond(u, match);
  await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
  const ids = players.map((u) => u.user.id);
  await api().put(`/api/matches/${match.id}/teams`).set(ctx.admin.auth).send({ a: { players: ids.slice(0, 2) }, b: { players: ids.slice(2) } });
  await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ scoreA, scoreB });
  return { match, players };
}
const vote = (u, m, option) => api().post(`/api/matches/${m.id}/prize-vote`).set(u.auth).send({ option });
const close = (ctx, m) => api().post(`/api/matches/${m.id}/voting/close`).set(ctx.admin.auth);
const moveBack = (m, days) => Match.collection.updateOne({ _id: new mongoose.Types.ObjectId(m.id) }, { $set: { startsAt: new Date(Date.now() - days * day) } });

describe('Terzo tempo: storico e statistiche', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(5);
  });

  test('senza partite: tutto vuoto e nessun errore', async () => {
    const t = await get(ctx.admin, ctx);
    expect(t.history).toEqual([]);
    expect(t.open).toEqual([]);
    expect(t.stats).toMatchObject({ polls: 0, totalVotes: 0, participationRate: null, options: [], mostChosen: [], streak: null });
  });

  test('votazione aperta: compare tra quelle in corso con scadenza e partecipazione, senza voti individuali', async () => {
    const { match, players } = await played(ctx);
    await vote(players[0], match, 'pizza');
    const t = await get(ctx.members[0], ctx);
    expect(t.open).toHaveLength(1);
    expect(t.open[0]).toMatchObject({ matchId: match.id, votedCount: 1, eligibleCount: 4 });
    expect(new Date(t.open[0].closesAt).getTime()).toBeGreaterThan(Date.now());
    expect(t.history).toEqual([]);
    expect(JSON.stringify(t)).not.toContain('voter');
    await vote(players[1], match, 'pizza');
    await vote(players[2], match, 'birra');
    await close(ctx, match);
    await moveBack(match, 3);
  });

  test('storico: vincitore, conteggi per opzione, partecipazione; aggregato e anonimo', async () => {
    const t = await get(ctx.members[0], ctx);
    expect(t.open).toEqual([]);
    expect(t.history).toHaveLength(1);
    const h = t.history[0];
    expect(h.winners.map((w) => w.key)).toEqual(['pizza']);
    expect(h.options.find((o) => o.key === 'pizza').votes).toBe(2);
    expect(h.options.find((o) => o.key === 'birra').votes).toBe(1);
    expect(h).toMatchObject({ votedCount: 3, eligibleCount: 4, fieldName: 'Santena' });
    expect(h.score).toMatch(/3 - 1/);
    expect(h).not.toHaveProperty('loserTeam'); // "chi perde offre" spento
    expect(t.stats).toMatchObject({ polls: 1, totalVotes: 3, participationRate: 0.75 });
    expect(t.stats.mostChosen.map((o) => o.key)).toEqual(['pizza']);
    expect(t.stats.options[0]).toMatchObject({ key: 'pizza', wins: 1, votes: 2, share: 0.667 });
  });

  test('parità: più vincitori e più opzioni "più scelte"; nessun voto: nessun vincitore', async () => {
    const tie = await played(ctx);
    await vote(tie.players[0], tie.match, 'panino');
    await vote(tie.players[1], tie.match, 'birra');
    await close(ctx, tie.match);
    await moveBack(tie.match, 2);
    const none = await played(ctx);
    await close(ctx, none.match);
    await moveBack(none.match, 1);
    const t = await get(ctx.admin, ctx);
    expect(t.history).toHaveLength(3);
    const tied = t.history.find((h) => h.matchId === tie.match.id);
    expect(tied.winners.map((w) => w.key).sort()).toEqual(['birra', 'panino']);
    expect(t.history.find((h) => h.matchId === none.match.id)).toMatchObject({ winners: [], votedCount: 0 });
    expect(t.stats).toMatchObject({ polls: 3, pollsWithVotes: 2 });
    expect(t.stats.mostChosen.map((o) => o.key).sort()).toEqual(['birra', 'panino', 'pizza']); // una vittoria a testa
    expect(t.stats.participationRate).toBeCloseTo((3 + 2 + 0) / 12, 3);
  });

  test('serie: la stessa opzione che vince più serate di fila', async () => {
    const streakCtx = await groupWithMembers(4);
    for (let i = 0; i < 3; i++) {
      const p = await played(streakCtx);
      await vote(p.players[0], p.match, 'pizza');
      await vote(p.players[1], p.match, 'pizza');
      await close(streakCtx, p.match);
      await moveBack(p.match, 10 - i);
    }
    const t = await get(streakCtx.admin, streakCtx);
    expect(t.stats.streak).toMatchObject({ key: 'pizza', length: 3 });
    expect(t.stats.mostChosen[0]).toMatchObject({ key: 'pizza', wins: 3 });
  });

  test('"chi perde offre": solo informazione, se il gruppo lo attiva; pareggio senza perdente', async () => {
    const l = await groupWithMembers(4);
    await api().patch(`/api/groups/${l.group.id}`).set(l.admin.auth).send({ settings: { loserPaysFirstRound: true } });
    const lost = await played(l, { scoreA: 4, scoreB: 2 });
    await vote(lost.players[0], lost.match, 'birra');
    await close(l, lost.match);
    const draw = await played(l, { scoreA: 2, scoreB: 2 });
    await vote(draw.players[0], draw.match, 'birra');
    await close(l, draw.match);
    await moveBack(lost.match, 2);
    const t = await get(l.admin, l);
    expect(t.loserPaysFirstRound).toBe(true);
    const byId = Object.fromEntries(t.history.map((h) => [h.matchId, h]));
    expect(byId[lost.match.id]).toMatchObject({ loserTeam: expect.any(String), draw: false });
    expect(byId[draw.match.id]).toMatchObject({ loserTeam: null, draw: true });
    // Nessun legame con la cassa: nessuna voce contabile creata.
    const cash = await api().get(`/api/groups/${l.group.id}/ledger`).set(l.admin.auth);
    expect(cash.body.items).toEqual([]);
  });

  test('stagioni: si filtra per stagione corrente o passata; stagione inesistente 404; non membri 403', async () => {
    const s = await groupWithMembers(4);
    await api().patch(`/api/groups/${s.group.id}`).set(s.admin.auth).send({ settings: { season: { mode: 'mensile' } } });
    const old = await played(s);
    await vote(old.players[0], old.match, 'pizza');
    await close(s, old.match);
    await moveBack(old.match, 70);
    const recent = await played(s);
    await vote(recent.players[0], recent.match, 'birra');
    await close(s, recent.match);
    const current = await get(s.admin, s, '?period=stagione');
    expect(current.history.map((h) => h.matchId)).toEqual([recent.match.id]);
    expect(current.season.label).toMatch(/\d{4}/);
    const all = await get(s.admin, s);
    expect(all.history).toHaveLength(2);
    const seasons = (await api().get(`/api/groups/${s.group.id}/seasons`).set(s.admin.auth)).body.seasons;
    const oldDate = Date.now() - 70 * day;
    const past = seasons.find((x) => x.closed && new Date(x.start) <= oldDate && oldDate < new Date(x.end));
    const inPast = await get(s.admin, s, `?season=${encodeURIComponent(past.key)}`);
    expect(inPast.history.map((h) => h.matchId)).toEqual([old.match.id]);
    expect((await api().get(url(s, '?season=nonesiste')).set(s.admin.auth)).status).toBe(404);
    const outsider = (await groupWithMembers(2)).admin;
    expect((await api().get(url(s)).set(outsider.auth)).status).toBe(403);
    expect((await api().get(url(s, '?limit=0')).set(s.admin.auth)).status).toBe(422);
    void PrizeVote;
  });

  test('paginazione: hasMore quando le votazioni chiuse superano il limite', async () => {
    const t = await get(ctx.admin, ctx, '?limit=1');
    expect(t.history).toHaveLength(1);
    expect(t.hasMore).toBe(true);
  });
});
