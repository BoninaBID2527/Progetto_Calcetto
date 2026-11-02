'use strict';

const { api, useTestDatabase, groupWithMembers, createUser, joinGroup } = require('./helpers');

useTestDatabase();

describe('Chat del gruppo', () => {
  let ctx;
  const url = (p = '') => `/api/groups/${ctx.group.id}/messages${p}`;

  beforeAll(async () => {
    ctx = await groupWithMembers(3);
  });

  test('i messaggi di sistema compaiono nel flusso (es. ingresso nel gruppo)', async () => {
    const res = await api().get(url()).set(ctx.admin.auth);
    expect(res.status).toBe(200);
    const system = res.body.messages.filter((m) => m.kind === 'sistema');
    expect(system.some((m) => /si unisce al gruppo/.test(m.text))).toBe(true);
    expect(system[0].author).toBeNull();
  });

  test('invio: 201 con autore e orario; vuoto o troppo lungo: 422', async () => {
    const res = await api().post(url()).set(ctx.members[0].auth).send({ text: '  Chi porta il pallone?  ' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({ text: 'Chi porta il pallone?', kind: 'utente', author: { id: ctx.members[0].user.id } });
    expect(new Date(res.body.message.createdAt).getTime()).toBeGreaterThan(0);
    expect((await api().post(url()).set(ctx.members[0].auth).send({ text: '   ' })).status).toBe(422);
    expect((await api().post(url()).set(ctx.members[0].auth).send({ text: 'x'.repeat(1001) })).status).toBe(422);
  });

  test('cronologia a pagine: before carica i precedenti, after recupera i successivi', async () => {
    for (let i = 1; i <= 12; i++) await api().post(url()).set(ctx.admin.auth).send({ text: `Messaggio ${i}` });
    const last = await api().get(url('?limit=5')).set(ctx.admin.auth);
    expect(last.body.messages.map((m) => m.text)).toEqual(['Messaggio 8', 'Messaggio 9', 'Messaggio 10', 'Messaggio 11', 'Messaggio 12']);
    expect(last.body.hasMore).toBe(true);
    const older = await api().get(url(`?limit=5&before=${last.body.messages[0].id}`)).set(ctx.admin.auth);
    expect(older.body.messages.map((m) => m.text)).toEqual(['Messaggio 3', 'Messaggio 4', 'Messaggio 5', 'Messaggio 6', 'Messaggio 7']);
    const newer = await api().get(url(`?after=${older.body.messages[4].id}`)).set(ctx.admin.auth);
    expect(newer.body.messages.map((m) => m.text)).toEqual(['Messaggio 8', 'Messaggio 9', 'Messaggio 10', 'Messaggio 11', 'Messaggio 12']);
    expect(newer.body.hasMore).toBe(false);
    expect((await api().get(url('?limit=500')).set(ctx.admin.auth)).status).toBe(422);
  });

  test('reazioni rapide: si aggiungono e si tolgono; emoji fuori elenco: 422', async () => {
    const sent = await api().post(url()).set(ctx.admin.auth).send({ text: 'Stasera si vince' });
    const id = sent.body.message.id;
    const r1 = await api().post(url(`/${id}/reactions`)).set(ctx.members[0].auth).send({ emoji: '🔥' });
    await api().post(url(`/${id}/reactions`)).set(ctx.members[1].auth).send({ emoji: '🔥' });
    expect(r1.status).toBe(200);
    const both = await api().post(url(`/${id}/reactions`)).set(ctx.admin.auth).send({ emoji: '😂' });
    expect(both.body.message.reactions).toEqual([
      { emoji: '🔥', count: 2, userIds: [ctx.members[0].user.id, ctx.members[1].user.id] },
      { emoji: '😂', count: 1, userIds: [ctx.admin.user.id] },
    ]);
    const removed = await api().post(url(`/${id}/reactions`)).set(ctx.members[0].auth).send({ emoji: '🔥' });
    expect(removed.body.message.reactions[0]).toMatchObject({ emoji: '🔥', count: 1 });
    expect((await api().post(url(`/${id}/reactions`)).set(ctx.admin.auth).send({ emoji: '💩' })).status).toBe(422);
    expect((await api().post(url('/0123456789abcdef01234567/reactions')).set(ctx.admin.auth).send({ emoji: '👍' })).status).toBe(404);
  });

  test('non letti: contati nella lista gruppi e azzerati con "letto"', async () => {
    const reader = await createUser('Lettore');
    await joinGroup(reader, ctx.group);
    await api().post(url()).set(ctx.admin.auth).send({ text: 'Uno' });
    await api().post(url()).set(ctx.members[0].auth).send({ text: 'Due' });
    const before = await api().get('/api/groups').set(reader.auth);
    expect(before.body.groups[0].unreadCount).toBe(2);
    // I propri messaggi non contano come non letti.
    await api().post(url()).set(reader.auth).send({ text: 'Eccomi' });
    expect((await api().get('/api/groups').set(reader.auth)).body.groups[0].unreadCount).toBe(0);
    await api().post(url()).set(ctx.admin.auth).send({ text: 'Tre' });
    expect((await api().get('/api/groups').set(reader.auth)).body.groups[0].unreadCount).toBe(1);
    expect((await api().post(url('/read')).set(reader.auth)).status).toBe(200);
    expect((await api().get('/api/groups').set(reader.auth)).body.groups[0].unreadCount).toBe(0);
  });
});

describe('Notifiche in-app', () => {
  test('elenco, filtro non lette, segna come letta (solo le proprie) e segna tutte', async () => {
    const ctx = await groupWithMembers(2);
    const [luca] = ctx.members;
    await api().post(`/api/groups/${ctx.group.id}/nicknames`).set(ctx.admin.auth).send({ targetUserId: luca.user.id, text: 'Turbo' });
    await api().post(`/api/groups/${ctx.group.id}/nicknames`).set(ctx.admin.auth).send({ targetUserId: luca.user.id, text: 'Razzo' });
    const list = await api().get('/api/notifications?unread=true').set(luca.auth);
    expect(list.body.unread).toBe(2);
    const first = list.body.notifications[0];
    expect((await api().post(`/api/notifications/${first.id}/read`).set(ctx.admin.auth)).status).toBe(404);
    expect((await api().post(`/api/notifications/${first.id}/read`).set(luca.auth)).body.notification.read).toBe(true);
    expect((await api().get('/api/notifications').set(luca.auth)).body.unread).toBe(1);
    expect((await api().post('/api/notifications/read-all').set(luca.auth)).status).toBe(204);
    expect((await api().get('/api/notifications').set(luca.auth)).body.unread).toBe(0);
  });
});
