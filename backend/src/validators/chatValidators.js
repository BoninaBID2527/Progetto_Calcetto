'use strict';

const { z, int, objectId } = require('./common');

const listMessages = z.object({ before: objectId.optional(), after: objectId.optional(), limit: int(1, 100).default(30) });
const postMessage = z.object({ text: z.string().trim().min(1).max(1000) }).strict();
const reaction = z.object({ emoji: z.string().min(1).max(8) }).strict();
const listNotifications = z.object({ unread: z.enum(['true', 'false']).default('false'), limit: int(1, 100).default(30) });

module.exports = { listMessages, postMessage, reaction, listNotifications };
