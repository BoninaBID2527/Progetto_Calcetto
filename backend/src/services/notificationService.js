'use strict';

const { Notification } = require('../models');
const realtime = require('./realtime');

const toDto = (n) => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  groupId: n.group ? String(n.group) : null,
  read: Boolean(n.readAt),
  createdAt: n.createdAt,
});

/** Crea una notifica in-app per ciascun destinatario e la invia in tempo reale. */
async function notify(userIds, { type, title, body = '', link = null, group = null }) {
  const unique = [...new Set(userIds.map(String))];
  if (!unique.length) return [];
  const docs = await Notification.insertMany(unique.map((user) => ({ user, type, title, body, link, group })));
  for (const doc of docs) realtime.toUser(doc.user, 'notification:new', toDto(doc));
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
