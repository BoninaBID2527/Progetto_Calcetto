'use strict';

const { Server } = require('socket.io');
const config = require('../config/env');
const { Group } = require('../models');
const authService = require('../services/authService');
const realtime = require('../services/realtime');

/**
 * Socket.IO serve solo a trasmettere: le azioni passano sempre dalle API
 * REST. Alla connessione il token viene verificato come per le API e il
 * socket entra nella stanza personale e in quelle dei suoi gruppi.
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const { user, payload } = await authService.authenticate(token);
      socket.data.userId = String(user._id);
      socket.data.jti = payload.jti;
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId } = socket.data;
    socket.join(realtime.userRoom(userId));
    const groups = await Group.find({ 'members.user': userId }).select('_id').lean();
    for (const g of groups) socket.join(realtime.groupRoom(String(g._id)));
    socket.emit('session:ready', { groups: groups.map((g) => String(g._id)), serverTime: new Date().toISOString() });
  });

  realtime.setIo(io);
  return io;
}

module.exports = { initSocket };
