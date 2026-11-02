'use strict';

const { api, useTestDatabase, createUser } = require('./helpers');
const pushService = require('../src/services/pushService');
const notificationService = require('../src/services/notificationService');
const { Notification, PushSubscription } = require('../src/models');

useTestDatabase();

const sub = (n) => ({ endpoint: `https://push.example.test/sub/${n}`, keys: { p256dh: 'BPpublicKeyDiProva1234567890', auth: 'authDiProva123' } });

describe('Web Push', () => {
  let sent;
  let failWith;
  const fakeTransport = async (subscription, payload) => {
    if (failWith) {
      const err = new Error('push fallita');
      err.statusCode = failWith;
      throw err;
    }
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
  };
  beforeAll(() => pushService.setTransport(fakeTransport));
  beforeEach(() => {
    sent = [];
    failWith = null;
  });

  test('senza chiavi VAPID il server dichiara le push spente', async () => {
    pushService.setTransport(async () => {}, { enable: false });
    const u = await createUser('Senza');
    const res = await api().get('/api/push/config').set(u.auth);
    expect(res.body).toEqual({ enabled: false, publicKey: null });
    pushService.setTransport(fakeTransport);
  });

  test('subscription: solo https, attiva la preferenza, segue l\'ultimo account del browser, si cancella', async () => {
    const a = await createUser('Anna');
    const b = await createUser('Bruno');
    expect((await api().post('/api/push/subscriptions').set(a.auth).send({ ...sub(1), endpoint: 'http://insicuro.test/x' })).status).toBe(422);
    expect((await api().post('/api/push/subscriptions').set(a.auth).send(sub(1))).status).toBe(201);
    expect((await api().get('/api/auth/me').set(a.auth)).body.user.notificationPrefs.push).toBe(true);
    await api().post('/api/push/subscriptions').set(b.auth).send(sub(1));
    expect(String((await PushSubscription.findOne({ endpoint: sub(1).endpoint })).user)).toBe(b.user.id);
    expect((await api().delete('/api/push/subscriptions').set(b.auth).send({ endpoint: sub(1).endpoint })).status).toBe(204);
    expect(await PushSubscription.countDocuments({ endpoint: sub(1).endpoint })).toBe(0);
  });

  test('invio: payload con titolo e link, stato "inviata"; con la preferenza spenta nessuna push', async () => {
    const u = await createUser('Carla');
    await api().post('/api/push/subscriptions').set(u.auth).send(sub(2));
    await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { quietHours: { enabled: false } } });
    const [doc] = await notificationService.notify([u.user.id], { type: 'boncall', title: '⚽ Si cerca gente per giovedì!', body: 'Mancano 4 giocatori.', link: '/boncall/abc' });
    await pushService.idle();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ title: '⚽ Si cerca gente per giovedì!', url: '/boncall/abc', unread: 1 });
    expect((await Notification.findById(doc._id)).pushStatus).toBe('inviata');

    await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { push: false } });
    const [skipped] = await notificationService.notify([u.user.id], { type: 'boncall', title: 'Altra' });
    await pushService.idle();
    expect(sent).toHaveLength(1);
    expect((await Notification.findById(skipped._id)).pushStatus).toBe('saltata');
  });

  test('fascia silenziosa e limite orario bloccano la push ma non la notifica in-app', async () => {
    const u = await createUser('Dario');
    await api().post('/api/push/subscriptions').set(u.auth).send(sub(3));
    await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { quietHours: { enabled: true, start: '00:00', end: '23:59' } } });
    await notificationService.notify([u.user.id], { type: 'boncall', title: 'Di notte' });
    await pushService.idle();
    expect(sent).toHaveLength(0);
    expect(await Notification.countDocuments({ user: u.user.id })).toBe(1);

    await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { quietHours: { enabled: false }, maxPushPerHour: 1 } });
    await notificationService.notify([u.user.id], { type: 'boncall', title: 'Prima' });
    await pushService.idle();
    await notificationService.notify([u.user.id], { type: 'boncall', title: 'Seconda' });
    await pushService.idle();
    expect(sent.map((s) => s.payload.title)).toEqual(['Prima']);
  });

  test('una subscription scaduta (410) viene eliminata', async () => {
    const u = await createUser('Elisa');
    await api().post('/api/push/subscriptions').set(u.auth).send(sub(4));
    await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { quietHours: { enabled: false } } });
    failWith = 410;
    const [doc] = await notificationService.notify([u.user.id], { type: 'boncall', title: 'Scaduta' });
    await pushService.idle();
    expect(await PushSubscription.countDocuments({ endpoint: sub(4).endpoint })).toBe(0);
    expect((await Notification.findById(doc._id)).pushStatus).toBe('fallita');
  });

  test('la stessa notifica (stessa chiave) non produce due push', async () => {
    const u = await createUser('Fabio');
    await api().post('/api/push/subscriptions').set(u.auth).send(sub(5));
    await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { quietHours: { enabled: false } } });
    await notificationService.notify([u.user.id], { type: 'boncall', title: 'Una sola', dedupeKey: 'push:unica' });
    await notificationService.notify([u.user.id], { type: 'boncall', title: 'Una sola', dedupeKey: 'push:unica' });
    await pushService.idle();
    expect(sent).toHaveLength(1);
  });

  test('fasce silenziose a cavallo della mezzanotte', () => {
    const at = (h, m) => {
      // Orario italiano costruito sull'offset corrente di Europe/Rome.
      const d = new Date();
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).split(':').map(Number);
      return new Date(d.getTime() + ((h - parts[0]) * 60 + (m - parts[1])) * 60_000);
    };
    const q = { enabled: true, start: '23:00', end: '08:00' };
    expect(pushService.inQuietHours(q, at(23, 30))).toBe(true);
    expect(pushService.inQuietHours(q, at(7, 59))).toBe(true);
    expect(pushService.inQuietHours(q, at(12, 0))).toBe(false);
    expect(pushService.inQuietHours({ ...q, enabled: false }, at(23, 30))).toBe(false);
  });

  test('le preferenze si aggiornano a pezzi senza perdere il resto', async () => {
    const u = await createUser('Gino');
    await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { categories: { social: false } } });
    const res = await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { quietHours: { start: '22:30' } } });
    expect(res.body.user.notificationPrefs).toMatchObject({ categories: { social: false, boncall: true }, quietHours: { start: '22:30', end: '08:00', enabled: true } });
    expect((await api().patch('/api/users/me').set(u.auth).send({ notificationPrefs: { quietHours: { start: '25:00' } } })).status).toBe(422);
  });
});
