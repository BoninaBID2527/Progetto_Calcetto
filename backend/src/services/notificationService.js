'use strict';

const { Notification, User } = require('../models');
const { CATEGORY_OF, CRITICAL } = require('../models/Notification');
const realtime = require('./realtime');

const toDto = (n) => ({
  id: String(n._id),
  type: n.type,
  category: n.category,
  title: n.title,
  body: n.body,
  link: n.link,
  groupId: n.group ? String(n.group) : null,
  read: Boolean(n.readAt),
  createdAt: n.createdAt,
});

/** Destinatari che non hanno spento la categoria (le critiche arrivano sempre). */
async function filterByPrefs(userIds, type, category) {
  if (CRITICAL.includes(type)) return userIds;
  const users = await User.find({ _id: { $in: userIds } }).select('notificationPrefs').lean();
  const off = new Set(users.filter((u) => u.notificationPrefs?.categories?.[category] === false).map((u) => String(u._id)));
  return userIds.filter((id) => !off.has(String(id)));
}

/**
 * Crea la notifica in-app per ogni destinatario, la trasmette in tempo reale
 * e la passa al servizio push. Con `dedupeKey` la stessa notifica non viene
 * mai creata due volte per la stessa persona (indice unico): è ciò che rende
 * innocui promemoria ripetuti, retry e richieste simultanee.
 */
async function notify(userIds, { type, title, body = '', link = null, group = null, category, dedupeKey }) {
  const cat = category || CATEGORY_OF[type] || null;
  const unique = await filterByPrefs([...new Set(userIds.map(String))], type, cat);
  if (!unique.length) return [];
  let docs;
  if (dedupeKey) {
    docs = [];
    for (const user of unique) {
      try {
        docs.push(await Notification.create({ user, type, title, body, link, group, category: cat, dedupeKey }));
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
  } else {
    docs = await Notification.insertMany(unique.map((user) => ({ user, type, title, body, link, group, category: cat })));
  }
  for (const doc of docs) realtime.toUser(doc.user, 'notification:new', toDto(doc));
  if (docs.length) await require('./pushService').deliver(docs);
  return docs;
}

async function list(userId, { limit = 30, unreadOnly = false } = {}) {
  const filter = { user: userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);
  return { notifications: items.map(toDto), unread };
}

async function markRead(userId, notificationId) {
  return Notification.findOneAndUpdate({ _id: notificationId, user: userId }, { $set: { readAt: new Date() } }, { new: true });
}

async function markAllRead(userId) {
  await Notification.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
}

module.exports = { notify, list, markRead, markAllRead, toDto };
