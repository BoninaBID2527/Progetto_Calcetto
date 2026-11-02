'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond, createUser, joinGroup, inDays } = require('./helpers');
const { Match, Notification } = require('../src/models');

useTestDatabase();

const getMatch = async (user, match) => (await api().get(`/api/matches/${match.id}`).set(user.auth)).body.match;
const responseOf = (match, user) => match.participants.find((p) => p.user.id === user.user.id)?.response;

describe('Creazione e validazione delle partite', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(3);
  });

  test('crea una partita con i default e notifica gli altri membri', async () => {
    const res = await api()
      .post(`/api/groups/${ctx.group.id}/matches`)
      .set(ctx.admin.auth)
      .send({ field: 'cambiano', startsAt: inDays(2) });
    expect(res.status).toBe(201);
    expect(res.body.match).toMatchObject({ field: 'cambiano', slots: 10, freeSlots: 10, durationMinutes: 60, status: 'aperta' });
    const notes = await Notification.find({ type: 'nuova_partita' }).lean();
    expect(notes.map((n) => String(n.user)).sort()).toEqual(ctx.members.map((m) => m.user.id).sort());
  });

  test('data nel passato: 422', async () => {
    const res = await api()
      .post(`/api/groups/${ctx.group.id}/matches`)
      .set(ctx.admin.auth)
      .send({ field: 'cambiano', startsAt: new Date(Date.now() - 60_000).toISOString() });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.startsAt).toBeDefined();
  });

  test('campo fuori dalla lista, posti o costo non validi: 422', async () => {
    const res = await api()
      .post(`/api/groups/${ctx.group.id}/matches`)
      .set(ctx.admin.auth)
      .send({ field: 'torino', startsAt: inDays(2), slots: 1, costCents: -5 });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['costCents', 'field', 'slots']);
  });

  test('con organizers = admin i membri non possono creare partite (403)', async () => {
    await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { organizers: 'admin' } });
    const res = await api().post(`/api/groups/${ctx.group.id}/matches`).set(ctx.members[0].auth).send({ field: 'santena', startsAt: inDays(2) });
    expect(res.status).toBe(403);
    await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { organizers: 'tutti' } });
    const ok = await api().post(`/api/groups/${ctx.group.id}/matches`).set(ctx.members[0].auth).send({ field: 'santena', startsAt: inDays(2) });
    expect(ok.status).toBe(201);
  });

  test('solo organizzatore o admin modificano la partita', async () => {
    const match = await createMatch(ctx.members[0], ctx.group);
    expect((await api().patch(`/api/matches/${match.id}`).set(ctx.members[1].auth).send({ notes: 'x' })).status).toBe(403);
    const byOrganizer = await api().patch(`/api/matches/${match.id}`).set(ctx.members[0].auth).send({ notes: 'Portate due maglie' });
    expect(byOrganizer.status).toBe(200);
    expect(byOrganizer.body.match.notes).toBe('Portate due maglie');
    const byAdmin = await api().patch(`/api/matches/${match.id}`).set(ctx.admin.auth).send({ field: 'moncalieri' });
    expect(byAdmin.body.match.field).toBe('moncalieri');
  });
});

