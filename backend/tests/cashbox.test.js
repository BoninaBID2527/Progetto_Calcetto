'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond } = require('./helpers');
const { Match, LedgerEntry } = require('../src/models');
const cashboxService = require('../src/services/cashboxService');

useTestDatabase();

const pay = (who, match, target, payment) => api().patch(`/api/matches/${match.id}/participants/${target.user.id}/payment`).set(who.auth).send({ payment });
const cashbox = async (who, ctx) => (await api().get(`/api/groups/${ctx.group.id}/cashbox`).set(who.auth)).body.cashbox;
const entry = (ctx, who, body) => api().post(`/api/groups/${ctx.group.id}/ledger`).set(who.auth).send(body);
const matchOf = async (id) => (await Match.findById(id).lean());

/** Partita da 60 € con tre presenti (quota 20 €), organizzata da `organizer`. */
async function paidMatch(ctx, organizer, players, cost = 6000) {
  const match = await createMatch(organizer, ctx.group, { costCents: cost, slots: 10 });
  for (const u of players) await respond(u, match);
  return match;
}

describe('Quote delle partite: dichiarato, verificato, annullato', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(5);
  });

  test('chi paga può solo dichiarare; la conferma spetta a chi riceve; paid è derivato', async () => {
    const [a, b, c] = ctx.members;
    const match = await paidMatch(ctx, a, [a, b, c]);
    expect((await pay(b, match, b, 'verificato')).status).toBe(403); // non può confermarsi da solo
    const declared = await pay(b, match, b, 'dichiarato');
    expect(declared.status).toBe(200);
    const m1 = declared.body.match;
    expect(m1.participants.find((p) => p.user.id === b.user.id)).toMatchObject({ payment: 'dichiarato', paid: false });
    expect(m1).toMatchObject({ paidCount: 0, declaredCount: 1 });
    expect((await pay(c, match, b, 'verificato')).status).toBe(403); // un altro giocatore non può confermare
    const verified = await pay(a, match, b, 'verificato');
    expect(verified.body.match.participants.find((p) => p.user.id === b.user.id)).toMatchObject({ payment: 'verificato', paid: true });
    expect((await pay(b, match, b, 'dichiarato')).status).toBe(409); // già confermato
    expect((await pay(b, match, b, 'da_pagare')).status).toBe(403); // una conferma non si ritira da soli
    const revoked = await pay(a, match, b, 'da_pagare');
    expect(revoked.body.match.participants.find((p) => p.user.id === b.user.id)).toMatchObject({ payment: 'da_pagare', paid: false });
    const e = await LedgerEntry.findOne({ match: match.id, user: b.user.id });
    expect(e.status).toBe('annullato');
    expect(e.history.map((h) => h.action)).toEqual(['dichiarato', 'verificato', 'revocato']);
  });

  test('ridichiarare dopo l\'annullamento riusa la stessa voce con lo storico completo; ritirare è libero finché non confermato', async () => {
    const [a, b] = ctx.members;
    const match = await paidMatch(ctx, a, [a, b]);
    await pay(b, match, b, 'dichiarato');
    expect((await pay(b, match, b, 'da_pagare')).status).toBe(200);
    await pay(b, match, b, 'dichiarato');
    expect(await LedgerEntry.countDocuments({ match: match.id, user: b.user.id })).toBe(1);
    const e = await LedgerEntry.findOne({ match: match.id, user: b.user.id });
    expect(e.history.map((h) => h.action)).toEqual(['dichiarato', 'ritirato', 'dichiarato']);
    expect(e.amountCents).toBe(3000);
  });

  test('richieste simultanee: una sola voce, nessun errore', async () => {
    const [a, b] = ctx.members;
    const match = await paidMatch(ctx, a, [a, b]);
    const results = await Promise.all(Array.from({ length: 6 }, () => pay(b, match, b, 'dichiarato')));
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    expect(await LedgerEntry.countDocuments({ match: match.id, user: b.user.id, type: 'quota' })).toBe(1);
    const conf = await Promise.all(Array.from({ length: 4 }, () => pay(a, match, b, 'verificato')));
    expect(conf.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    const e = await LedgerEntry.findOne({ match: match.id, user: b.user.id });
    expect(e.status).toBe('verificato');
    expect(e.history.filter((h) => h.action === 'verificato')).toHaveLength(1);
  });

  test('compatibilità V1: { paid: true } dichiara per chi paga e conferma per l\'organizzatore', async () => {
    const [a, b, c] = ctx.members;
    const match = await paidMatch(ctx, a, [a, b, c]);
    const self = await api().patch(`/api/matches/${match.id}/participants/${b.user.id}/payment`).set(b.auth).send({ paid: true });
    expect(self.body.match.participants.find((p) => p.user.id === b.user.id).payment).toBe('dichiarato');
    const org = await api().patch(`/api/matches/${match.id}/participants/${c.user.id}/payment`).set(a.auth).send({ paid: true });
    expect(org.body.match.participants.find((p) => p.user.id === c.user.id).payment).toBe('verificato');
    expect((await api().patch(`/api/matches/${match.id}/participants/${c.user.id}/payment`).set(a.auth).send({})).status).toBe(422);
  });

  test('notifiche: l\'organizzatore sa chi ha dichiarato, il giocatore sa che è confermato', async () => {
    const [a, b] = ctx.members;
    const match = await paidMatch(ctx, a, [a, b]);
    await pay(b, match, b, 'dichiarato');
    await pay(a, match, b, 'verificato');
    const toOrganizer = await api().get('/api/notifications').set(a.auth);
    expect(toOrganizer.body.notifications.some((n) => n.type === 'pagamento' && /dichiara/.test(n.title))).toBe(true);
    const toPlayer = await api().get('/api/notifications').set(b.auth);
    expect(toPlayer.body.notifications.some((n) => n.type === 'pagamento' && /confermato/i.test(n.title))).toBe(true);
  });

  test('chi lascia la partita: la dichiarazione decade, il denaro già confermato resta come credito', async () => {
    const [a, b, c] = ctx.members;
    const match = await paidMatch(ctx, a, [a, b, c]);
    await pay(b, match, b, 'dichiarato');
    await pay(a, match, c, 'verificato');
    await respond(b, match, 'non_ci_sono');
    await respond(c, match, 'non_ci_sono');
    const m = await matchOf(match.id);
    expect(m.participants.find((p) => String(p.user) === b.user.id).payment).toBe('da_pagare');
    expect((await LedgerEntry.findOne({ match: match.id, user: b.user.id })).status).toBe('annullato');
    expect(m.participants.find((p) => String(p.user) === c.user.id).payment).toBe('verificato');
    expect((await LedgerEntry.findOne({ match: match.id, user: c.user.id })).status).toBe('verificato');
  });
});

