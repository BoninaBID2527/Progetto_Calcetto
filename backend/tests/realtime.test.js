'use strict';

const http = require('http');
const { io: connect } = require('socket.io-client');
const { app, api, useTestDatabase, groupWithMembers, createMatch, respond, createUser } = require('./helpers');
const { initSocket } = require('../src/socket');
const realtime = require('../src/services/realtime');

useTestDatabase();

let server;
let url;
const sockets = [];

beforeAll(async () => {
  server = http.createServer(app);
  initSocket(server);
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  realtime.getIo().close();
  await new Promise((r) => server.close(r));
  realtime.setIo(null);
});

/** Collega un client e attende che il server lo abbia messo nelle sue stanze. */
function connectAs(user) {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { auth: { token: user.token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    socket.once('session:ready', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function nextEvent(socket, event, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Evento ${event} non ricevuto`)), timeout);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

describe('Socket.IO', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(3);
  });

  test('senza token o con token non valido la connessione viene rifiutata', async () => {
    await expect(connectAs({ token: undefined })).rejects.toThrow(/UNAUTHORIZED/);
    await expect(connectAs({ token: 'non.valido' })).rejects.toThrow(/UNAUTHORIZED/);
  });

  test('iscrizione dal vivo: gli altri membri ricevono la partita aggiornata', async () => {
    const watcher = await connectAs(ctx.members[1]);
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2 });
    const update = nextEvent(watcher, 'match:updated', (m) => m.id === match.id && m.counts.ci_sono === 1);
    await respond(ctx.members[0], match);
    const payload = await update;
    expect(payload.participants[0].user.id).toBe(ctx.members[0].user.id);
    expect(JSON.stringify(payload)).not.toMatch(/@calcetto\.test/);
  });

  test('lista d\'attesa che scorre: chi entra riceve la notifica in tempo reale', async () => {
    const [a, b] = ctx.members;
    const bSocket = await connectAs(b);
    const match = await createMatch(ctx.admin, ctx.group, { slots: 2 });
    await respond(ctx.admin, match);
    await respond(a, match);
    expect((await respond(b, match)).body.outcome).toBe('attesa');
    const promoted = nextEvent(bSocket, 'notification:new', (n) => n.type === 'promozione');
    const updated = nextEvent(bSocket, 'match:updated', (m) => m.id === match.id && m.participants.some((p) => p.user.id === b.user.id && p.response === 'ci_sono'));
    await respond(a, match, 'non_ci_sono');
    expect((await promoted).title).toMatch(/Sei dentro/);
    await updated;
  });

  test('chat: i nuovi messaggi e le reazioni arrivano a tutto il gruppo', async () => {
    const listener = await connectAs(ctx.admin);
    const incoming = nextEvent(listener, 'chat:message', (m) => m.text === 'Ci vediamo alle 20:45');
    const sent = await api().post(`/api/groups/${ctx.group.id}/messages`).set(ctx.members[0].auth).send({ text: 'Ci vediamo alle 20:45' });
    expect((await incoming).id).toBe(sent.body.message.id);
    const reaction = nextEvent(listener, 'chat:reaction', (r) => r.messageId === sent.body.message.id);
    await api().post(`/api/groups/${ctx.group.id}/messages/${sent.body.message.id}/reactions`).set(ctx.members[1].auth).send({ emoji: '👍' });
    expect((await reaction).reactions).toEqual([{ emoji: '👍', count: 1, userIds: [ctx.members[1].user.id] }]);
  });

  test('chi entra in un gruppo mentre è collegato riceve subito i suoi eventi', async () => {
    const newcomer = await createUser('Nuovo');
    const socket = await connectAs(newcomer);
    await api().post('/api/groups/join').set(newcomer.auth).send({ code: ctx.group.inviteCode });
    const incoming = nextEvent(socket, 'chat:message', (m) => m.text === 'Benvenuto!');
    await api().post(`/api/groups/${ctx.group.id}/messages`).set(ctx.admin.auth).send({ text: 'Benvenuto!' });
    await incoming;
  });

  test('chi non è nel gruppo non riceve i suoi eventi', async () => {
    const stranger = await createUser('Estraneo');
    const socket = await connectAs(stranger);
    let received = false;
    socket.on('chat:message', () => (received = true));
    await api().post(`/api/groups/${ctx.group.id}/messages`).set(ctx.admin.auth).send({ text: 'Solo per noi' });
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toBe(false);
  });

  test('voti MVP: i totali si aggiornano dal vivo', async () => {
    const [a, b] = ctx.members;
    const match = await createMatch(ctx.admin, ctx.group, { slots: 4 });
    for (const u of [ctx.admin, a, b]) await respond(u, match);
    await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
    await api().post(`/api/matches/${match.id}/teams/balance`).set(ctx.admin.auth).send({});
    await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ scoreA: 2, scoreB: 2 });
    const watcher = await connectAs(b);
    const update = nextEvent(watcher, 'voting:updated', (v) => v.matchId === match.id && v.mvpVotes === 1);
    await api().post(`/api/matches/${match.id}/mvp-vote`).set(a.auth).send({ mvpUserId: b.user.id });
    expect((await update).eligible).toBe(3);
  });

  test('logout: il socket aperto con quel token viene scollegato', async () => {
    const user = await createUser('Uscente');
    const socket = await connectAs(user);
    const closed = new Promise((r) => socket.once('disconnect', r));
    await api().post('/api/auth/logout').set(user.auth);
    await closed;
    await expect(connectAs(user)).rejects.toThrow(/UNAUTHORIZED/);
  });
});
