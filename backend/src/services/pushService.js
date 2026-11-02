'use strict';

/*
 * Notifiche Web Push (standard VAPID). Una push parte solo se:
 *  - il server ha le chiavi VAPID;
 *  - l'utente ha attivato le push dal profilo (consenso esplicito);
 *  - non siamo nella sua fascia silenziosa (fuso Europe/Rome);
 *  - non ha già ricevuto troppe push nell'ultima ora.
 * La categoria è già filtrata da notificationService. Le subscription che il
 * servizio push dichiara scadute (404/410) vengono cancellate.
 * La notifica in-app esiste sempre: la push è solo un avviso in più.
 */
const webpush = require('web-push');
const config = require('../config/env');
const { Notification, PushSubscription, User } = require('../models');
const { appConfig } = require('../config/appConfig');

const enabled = () => Boolean(config.vapid.publicKey && config.vapid.privateKey);
if (enabled()) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

let transport = (subscription, payload) => webpush.sendNotification(subscription, payload, { TTL: 6 * 3600, urgency: 'normal' });
let forceEnabled = null;

/** Solo per i test: sostituisce il trasporto e forza lo stato di attivazione. */
function setTransport(fn, { enable = true } = {}) {
  transport = fn;
  forceEnabled = enable;
}
const isEnabled = () => (forceEnabled === null ? enabled() : forceEnabled);

const hhmm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: appConfig.timeZone });

function inQuietHours(quiet, now = new Date()) {
  if (!quiet?.enabled) return false;
  const t = hhmm.format(now);
  const { start, end } = quiet;
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

const pending = new Set();

async function deliverOne(doc, now) {
  const user = await User.findById(doc.user).select('notificationPrefs').lean();
  const prefs = user?.notificationPrefs || {};
  const skip = (reason) => Notification.updateOne({ _id: doc._id }, { $set: { pushStatus: 'saltata' } }).then(() => reason);
  if (!isEnabled()) return skip('server');
  if (!prefs.push) return skip('preferenza');
  if (inQuietHours(prefs.quietHours, now)) return skip('fascia silenziosa');
  const lastHour = await Notification.countDocuments({ user: doc.user, pushStatus: 'inviata', pushedAt: { $gte: new Date(now.getTime() - 3_600_000) } });
  if (lastHour >= (prefs.maxPushPerHour || 6)) return skip('limite orario');
  const subs = await PushSubscription.find({ user: doc.user }).lean();
  if (!subs.length) return skip('nessun dispositivo');

  const unread = await Notification.countDocuments({ user: doc.user, readAt: null });
  const payload = JSON.stringify({
    title: doc.title,
    body: doc.body,
    url: doc.link || '/notifiche',
    tag: doc.dedupeKey || String(doc._id),
    notificationId: String(doc._id),
    unread,
  });
  let ok = 0;
  for (const sub of subs) {
    try {
      await transport({ endpoint: sub.endpoint, keys: sub.keys }, payload);
      ok += 1;
      await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastSuccessAt: now, failureCount: 0 } });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await PushSubscription.deleteOne({ _id: sub._id });
      else {
        const updated = await PushSubscription.findOneAndUpdate({ _id: sub._id }, { $inc: { failureCount: 1 } }, { new: true });
        if (updated?.failureCount >= 5) await PushSubscription.deleteOne({ _id: sub._id });
      }
    }
  }
  await Notification.updateOne({ _id: doc._id }, { $set: ok ? { pushStatus: 'inviata', pushedAt: now } : { pushStatus: 'fallita' } });
  return ok ? 'inviata' : 'fallita';
}

/**
 * Avvia l'invio in background: la richiesta HTTP che ha generato la
 * notifica non aspetta il servizio push. `idle()` serve ai test.
 */
function deliver(docs) {
  const now = new Date();
  const job = (async () => {
    for (const doc of docs) {
      try {
        await deliverOne(doc, now);
      } catch (err) {
        if (!config.isTest) console.error('Push non inviata:', err.message);
      }
    }
  })();
  pending.add(job);
  job.finally(() => pending.delete(job));
  return Promise.resolve();
}

const idle = () => Promise.all([...pending]);

async function subscribe(user, { endpoint, keys }, userAgent = '') {
  // Lo stesso browser può passare a un altro account: la subscription segue l'ultimo utente.
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { user: user._id, keys, userAgent: userAgent.slice(0, 200), failureCount: 0 } },
    { upsert: true, new: true }
  );
  const all = await PushSubscription.find({ user: user._id }).sort({ updatedAt: -1 }).lean();
  if (all.length > 10) await PushSubscription.deleteMany({ _id: { $in: all.slice(10).map((s) => s._id) } });
  await User.updateOne({ _id: user._id }, { $set: { 'notificationPrefs.push': true } });
}

async function unsubscribe(user, endpoint) {
  const res = await PushSubscription.deleteOne({ endpoint, user: user._id });
  return res.deletedCount > 0;
}

async function sendTest(user) {
  if (!isEnabled()) return { sent: 0, reason: 'Le push non sono configurate sul server.' };
  const subs = await PushSubscription.find({ user: user._id }).lean();
  let sent = 0;
  for (const sub of subs) {
    try {
      await transport({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title: 'Notifiche attive ⚽', body: 'Da ora ti avvisiamo quando si cerca gente.', url: '/profilo', tag: 'test' }));
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await PushSubscription.deleteOne({ _id: sub._id });
    }
  }
  return { sent, devices: subs.length };
}

module.exports = { deliver, idle, subscribe, unsubscribe, sendTest, setTransport, isEnabled, inQuietHours, publicKey: () => config.vapid.publicKey };
