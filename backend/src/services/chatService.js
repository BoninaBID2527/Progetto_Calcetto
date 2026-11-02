'use strict';

const { Message, Group } = require('../models');
const { unprocessable, notFound } = require('../utils/AppError');
const { REACTIONS } = require('../config/appConfig');
const { userResolver } = require('./dto');
const realtime = require('./realtime');

function messageDto(m, resolve) {
  return {
    id: String(m._id),
    groupId: String(m.group),
    kind: m.kind,
    text: m.text,
    author: m.author ? resolve(m.author) : null,
    reactions: (m.reactions || [])
      .filter((r) => r.users.length > 0)
      .map((r) => ({ emoji: r.emoji, count: r.users.length, userIds: r.users.map(String) })),
    createdAt: m.createdAt,
  };
}

async function toDtos(groupId, messages) {
  // Richiesto qui per evitare una dipendenza circolare con nicknameService.
  const { activeMap } = require('./nicknameService');
  const resolve = await userResolver(messages.map((m) => m.author), await activeMap(groupId));
  return messages.map((m) => messageDto(m, resolve));
}

/**
 * Cronologia a pagine: senza cursori le ultime `limit`; con `before` le
 * precedenti a quel messaggio; con `after` quelle successive (per recuperare
 * ciò che si è perso durante una disconnessione).
 */
async function list(groupId, { before, after, limit = 30 }) {
  const filter = { group: groupId };
  if (before) filter._id = { $lt: before };
  if (after) filter._id = { $gt: after };
  const sort = after ? { _id: 1 } : { _id: -1 };
  const items = await Message.find(filter).sort(sort).limit(limit + 1).lean();
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  if (!after) page.reverse();
  return { messages: await toDtos(groupId, page), hasMore };
}

async function post(group, user, text) {
  const message = await Message.create({ group: group._id, author: user._id, kind: 'utente', text });
  await Group.updateOne(
    { _id: group._id },
    { $set: { 'members.$[me].lastReadAt': message.createdAt } },
    { arrayFilters: [{ 'me.user': user._id }] }
  );
  const [dto] = await toDtos(group._id, [message.toObject()]);
  realtime.toGroup(group._id, 'chat:message', dto);
  return dto;
}

/** Messaggio di sistema nel flusso della chat (iscrizioni, risultati, MVP...). */
async function postSystem(groupId, text) {
  const message = await Message.create({ group: groupId, kind: 'sistema', text });
  const dto = messageDto(message.toObject(), () => null);
  realtime.toGroup(groupId, 'chat:message', dto);
  return dto;
}

/** Aggiunge o toglie la reazione dell'utente (toggle). */
async function toggleReaction(group, user, messageId, emoji) {
  if (!REACTIONS.includes(emoji)) throw unprocessable('Reazione non disponibile.', { emoji: 'Scegli una delle reazioni proposte.' });
  const message = await Message.findOne({ _id: messageId, group: group._id });
  if (!message) throw notFound('Messaggio non trovato.');
  const existing = message.reactions.find((r) => r.emoji === emoji);
  const hasReacted = existing && existing.users.some((u) => String(u) === String(user._id));
  if (hasReacted) {
    await Message.updateOne({ _id: messageId, 'reactions.emoji': emoji }, { $pull: { 'reactions.$.users': user._id } });
  } else if (existing) {
    await Message.updateOne({ _id: messageId, 'reactions.emoji': emoji }, { $addToSet: { 'reactions.$.users': user._id } });
  } else {
    const added = await Message.updateOne(
      { _id: messageId, 'reactions.emoji': { $ne: emoji } },
      { $push: { reactions: { emoji, users: [user._id] } } }
    );
    if (added.modifiedCount === 0) {
      await Message.updateOne({ _id: messageId, 'reactions.emoji': emoji }, { $addToSet: { 'reactions.$.users': user._id } });
    }
  }
  const fresh = await Message.findById(messageId).lean();
  const [dto] = await toDtos(group._id, [fresh]);
  realtime.toGroup(group._id, 'chat:reaction', { messageId: dto.id, reactions: dto.reactions });
  return dto;
}

async function markRead(group, user) {
  const now = new Date();
  await Group.updateOne({ _id: group._id }, { $set: { 'members.$[me].lastReadAt': now } }, { arrayFilters: [{ 'me.user': user._id }] });
  return { lastReadAt: now };
}

async function unreadCount(groupId, userId, since) {
  return Message.countDocuments({ group: groupId, createdAt: { $gt: since }, author: { $ne: userId } });
}

module.exports = { list, post, postSystem, toggleReaction, markRead, unreadCount };
