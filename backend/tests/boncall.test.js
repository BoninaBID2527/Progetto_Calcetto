'use strict';

const { api, useTestDatabase, groupWithMembers, createUser, createMatch, respond, inDays } = require('./helpers');
const { Poll, Match, Notification, User } = require('../src/models');
const pollService = require('../src/services/pollService');
const notificationService = require('../src/services/notificationService');

useTestDatabase();

const hours = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

async function openPoll(owner, group, data = {}) {
  const res = await api()
    .post(`/api/groups/${group.id}/polls`)
    .set(owner.auth)
    .send({ mode: 'fissa', field: 'santena', startsAt: inDays(3), deadline: hours(24), playersNeeded: 4, ...data });
  if (res.status !== 201) throw new Error(`Convocazione non creata: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.poll;
}

const answer = (user, poll, response = 'ci_sono', options) =>
  api().put(`/api/polls/${poll.id}/response`).set(user.auth).send(options ? { response, options } : { response });

const notesOf = (user, type = 'boncall') => Notification.find({ user: user.user.id, type }).lean();

describe('BONCALL: creazione e notifiche', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(5);
  });

  test("crea la convocazione: l'autore è già confermato, tutti gli altri ricevono una notifica con il link giusto", async () => {
    const poll = await openPoll(ctx.admin, ctx.group);
    expect(poll).toMatchObject({ status: 'aperta', mode: 'fissa', playersNeeded: 4, freeSlots: 3, missing: 3, counts: { ci_sono: 1 } });
    expect(poll.responses[0].user.id).toBe(ctx.admin.user.id);
    for (const m of ctx.members) {
      const notes = await notesOf(m);
      expect(notes.some((n) => n.link === `/boncall/${poll.id}` && /Si cerca gente/.test(n.title) && /Mancano 3 giocatori/.test(n.body))).toBe(true);
    }
    expect(await notesOf(ctx.admin)).toHaveLength(0);
  });

  test('validazioni: scadenza passata o dopo la partita, campo mancante, una sola alternativa: 422', async () => {
    const url = `/api/groups/${ctx.group.id}/polls`;
    const base = { mode: 'fissa', field: 'santena', startsAt: inDays(3), playersNeeded: 4 };
    expect((await api().post(url).set(ctx.admin.auth).send({ ...base, deadline: hours(-1) })).status).toBe(422);
    expect((await api().post(url).set(ctx.admin.auth).send({ ...base, deadline: inDays(5) })).status).toBe(422);
    const noField = await api().post(url).set(ctx.admin.auth).send({ mode: 'fissa', startsAt: inDays(3), deadline: hours(5) });
    expect(noField.status).toBe(422);
    expect(noField.body.error.fields.field).toBeDefined();
    const one = await api().post(url).set(ctx.admin.auth).send({ mode: 'opzioni', options: [{ startsAt: inDays(2), field: 'cambiano' }], deadline: hours(5) });
    expect(one.body.error.fields.options).toBeDefined();
  });

  test('chi non è nel gruppo riceve 403; con organizzatori solo admin un membro non può aprire convocazioni', async () => {
    const poll = await openPoll(ctx.admin, ctx.group);
    const stranger = await createUser('Estraneo');
    expect((await api().get(`/api/polls/${poll.id}`).set(stranger.auth)).status).toBe(403);
    expect((await answer(stranger, poll)).status).toBe(403);
    await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { organizers: 'admin' } });
    const res = await api().post(`/api/groups/${ctx.group.id}/polls`).set(ctx.members[0].auth).send({ mode: 'fissa', field: 'santena', startsAt: inDays(3), deadline: hours(5) });
    expect(res.status).toBe(403);
    await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { organizers: 'tutti' } });
  });

  test('la stessa chiave di deduplica non crea mai due notifiche per la stessa persona', async () => {
    const payload = { type: 'boncall', title: 'Prova', dedupeKey: 'test:unico' };
    await notificationService.notify([ctx.members[0].user.id], payload);
    await notificationService.notify([ctx.members[0].user.id], payload);
    expect(await Notification.countDocuments({ user: ctx.members[0].user.id, dedupeKey: 'test:unico' })).toBe(1);
  });

  test('preferenze: chi spegne la categoria BONCALL non riceve le convocazioni, ma le notifiche critiche sì', async () => {
    const quiet = ctx.members[3];
    await User.updateOne({ _id: quiet.user.id }, { $set: { 'notificationPrefs.categories.boncall': false, 'notificationPrefs.categories.partite': false } });
    const before = (await notesOf(quiet)).length;
    await openPoll(ctx.admin, ctx.group);
    expect((await notesOf(quiet)).length).toBe(before);
    await notificationService.notify([quiet.user.id], { type: 'promozione', title: 'Sei dentro' });
    expect(await Notification.countDocuments({ user: quiet.user.id, type: 'promozione' })).toBe(1);
    await User.updateOne({ _id: quiet.user.id }, { $set: { 'notificationPrefs.categories.boncall': true, 'notificationPrefs.categories.partite': true } });
  });
});

describe('BONCALL: risposte, completamento, avvisi', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(7);
  });

  test("posti contati e lista d'attesa come le partite; chi si ritira fa entrare il primo in lista", async () => {
    const [a, b, c, d] = ctx.members;
    const poll = await openPoll(ctx.admin, ctx.group, { playersNeeded: 2 });
    expect((await answer(a, poll)).body.outcome).toBe('ci_sono');
    expect((await answer(b, poll)).body.outcome).toBe('attesa');
    expect((await answer(b, poll)).status).toBe(409);
    await answer(c, poll, 'forse');
    const out = await answer(a, poll, 'non_ci_sono');
    expect(out.body.promoted).toEqual([b.user.id]);
    expect(out.body.poll.counts).toMatchObject({ ci_sono: 2, attesa: 0, forse: 1, non_ci_sono: 1 });
    expect((await answer(d, poll)).body.outcome).toBe('attesa');
  });

  test('concorrenza: 5 risposte simultanee per l\'ultimo posto, ne entra una sola', async () => {
    const poll = await openPoll(ctx.admin, ctx.group, { playersNeeded: 2 });
    const results = await Promise.all(ctx.members.slice(0, 5).map((u) => answer(u, poll)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(results.filter((r) => r.body.outcome === 'ci_sono')).toHaveLength(1);
    const stored = await Poll.findById(poll.id).lean();
    expect(stored.freeSlots).toBe(0);
    expect(stored.responses.filter((r) => r.response === 'ci_sono')).toHaveLength(2);
  });

  test('completa: avviso all\'organizzatore una sola volta; un ritiro la riapre e avvisa del posto libero', async () => {
    const [a, b, c, d, e] = ctx.members;
    const poll = await openPoll(ctx.admin, ctx.group, { playersNeeded: 4 });
    await answer(a, poll);
    // Mancano 2: avviso a chi non ha risposto.
    expect((await notesOf(e)).some((n) => /Mancano 2 giocatori/.test(n.title))).toBe(true);
    await answer(b, poll);
    expect((await notesOf(e)).some((n) => /Manca 1 giocatore/.test(n.title))).toBe(true);
    const full = await answer(c, poll);
    expect(full.body.poll.status).toBe('completa');
    const completedFor = async () => (await notesOf(ctx.admin)).filter((n) => n.title === 'Convocazione completa!' && n.link === `/boncall/${poll.id}`);
    expect(await completedFor()).toHaveLength(1);

    const reopened = await answer(c, poll, 'non_ci_sono');
    expect(reopened.body.poll.status).toBe('aperta');
    expect((await notesOf(d)).some((n) => /Si è liberato un posto/.test(n.title))).toBe(true);
    // Si richiude: l'avviso "completa" non parte una seconda volta.
    await answer(d, poll);
    expect(await completedFor()).toHaveLength(1);
    // Gli avvisi "mancano 1/2" partono una volta sola anche se la soglia si ripete.
    expect((await notesOf(e)).filter((n) => /Manca 1 giocatore/.test(n.title) && n.link === `/boncall/${poll.id}`)).toHaveLength(1);
  });
});

describe('BONCALL: conversione in partita', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(5);
  });

  test("solo autore o admin convertono; la conversione copia le iscrizioni ed è idempotente", async () => {
    const [a, b, c] = ctx.members;
    const poll = await openPoll(ctx.members[3], ctx.group, { playersNeeded: 3 });
    await answer(a, poll);
    await answer(b, poll);
    await answer(c, poll); // lista d'attesa
    expect((await api().post(`/api/polls/${poll.id}/convert`).set(a.auth).send({})).status).toBe(403);
    const first = await api().post(`/api/polls/${poll.id}/convert`).set(ctx.members[3].auth).send({});
    expect(first.status).toBe(201);
    expect(first.body.match).toMatchObject({ field: 'santena', slots: 3, freeSlots: 0, counts: { ci_sono: 3, attesa: 1 } });
    expect(first.body.poll).toMatchObject({ status: 'convertita', matchId: first.body.match.id });
    // Anche un admin che riprova ottiene la stessa partita.
    const again = await api().post(`/api/polls/${poll.id}/convert`).set(ctx.admin.auth).send({});
    expect(again.status).toBe(200);
    expect(again.body.match.id).toBe(first.body.match.id);
    expect(await Match.countDocuments({ fromPoll: poll.id })).toBe(1);
    // Chi ha risposto riceve "Si gioca".
    expect((await notesOf(a)).some((n) => /Si gioca/.test(n.title) && n.link === `/partite/${first.body.match.id}`)).toBe(true);
    // La convocazione non accetta più risposte.
    expect((await answer(ctx.members[0], poll, 'non_ci_sono')).status).toBe(409);
  });

  test('due conversioni simultanee creano una sola partita', async () => {
    const poll = await openPoll(ctx.admin, ctx.group, { playersNeeded: 2 });
    await answer(ctx.members[0], poll);
    const [r1, r2] = await Promise.all([
      api().post(`/api/polls/${poll.id}/convert`).set(ctx.admin.auth).send({}),
      api().post(`/api/polls/${poll.id}/convert`).set(ctx.admin.auth).send({}),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.match.id).toBe(r2.body.match.id);
    expect(await Match.countDocuments({ fromPoll: poll.id })).toBe(1);
  });

  test('con meno di 2 confermati la conversione è rifiutata (422)', async () => {
    const poll = await openPoll(ctx.admin, ctx.group, { playersNeeded: 4 });
    expect((await api().post(`/api/polls/${poll.id}/convert`).set(ctx.admin.auth).send({})).status).toBe(422);
  });
});

describe('BONCALL: modalità a opzioni', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(5);
  });

  test('ognuno indica le alternative; si completa sulla migliore e la partita usa quella data', async () => {
    const [a, b, c, d] = ctx.members;
    const res = await api()
      .post(`/api/groups/${ctx.group.id}/polls`)
      .set(ctx.admin.auth)
      .send({
        mode: 'opzioni',
        playersNeeded: 3,
        deadline: hours(20),
        options: [
          { startsAt: inDays(2), field: 'cambiano' },
          { startsAt: inDays(3), field: 'moncalieri' },
        ],
      });
    expect(res.status).toBe(201);
    const poll = res.body.poll;
    expect(poll.options.map((o) => o.available)).toEqual([1, 1]);
    expect((await answer(a, poll, 'ci_sono')).status).toBe(422); // serve almeno un'alternativa
    expect((await answer(a, poll, 'ci_sono', ['o9'])).status).toBe(422);
    await answer(a, poll, 'ci_sono', ['o2']);
    const done = await answer(b, poll, 'ci_sono', ['o1', 'o2']);
    expect(done.body.poll).toMatchObject({ status: 'completa', bestOption: 'o2', missing: 0 });
    await answer(c, poll, 'ci_sono', ['o2']);
    await answer(d, poll, 'forse');
    const converted = await api().post(`/api/polls/${poll.id}/convert`).set(ctx.admin.auth).send({});
    expect(converted.status).toBe(201);
    expect(converted.body.match.field).toBe('moncalieri');
    expect(new Date(converted.body.match.startsAt).toISOString()).toBe(new Date(poll.options[1].startsAt).toISOString());
    // 4 disponibili per 3 posti: l'ultimo arrivato va in lista d'attesa; "forse" resta forse.
    expect(converted.body.match.counts).toMatchObject({ ci_sono: 3, attesa: 1, forse: 1 });
  });
});

describe('BONCALL: scadenze, promemoria, annullamento', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });

  test('a metà tempo promemoria a chi non ha risposto, 2 ore prima avviso all\'autore, poi scadenza', async () => {
    const [a, b] = ctx.members;
    const poll = await openPoll(ctx.admin, ctx.group, { deadline: hours(10) });
    await answer(a, poll);
    // createdAt è immutabile per Mongoose: lo sposto indietro direttamente sulla collezione.
    await Poll.collection.updateOne({ _id: new Poll.base.Types.ObjectId(poll.id) }, { $set: { createdAt: new Date(Date.now() - 20 * 3_600_000) } });
    await pollService.runJobs();
    expect(await Notification.countDocuments({ user: b.user.id, type: 'promemoria', dedupeKey: `boncall:reminder:${poll.id}` })).toBe(1);
    expect(await Notification.countDocuments({ user: a.user.id, type: 'promemoria' })).toBe(0);

    await Poll.updateOne({ _id: poll.id }, { $set: { deadline: new Date(Date.now() + 3_600_000) } });
    await pollService.runJobs();
    await pollService.runJobs();
    expect(await Notification.countDocuments({ user: ctx.admin.user.id, dedupeKey: `boncall:deadline:${poll.id}` })).toBe(1);

    await Poll.updateOne({ _id: poll.id }, { $set: { deadline: new Date(Date.now() - 1000) } });
    const stats = await pollService.runJobs();
    expect(stats.expired).toBe(1);
    expect((await Poll.findById(poll.id).lean()).status).toBe('scaduta');
    expect(await Notification.countDocuments({ user: ctx.admin.user.id, dedupeKey: `boncall:scaduta:${poll.id}` })).toBe(1);
    expect((await answer(b, poll)).status).toBe(409);
  });

  test("annullamento: solo autore o admin; dopo non si risponde più", async () => {
    const poll = await openPoll(ctx.members[0], ctx.group);
    expect((await api().post(`/api/polls/${poll.id}/cancel`).set(ctx.members[1].auth)).status).toBe(403);
    const res = await api().post(`/api/polls/${poll.id}/cancel`).set(ctx.admin.auth);
    expect(res.body.poll.status).toBe('annullata');
    expect((await answer(ctx.members[1], poll)).status).toBe(409);
  });
});

describe('Ricerca sostituti', () => {
  test('chi si ritira da una partita piena senza lista d\'attesa fa partire un solo avviso al giorno', async () => {
    const ctx = await groupWithMembers(4);
    const [a, b, c] = ctx.members;
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2, startsAt: inDays(2) });
    await respond(ctx.admin, match);
    await respond(a, match);
    await respond(a, match, 'non_ci_sono');
    const subs = await Notification.find({ type: 'sostituto' }).lean();
    expect(subs.map((n) => String(n.user)).sort()).toEqual([b.user.id, c.user.id].sort());
    await respond(b, match);
    await respond(b, match, 'non_ci_sono');
    expect(await Notification.countDocuments({ type: 'sostituto', user: c.user.id })).toBe(1);
  });
});