describe('Iscrizioni e lista d\'attesa', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(6);
  });

  test('"Ci sono" prende un posto; ripeterlo dà 409', async () => {
    const match = await createMatch(ctx.admin, ctx.group, { slots: 4 });
    const first = await respond(ctx.members[0], match);
    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe('ci_sono');
    expect(first.body.match.freeSlots).toBe(3);
    expect((await respond(ctx.members[0], match)).status).toBe(409);
  });

  test('a posti finiti si va in lista d\'attesa; chi si ritira fa entrare il primo in lista, che riceve una notifica', async () => {
    const [a, b, c, d] = ctx.members;
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2 });
    await respond(a, match);
    await respond(b, match);
    const waitC = await respond(c, match);
    expect(waitC.body.outcome).toBe('attesa');
    await new Promise((r) => setTimeout(r, 5));
    const waitD = await respond(d, match);
    expect(waitD.body.outcome).toBe('attesa');
    expect((await respond(c, match)).status).toBe(409);

    const out = await respond(a, match, 'non_ci_sono');
    expect(out.status).toBe(200);
    expect(out.body.promoted).toEqual([c.user.id]);
    const fresh = await getMatch(ctx.admin, match);
    expect(responseOf(fresh, c)).toBe('ci_sono');
    expect(responseOf(fresh, d)).toBe('attesa');
    expect(fresh.freeSlots).toBe(0);
    expect(fresh.counts).toMatchObject({ ci_sono: 2, attesa: 1, non_ci_sono: 1 });

    const notes = await api().get('/api/notifications').set(c.auth);
    expect(notes.body.notifications.some((n) => n.type === 'promozione')).toBe(true);
  });

  test('"Forse" non occupa posti; chi era "Forse" può passare a "Ci sono"', async () => {
    const [a, b] = ctx.members;
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2 });
    const maybe = await respond(a, match, 'forse');
    expect(maybe.body.match.freeSlots).toBe(2);
    const yes = await respond(a, match, 'ci_sono');
    expect(yes.body.outcome).toBe('ci_sono');
    expect(yes.body.match.freeSlots).toBe(1);
    expect((await respond(b, match, 'non_ci_sono')).body.match.freeSlots).toBe(1);
  });

  test('chi arriva dopo non scavalca la lista d\'attesa quando si libera un posto', async () => {
    const [a, b, c, d] = ctx.members;
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2 });
    await respond(ctx.admin, match);
    await respond(a, match);
    await respond(b, match); // in attesa
    // Si libera un posto: entra b, non c che risponde subito dopo.
    await respond(a, match, 'forse');
    const late = await respond(c, match);
    expect(late.body.outcome).toBe('attesa');
    const fresh = await getMatch(ctx.admin, match);
    expect(responseOf(fresh, b)).toBe('ci_sono');
    expect(responseOf(fresh, d)).toBeUndefined();
  });

  test('concorrenza: 5 richieste contemporanee per l\'ultimo posto, entra una sola persona', async () => {
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2 });
    await respond(ctx.admin, match);
    const results = await Promise.all(ctx.members.map((u) => respond(u, match)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const outcomes = results.map((r) => r.body.outcome);
    expect(outcomes.filter((o) => o === 'ci_sono')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'attesa')).toHaveLength(4);
    const stored = await Match.findById(match.id).lean();
    expect(stored.freeSlots).toBe(0);
    expect(stored.participants.filter((p) => p.response === 'ci_sono')).toHaveLength(2);
  });

  test('concorrenza: la stessa persona che preme due volte non viene iscritta due volte', async () => {
    const match = await createMatch(ctx.admin, ctx.group, { slots: 5 });
    const [r1, r2] = await Promise.all([respond(ctx.members[0], match), respond(ctx.members[0], match)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const stored = await Match.findById(match.id).lean();
    expect(stored.participants).toHaveLength(1);
    expect(stored.freeSlots).toBe(4);
  });

  test('partita chiusa: le risposte danno 409; riaprendola entra chi era in attesa se c\'è posto', async () => {
    const [a, b] = ctx.members;
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2 });
    await respond(ctx.admin, match);
    await respond(a, match);
    await respond(b, match);
    const closed = await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
    expect(closed.status).toBe(200);
    expect((await respond(ctx.members[2], match)).status).toBe(409);
    expect((await respond(a, match, 'non_ci_sono')).status).toBe(409);
    await api().patch(`/api/matches/${match.id}`).set(ctx.admin.auth).send({ slots: 3 });
    const reopened = await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'aperta' });
    expect(reopened.status).toBe(200);
    expect(responseOf(reopened.body.match, b)).toBe('ci_sono');
  });

  test('aumentare i posti fa entrare la lista d\'attesa; ridurli sotto i presenti dà 409', async () => {
    const [a, b, c] = ctx.members;
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2 });
    await respond(a, match);
    await respond(b, match);
    await respond(c, match);
    const more = await api().patch(`/api/matches/${match.id}`).set(ctx.admin.auth).send({ slots: 3 });
    expect(more.status).toBe(200);
    expect(responseOf(more.body.match, c)).toBe('ci_sono');
    const less = await api().patch(`/api/matches/${match.id}`).set(ctx.admin.auth).send({ slots: 2 });
    expect(less.status).toBe(409);
  });
});

