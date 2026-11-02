'use strict';

/*
 * I test usano sempre un database di prova separato. Se MongoDB risponde
 * (MONGODB_URI_TEST, di default mongodb://127.0.0.1:27017/bonmatch_test) si
 * usa quello; altrimenti si avvia l'emulatore mongo-lite in memoria e lo si
 * dichiara chiaramente.
 */
const { MongoClient } = require('mongoose').mongo;
const { startMongoLite } = require('../../dev/mongo-lite/server');

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/bonmatch_test';

async function reachable(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1500 });
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    const info = await client.db().admin().command({ buildInfo: 1 });
    return !String(info.version).includes('mongo-lite');
  } catch {
    return false;
  } finally {
    await client.close().catch(() => {});
  }
}

module.exports = async () => {
  const uri = process.env.MONGODB_URI_TEST || DEFAULT_URI;
  if (!/test/i.test(new URL(uri).pathname)) {
    throw new Error(`MONGODB_URI_TEST deve puntare a un database di prova (il nome deve contenere "test"): ${uri}`);
  }
  if (process.env.USE_MONGO_LITE !== '1' && (await reachable(uri))) {
    process.env.MONGODB_URI_TEST = uri;
    console.log(`\n[test] Database di prova MongoDB: ${uri}`);
    return;
  }
  const lite = await startMongoLite({ port: 0 });
  globalThis.__MONGO_LITE__ = lite;
  process.env.MONGODB_URI_TEST = `mongodb://127.0.0.1:${lite.port}/bonmatch_test`;
  console.log(`\n[test] MongoDB non raggiungibile: uso l'emulatore mongo-lite in memoria (porta ${lite.port}).`);
};
