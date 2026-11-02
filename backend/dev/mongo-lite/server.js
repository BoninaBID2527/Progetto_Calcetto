'use strict';

/*
 * Server TCP di mongo-lite: implementa i messaggi OP_MSG e OP_QUERY del
 * protocollo MongoDB quanto basta per il driver ufficiale usato da Mongoose.
 */

const net = require('net');
const BSON = require('bson');
const { Engine } = require('./engine');

const OP_REPLY = 1;
const OP_QUERY = 2004;
const OP_MSG = 2013;

let requestCounter = 1;

function parseOpMsg(frame) {
  const flagBits = frame.readUInt32LE(16);
  const end = frame.length - (flagBits & 1 ? 4 : 0);
  let offset = 20;
  let body = null;
  const sequences = {};
  while (offset < end) {
    const kind = frame[offset];
    offset += 1;
    const size = frame.readInt32LE(offset);
    if (kind === 0) {
      body = BSON.deserialize(frame.subarray(offset, offset + size));
      offset += size;
    } else if (kind === 1) {
      const sectionEnd = offset + size;
      let p = offset + 4;
      const idEnd = frame.indexOf(0, p);
      const identifier = frame.toString('utf8', p, idEnd);
      p = idEnd + 1;
      const docs = [];
      while (p < sectionEnd) {
        const docSize = frame.readInt32LE(p);
        docs.push(BSON.deserialize(frame.subarray(p, p + docSize)));
        p += docSize;
      }
      sequences[identifier] = docs;
      offset = sectionEnd;
    } else {
      throw new Error(`Sezione OP_MSG sconosciuta: ${kind}`);
    }
  }
  return { flagBits, body: Object.assign(body || {}, sequences) };
}

function parseOpQuery(frame) {
  let p = 20;
  const nameEnd = frame.indexOf(0, p);
  const fullName = frame.toString('utf8', p, nameEnd);
  p = nameEnd + 1 + 8; // numberToSkip + numberToReturn
  const size = frame.readInt32LE(p);
  let query = BSON.deserialize(frame.subarray(p, p + size));
  if (query.$query) query = query.$query;
  return { dbName: fullName.split('.')[0], query };
}

function header(length, responseTo, opCode) {
  const buf = Buffer.alloc(16);
  buf.writeInt32LE(length, 0);
  buf.writeInt32LE(requestCounter++, 4);
  buf.writeInt32LE(responseTo, 8);
  buf.writeInt32LE(opCode, 12);
  return buf;
}

function opMsgReply(responseTo, doc) {
  const payload = BSON.serialize(doc, { ignoreUndefined: true });
  const prefix = Buffer.alloc(5); // flagBits (4) + kind 0 (1)
  return Buffer.concat([header(16 + 5 + payload.length, responseTo, OP_MSG), prefix, payload]);
}

function opReply(responseTo, doc) {
  const payload = BSON.serialize(doc, { ignoreUndefined: true });
  const meta = Buffer.alloc(20);
  meta.writeInt32LE(0, 0); // responseFlags
  meta.writeBigInt64LE(0n, 4); // cursorID
  meta.writeInt32LE(0, 12); // startingFrom
  meta.writeInt32LE(1, 16); // numberReturned
  return Buffer.concat([header(16 + 20 + payload.length, responseTo, OP_REPLY), meta, payload]);
}

/**
 * Avvia il server. Restituisce { port, engine, close }.
 * Con port = 0 il sistema operativo sceglie una porta libera.
 */
function startMongoLite({ port = 27017, host = '127.0.0.1', engine = new Engine() } = {}) {
  let connectionCounter = 0;
  const sockets = new Set();

  const server = net.createServer((socket) => {
    const ctx = { connectionId: ++connectionCounter };
    sockets.add(socket);
    let pending = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4) {
        const length = pending.readInt32LE(0);
        if (pending.length < length) break;
        const frame = pending.subarray(0, length);
        pending = pending.subarray(length);
        const requestId = frame.readInt32LE(4);
        const opCode = frame.readInt32LE(12);
        try {
          if (opCode === OP_MSG) {
            const { flagBits, body } = parseOpMsg(frame);
            const reply = engine.command(body.$db || 'admin', body, ctx);
            if (!(flagBits & 2)) socket.write(opMsgReply(requestId, reply));
          } else if (opCode === OP_QUERY) {
            const { dbName, query } = parseOpQuery(frame);
            socket.write(opReply(requestId, engine.command(dbName, query, ctx)));
          } else {
            socket.write(opMsgReply(requestId, { ok: 0, errmsg: `opCode ${opCode} non supportato`, code: 2 }));
          }
        } catch (err) {
          socket.write(opMsgReply(requestId, { ok: 0, errmsg: err.message, code: 1 }));
        }
      }
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        port: server.address().port,
        host,
        engine,
        close: () =>
          new Promise((done) => {
            for (const s of sockets) s.destroy();
            engine.close();
            server.close(() => done());
          }),
      });
    });
  });
}

module.exports = { startMongoLite };
