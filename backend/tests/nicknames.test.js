'use strict';

const { api, useTestDatabase, groupWithMembers } = require('./helpers');

useTestDatabase();

describe('Soprannomi', () => {
  let ctx;
  let luca;
  let paolo;
  const nick = (path = '') => `/api/groups/${ctx.group.id}/nicknames${path}`;

  beforeAll(async () => {
    ctx = await groupWithMembers(3);
    [luca, paolo] = ctx.members;
  });

  test('un membro propone un soprannome: è subito visibile e il destinatario riceve una notifica', async () => {
    const res = await api().post(nick()).set(paolo.auth).send({ targetUserId: luca.user.id, text: 'Cesarini' });
    expect(res.status).toBe(201);
    expect(res.body.nickname).toMatchObject({ text: 'Cesarini', status: 'attivo', proposer: { id: paolo.user.id } });

    const members = await api().get(`/api/groups/${ctx.group.id}/members`).set(ctx.admin.auth);
    expect(members.body.members.find((m) => m.user.id === luca.user.id).user.nickname).toBe('Cesarini');

    const notes = await api().get('/api/notifications').set(luca.auth);
    expect(notes.body.notifications[0]).toMatchObject({ type: 'soprannome' });
    expect(notes.body.notifications[0].title).toMatch(/Cesarini/);
  });

  test('a chi non è del gruppo non si dà un soprannome (422); testo troppo corto (422)', async () => {
    expect((await api().post(nick()).set(paolo.auth).send({ targetUserId: '0123456789abcdef01234567', text: 'Ciao' })).status).toBe(422);
    expect((await api().post(nick()).set(paolo.auth).send({ targetUserId: luca.user.id, text: 'X' })).status).toBe(422);
  });

  test('solo il destinatario può rifiutare o sostituire (403 per gli altri)', async () => {
    const list = await api().get(nick(`?userId=${luca.user.id}`)).set(luca.auth);
    const active = list.body.nicknames.find((n) => n.status === 'attivo');
    expect((await api().post(nick(`/${active.id}/reject`)).set(paolo.auth)).status).toBe(403);
    expect((await api().post(nick(`/${active.id}/replace`)).set(ctx.admin.auth).send({ text: 'Nuovo' })).status).toBe(403);

    const replaced = await api().post(nick(`/${active.id}/replace`)).set(luca.auth).send({ text: 'Il Muro' });
    expect(replaced.status).toBe(201);
    expect(replaced.body.nickname).toMatchObject({ text: 'Il Muro', proposer: { id: luca.user.id } });
  });

  test('lo storico conserva chi ha proposto cosa e un solo soprannome resta attivo', async () => {
    const list = await api().get(nick(`?userId=${luca.user.id}`)).set(ctx.admin.auth);
    const byText = Object.fromEntries(list.body.nicknames.map((n) => [n.text, n]));
    expect(byText.Cesarini).toMatchObject({ status: 'sostituito', proposer: { id: paolo.user.id } });
    expect(byText['Il Muro'].status).toBe('attivo');
    expect(list.body.nicknames.filter((n) => n.status === 'attivo')).toHaveLength(1);
  });

  test('il destinatario rifiuta: il soprannome sparisce dalla lista membri', async () => {
    const created = await api().post(nick()).set(ctx.admin.auth).send({ targetUserId: paolo.user.id, text: 'Turbo' });
    const res = await api().post(nick(`/${created.body.nickname.id}/reject`)).set(paolo.auth);
    expect(res.status).toBe(200);
    expect(res.body.nickname.status).toBe('rifiutato');
    const members = await api().get(`/api/groups/${ctx.group.id}/members`).set(paolo.auth);
    expect(members.body.members.find((m) => m.user.id === paolo.user.id).user.nickname).toBeNull();
    // Un soprannome già rifiutato non si può rifiutare di nuovo.
    expect((await api().post(nick(`/${created.body.nickname.id}/reject`)).set(paolo.auth)).status).toBe(409);
  });

  test('solo l\'admin rimuove un soprannome', async () => {
    const created = await api().post(nick()).set(luca.auth).send({ targetUserId: paolo.user.id, text: 'Piedi Buoni' });
    const id = created.body.nickname.id;
    expect((await api().delete(nick(`/${id}`)).set(luca.auth)).status).toBe(403);
    const res = await api().delete(nick(`/${id}`)).set(ctx.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.nickname).toMatchObject({ status: 'rimosso', decidedBy: { id: ctx.admin.user.id } });
  });

  test('il soprannome compare anche nei messaggi della chat', async () => {
    await api().post(`/api/groups/${ctx.group.id}/messages`).set(luca.auth).send({ text: 'Stasera para tutto' });
    const res = await api().get(`/api/groups/${ctx.group.id}/messages`).set(paolo.auth);
    const mine = res.body.messages.find((m) => m.text === 'Stasera para tutto');
    expect(mine.author.nickname).toBe('Il Muro');
  });
});