describe('Saldi, riepilogo per partita e cassa comune', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });

  test('saldo: dovuto solo per partite chiuse, pagato solo se verificato; la dichiarazione è separata', async () => {
    const [a, b, c] = ctx.members;
    const match = await paidMatch(ctx, a, [a, b, c], 6000);
    let s = await cashbox(ctx.admin, ctx);
    expect(s.members.find((m) => m.userId === b.user.id).dueCents).toBe(0); // partita ancora aperta
    await api().post(`/api/matches/${match.id}/status`).set(a.auth).send({ status: 'chiusa' });
    await pay(b, match, b, 'dichiarato');
    await pay(a, match, c, 'verificato');
    s = await cashbox(ctx.admin, ctx);
    const row = (u) => s.members.find((m) => m.userId === u.user.id);
    expect(row(b)).toMatchObject({ dueCents: 2000, paidCents: 0, declaredCents: 2000, balanceCents: -2000 });
    expect(row(c)).toMatchObject({ dueCents: 2000, paidCents: 2000, balanceCents: 0 });
    expect(s.matches[0]).toMatchObject({ costCents: 6000, quotaCents: 2000, verifiedCents: 2000, declaredCents: 2000, missingCents: 2000, paidCount: 1 });
    expect(s.pending.map((e) => e.user.id)).toEqual([b.user.id]);
    expect(s.fund).toBeNull(); // cassa comune disattivata
    const mp = (await api().get(`/api/matches/${match.id}/payments`).set(b.auth)).body.payments;
    expect(mp.players.find((p) => p.userId === b.user.id).payment).toBe('dichiarato');
    expect(mp).toMatchObject({ verifiedCents: 2000, declaredCents: 2000, missingCents: 2000 });
  });

  test('privacy: un membro vede il proprio saldo ma non quelli degli altri', async () => {
    const [, b] = ctx.members;
    const s = await cashbox(b, ctx);
    expect(s.members).toBeNull();
    expect(s.me.userId).toBe(b.user.id);
    expect(s.isAdmin).toBe(false);
    const outsider = (await groupWithMembers(2)).admin;
    expect((await api().get(`/api/groups/${ctx.group.id}/cashbox`).set(outsider.auth)).status).toBe(403);
    expect((await api().get(`/api/groups/${ctx.group.id}/ledger`).set(outsider.auth)).status).toBe(403);
  });

  test('versamenti e spese dalla cassa comune solo se attiva; i membri dichiarano, l\'admin conferma', async () => {
    const [a, b] = ctx.members;
    expect((await entry(ctx, b, { type: 'versamento', amountCents: 1000 })).status).toBe(422); // cassa spenta
    expect((await api().patch(`/api/groups/${ctx.group.id}`).set(b.auth).send({ settings: { cashbox: true } })).status).toBe(403);
    await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { cashbox: true } });
    const dep = await entry(ctx, b, { type: 'versamento', amountCents: 2500, note: 'Per i palloni' });
    expect(dep.status).toBe(201);
    expect(dep.body.entry).toMatchObject({ status: 'dichiarato', amountCents: 2500 });
    expect((await entry(ctx, b, { type: 'versamento', amountCents: 500, userId: a.user.id })).status).toBe(403); // non per altri
    expect((await entry(ctx, b, { type: 'spesa', amountCents: 500, paidFrom: 'cassa' })).status).toBe(403);
    let s = await cashbox(ctx.admin, ctx);
    expect(s.fund).toMatchObject({ balanceCents: 0, pendingCents: 2500 }); // le quote delle partite non entrano nel fondo
    expect((await api().post(`/api/groups/${ctx.group.id}/ledger/${dep.body.entry._id}/verify`).set(b.auth)).status).toBe(403);
    expect((await api().post(`/api/groups/${ctx.group.id}/ledger/${dep.body.entry._id}/verify`).set(ctx.admin.auth)).status).toBe(200);
    expect((await api().post(`/api/groups/${ctx.group.id}/ledger/${dep.body.entry._id}/verify`).set(ctx.admin.auth)).status).toBe(409);
    const exp = await entry(ctx, ctx.admin, { type: 'spesa', amountCents: 1500, paidFrom: 'cassa', note: 'Palloni' });
    expect(exp.body.entry.status).toBe('verificato');
    s = await cashbox(ctx.admin, ctx);
    expect(s.fund).toMatchObject({ inCents: 2500, outCents: 1500, balanceCents: 1000 });
    expect(s.totals.expensesCents).toBe(1500);
  });

  test('spesa anticipata da un membro e rimborso: il saldo del membro segue', async () => {
    const [, b] = ctx.members;
    const before = (await cashbox(ctx.admin, ctx)).members.find((m) => m.userId === b.user.id).balanceCents;
    await entry(ctx, ctx.admin, { type: 'spesa', amountCents: 3000, paidFrom: 'membro', userId: b.user.id, note: 'Pettorine' });
    let row = (await cashbox(ctx.admin, ctx)).members.find((m) => m.userId === b.user.id);
    expect(row.balanceCents).toBe(before + 3000);
    expect(row.advancedCents).toBe(3000);
    await entry(ctx, ctx.admin, { type: 'rimborso', amountCents: 3000, userId: b.user.id });
    row = (await cashbox(ctx.admin, ctx)).members.find((m) => m.userId === b.user.id);
    expect(row.balanceCents).toBe(before);
    expect(row.reimbursedCents).toBe(3000);
    expect((await entry(ctx, ctx.admin, { type: 'rimborso', amountCents: 100 })).status).toBe(422); // manca la persona
    expect((await entry(ctx, ctx.admin, { type: 'spesa', amountCents: 100 })).status).toBe(422); // manca l'origine
    for (const bad of [{ amountCents: 0 }, { amountCents: -5 }, { amountCents: 1.5 }, { amountCents: 5_000_000 }]) {
      expect((await entry(ctx, ctx.admin, { type: 'spesa', paidFrom: 'cassa', ...bad })).status).toBe(422);
    }
  });

  test('annullare: motivo obbligatorio per una voce confermata, lo storico resta, i totali la escludono', async () => {
    const mk = await entry(ctx, ctx.admin, { type: 'spesa', amountCents: 700, paidFrom: 'cassa', note: 'Errore' });
    const id = mk.body.entry._id;
    const url = `/api/groups/${ctx.group.id}/ledger/${id}/cancel`;
    expect((await api().post(url).set(ctx.members[0].auth).send({ reason: 'boh' })).status).toBe(403);
    expect((await api().post(url).set(ctx.admin.auth).send({})).status).toBe(422);
    const before = (await cashbox(ctx.admin, ctx)).fund.outCents;
    const ok = await api().post(url).set(ctx.admin.auth).send({ reason: 'Importo sbagliato' });
    expect(ok.status).toBe(200);
    expect(ok.body.entry).toMatchObject({ status: 'annullato', cancelReason: 'Importo sbagliato' });
    expect((await cashbox(ctx.admin, ctx)).fund.outCents).toBe(before - 700);
    expect((await api().post(url).set(ctx.admin.auth).send({ reason: 'ancora' })).status).toBe(409);
    const list = await api().get(`/api/groups/${ctx.group.id}/ledger?status=annullato`).set(ctx.admin.auth);
    const item = list.body.items.find((e) => e.id === id);
    expect(item.history.map((h) => h.action)).toEqual(['registrato e verificato', 'annullato']);
    // Un membro può ritirare una propria dichiarazione non confermata.
    const own = await entry(ctx, ctx.members[0], { type: 'versamento', amountCents: 400 });
    const withdraw = await api().post(`/api/groups/${ctx.group.id}/ledger/${own.body.entry._id}/cancel`).set(ctx.members[0].auth).send({});
    expect(withdraw.status).toBe(200);
  });

  test('storico: l\'admin vede tutto, un membro solo le proprie voci e le spese; paginazione', async () => {
    const [a, b] = ctx.members;
    const all = await api().get(`/api/groups/${ctx.group.id}/ledger?limit=100`).set(ctx.admin.auth);
    expect(all.body.items.length).toBeGreaterThan(5);
    const mine = await api().get(`/api/groups/${ctx.group.id}/ledger?limit=100`).set(a.auth);
    expect(mine.body.items.every((e) => e.type === 'spesa' || e.user?.id === a.user.id || e.createdBy.id === a.user.id)).toBe(true);
    expect(mine.body.items.length).toBeLessThan(all.body.items.length);
    const page1 = await api().get(`/api/groups/${ctx.group.id}/ledger?limit=2`).set(ctx.admin.auth);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await api().get(`/api/groups/${ctx.group.id}/ledger?limit=2&before=${page1.body.items[1].id}`).set(ctx.admin.auth);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
    expect(JSON.stringify(all.body)).not.toMatch(/@calcetto\.test/);
    void b;
  });

  test('migrazione dalla V1: i pagamenti segnati vengono importati una sola volta', async () => {
    const [a, b] = ctx.members;
    const match = await paidMatch(ctx, a, [a, b]);
    await Match.collection.updateOne({ _id: new (require('mongoose').Types.ObjectId)(match.id), 'participants.user': new (require('mongoose').Types.ObjectId)(b.user.id) }, { $set: { 'participants.$.paid': true, 'participants.$.payment': 'da_pagare' } });
    expect(await cashboxService.backfillFromLegacy()).toBeGreaterThanOrEqual(1);
    const e = await LedgerEntry.findOne({ match: match.id, user: b.user.id });
    expect(e).toMatchObject({ status: 'verificato', amountCents: 3000 });
    expect(e.history[0].action).toBe('importato');
    expect(await cashboxService.backfillFromLegacy()).toBe(0);
    expect((await matchOf(match.id)).participants.find((p) => String(p.user) === b.user.id).payment).toBe('verificato');
  });
});
