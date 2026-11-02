'use strict';

/*
 * Migrazioni idempotenti della V2: non cancellano e non sovrascrivono nulla.
 *   npm run migrate
 */
const config = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../db');
const { backfillActivity } = require('./backfill');

async function main() {
  await connectDatabase(config.mongoUri);
  const activities = await backfillActivity();
  console.log(`Migrazione completata su ${config.mongoUri}`);
  console.log(`  voci del feed ricostruite dai dati esistenti: ${activities}`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(`Migrazione non riuscita: ${err.message}`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