describe('Stati, quote e pagamenti', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });

  test('passaggi di stato non ammessi: 409; annullamento notifica gli iscritti', async () => {
    const match = await createMatch(ctx.admin, ctx.group);
    await respond(ctx.members[0], match);
    expect((await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'archiviata' })).status).toBe(409);
    expect((await api().post(`/api/matches/${match.id}/status`).set(ctx.members[1].auth).send({ status: 'chiusa' })).status).toBe(403);
    expect((await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'giocata' })).status).toBe(422);
    const cancelled = await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'annullata' });
    expect(cancelled.body.match.status).toBe('annullata');
    expect((await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'aperta' })).status).toBe(409);
    const notes = await api().get('/api/notifications').set(ctx.members[0].auth);
    expect(notes.body.notifications.some((n) => n.type === 'partita_annullata')).toBe(true);
  });

  test('quota a testa = costo / presenti, arrotondata al centesimo superiore', async () => {
    const match = await createMatch(ctx.admin, ctx.group, { costCents: 5000 });
    for (const u of ctx.all.slice(0, 3)) await respond(u, match);
    const fresh = await getMatch(ctx.admin, match);
    expect(fresh.quotaCents).toBe(1667);
  });

  test('ognuno segna il proprio pagamento; l\'organizzatore può segnare quello di tutti', async () => {
    const [a, b, c] = ctx.members;
    const match = await createMatch(a, ctx.group, { costCents: 4000 });
    await respond(b, match);
    await respond(c, match);
    const self = await api().patch(`/api/matches/${match.id}/participants/${b.user.id}/payment`).set(b.auth).send({ paid: true });
    expect(self.status).toBe(200);
    // Dalla V2 chi paga può solo dichiarare: il pagamento conta (paidCount) quando lo conferma chi riceve il denaro.
    expect(self.body.match.paidCount).toBe(0);
    expect(self.body.match.declaredCount).toBe(1);
    expect((await api().patch(`/api/matches/${match.id}/participants/${c.user.id}/payment`).set(b.auth).send({ paid: true })).status).toBe(403);
    const byOrganizer = await api().patch(`/api/matches/${match.id}/participants/${c.user.id}/payment`).set(a.auth).send({ paid: true });
    expect(byOrganizer.body.match.paidCount).toBe(1);
    const confirm = await api().patch(`/api/matches/${match.id}/participants/${b.user.id}/payment`).set(a.auth).send({ paid: true });
    expect(confirm.body.match.paidCount).toBe(2);
    // Non si paga per chi non è tra i presenti.
    expect((await api().patch(`/api/matches/${match.id}/participants/${a.user.id}/payment`).set(a.auth).send({ paid: true })).status).toBe(422);
  });

  test('elenco: prossime e passate', async () => {
    const res = await api().get(`/api/groups/${ctx.group.id}/matches?scope=prossime`).set(ctx.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.matches.every((m) => ['aperta', 'chiusa'].includes(m.status))).toBe(true);
    const past = await api().get(`/api/groups/${ctx.group.id}/matches?scope=passate`).set(ctx.admin.auth);
    expect(past.body.matches.map((m) => m.status)).toContain('annullata');
    expect((await api().get(`/api/groups/${ctx.group.id}/matches?scope=boh`).set(ctx.admin.auth)).status).toBe(422);
  });

  test('un nuovo membro vede le partite del gruppo e può iscriversi', async () => {
    const match = await createMatch(ctx.admin, ctx.group);
    const late = await createUser('Ritardatario');
    await joinGroup(late, ctx.group);
    expect((await respond(late, match)).body.outcome).toBe('ci_sono');
  });
});
