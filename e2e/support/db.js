'use strict';

/*
 * Database dei test end-to-end. Con E2E_MONGODB_URI usa quel MongoDB (il
 * nome del database deve contenere "test"); altrimenti avvia l'emulatore
 * mongo-lite in memoria, così ogni esecuzione parte da zero.
 */
const { startMongoLite } = require('../../backend/dev/mongo-lite/server');

const PORT = Number(process.env.E2E_DB_PORT || 27117);

if (process.env.E2E_MONGODB_URI) {
  console.log(`[e2e] uso il MongoDB indicato: ${process.env.E2E_MONGODB_URI}`);
  // Resta in ascolto su una porta solo per segnalare a Playwright che è pronto.
  require('http').createServer((req, res) => res.end('ok')).listen(PORT);
} else {
  startMongoLite({ port: PORT }).then(() => console.log(`[e2e] mongo-lite in memoria sulla porta ${PORT}`));
}
