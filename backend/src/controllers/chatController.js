'use strict';

const chatService = require('../services/chatService');
const notificationService = require('../services/notificationService');
const { notFound } = require('../utils/AppError');

const list = async (req, res) => res.json(await chatService.list(req.group._id, req.validQuery));
const post = async (req, res) => res.status(201).json({ message: await chatService.post(req.group, req.user, req.body.text) });
const react = async (req, res) =>
  res.json({ message: await chatService.toggleReaction(req.group, req.user, req.params.messageId, req.body.emoji) });
const markRead = async (req, res) => res.json(await chatService.markRead(req.group, req.user));

async function notifications(req, res) {
  const { unread, limit } = req.validQuery;
  res.json(await notificationService.list(req.user._id, { limit, unreadOnly: unread === 'true' }));
}

async function readNotification(req, res, next) {
  const n = await notificationService.markRead(req.user._id, req.params.notificationId);
  if (!n) return next(notFound('Notifica non trovata.'));
  return res.json({ notification: notificationService.toDto(n) });
}

async function readAllNotifications(req, res) {
  await notificationService.markAllRead(req.user._id);
  res.status(204).end();
}

module.exports = { list, post, react, markRead, notifications, readNotification, readAllNotifications };
