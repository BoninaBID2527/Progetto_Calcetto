'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond, createUser } = require('./helpers');

useTestDatabase();

describe('Rivalità', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
    const [a, b, c, d] = ctx.all;
    // Tre scontri a contro b: 2 vittorie per a, una per b.
    for (const [sa, sb] of [[2, 1], [0, 1], [3, 2]]) {
      const m = await createMatch(ctx.admin, ctx.group, { slots: 4 });
      for (const u of ctx.all) await respond(u, m);
      await api().post(`/api/matches/${m.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
      await api().put(`/api/matches/${m.id}/teams`).set(ctx.admin.auth).send({ a: { players: [a.user.id, c.user.id] }, b: { players: [b.user.id, d.user.id] } });
      await api().put(`/api/matches/${m.id}/result`).set(ctx.admin.auth).send({ scoreA: sa, scoreB: sb, scorers: sa ? [{ userId: a.user.id, goals: 1 }] : [] });
    }
  });

  test('rivalità naturali solo tra chi si è affrontato almeno 3 volte', async () => {
    const res = await api().get(`/api/groups/${ctx.group.id}/rivalries`).set(ctx.members[0].auth);
    expect(res.status).toBe(200);
    const pairs = res.body.auto.map((r) => r.users.map((u) => u.id).sort().join());
    expect(pairs).toContain([ctx.admin.user.id, ctx.members[0].user.id].sort().join());
    // a e c sono sempre stati compagni: nessuna rivalità.
    expect(pairs).not.toContain([ctx.admin.user.id, ctx.members[1].user.id].sort().join());
  });

  test('schermata VS: numeri dagli scontri reali, serie in corso, affidabilità', async () => {
    const [a, b] = ctx.all;
    const res = await api().get(`/api/groups/${ctx.group.id}/rivalries/${a.user.id}?with=${b.user.id}`).set(ctx.members[2].auth);
    expect(res.status).toBe(200);
    expect(res.body.versus.opposed).toMatchObject({ played: 3, winsA: 2, winsB: 1, goalsA: 2 });
    expect(res.body.versus.reliable).toBe(true);
    expect(res.body.versus.streak).toMatchObject({ user: { id: a.user.id }, length: 1 });
    expect(res.body.versus.last).toHaveLength(3);
    const few = await api().get(`/api/groups/${ctx.group.id}/rivalries/${a.user.id}?with=${ctx.members[1].user.id}`).set(a.auth);
    expect(few.body.versus.reliable).toBe(false);
    const stranger = await createUser('Estraneo');
    expect((await api().get(`/api/groups/${ctx.group.id}/rivalries/${stranger.user.id}`).set(a.auth)).status).toBe(404);
  });

  test('proposta, risposta solo del diretto interessato, niente doppioni, chiusura', async () => {
    const [a, b, c] = ctx.all;
    const sent = await api().post(`/api/groups/${ctx.group.id}/rivalries`).set(a.auth).send({ targetUserId: b.user.id });
    expect(sent.status).toBe(201);
    expect((await api().post(`/api/groups/${ctx.group.id}/rivalries`).set(b.auth).send({ targetUserId: a.user.id })).status).toBe(409);
    expect((await api().post(`/api/groups/${ctx.group.id}/rivalries`).set(a.auth).send({ targetUserId: a.user.id })).status).toBe(422);
    const id = sent.body.rivalry.id;
    expect((await api().post(`/api/rivalries/${id}/accept`).set(a.auth)).status).toBe(403);
    expect((await api().post(`/api/rivalries/${id}/accept`).set(c.auth)).status).toBe(403);
    const pending = await api().get(`/api/groups/${ctx.group.id}/rivalries`).set(b.auth);
    expect(pending.body.chosen[0]).toMatchObject({ status: 'proposta', awaitingMe: true });
    expect((await api().post(`/api/rivalries/${id}/accept`).set(b.auth)).body.rivalry.status).toBe('attiva');
    const listed = await api().get(`/api/groups/${ctx.group.id}/rivalries`).set(c.auth);
    expect(listed.body.chosen[0]).toMatchObject({ status: 'attiva', summary: { played: 3 } });
    expect((await api().delete(`/api/rivalries/${id}`).set(b.auth)).status).toBe(204);
    expect((await api().get(`/api/groups/${ctx.group.id}/rivalries`).set(c.auth)).body.chosen).toHaveLength(0);
  });

  test('una sfida rifiutata si può riproporre più avanti', async () => {
    const [a, , c] = ctx.all;
    const first = await api().post(`/api/groups/${ctx.group.id}/rivalries`).set(c.auth).send({ targetUserId: a.user.id });
    await api().post(`/api/rivalries/${first.body.rivalry.id}/decline`).set(a.auth);
    const again = await api().post(`/api/groups/${ctx.group.id}/rivalries`).set(c.auth).send({ targetUserId: a.user.id });
    expect(again.status).toBe(201);
    expect(again.body.rivalry.status).toBe('proposta');
  });
});
