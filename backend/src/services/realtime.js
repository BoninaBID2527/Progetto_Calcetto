'use strict';

/*
 * Ponte tra i servizi e Socket.IO. I servizi salvano prima i dati e poi
 * chiamano queste funzioni: il server resta la fonte di verità e i client
 * ricevono solo ciò che è già stato salvato. Senza Socket.IO (nei test delle
 * sole API) le funzioni non fanno nulla.
 */

let io = null;

const setIo = (instance) => {
  io = instance;
};
const getIo = () => io;

const groupRoom = (groupId) => `group:${groupId}`;
const userRoom = (userId) => `user:${userId}`;

function toGroup(groupId, event, payload) {
  if (io) io.to(groupRoom(String(groupId))).emit(event, payload);
}

function toUser(userId, event, payload) {
  if (io) io.to(userRoom(String(userId))).emit(event, payload);
}

function joinGroupRoom(userId, groupId) {
  if (io) io.in(userRoom(String(userId))).socketsJoin(groupRoom(String(groupId)));
}

function leaveGroupRoom(userId, groupId) {
  if (io) io.in(userRoom(String(userId))).socketsLeave(groupRoom(String(groupId)));
}

async function disconnectToken(userId, jti) {
  if (!io) return;
  const sockets = await io.in(userRoom(String(userId))).fetchSockets();
  for (const s of sockets) if (s.data.jti === jti) s.disconnect(true);
}

module.exports = { setIo, getIo, toGroup, toUser, joinGroupRoom, leaveGroupRoom, disconnectToken, groupRoom, userRoom };
