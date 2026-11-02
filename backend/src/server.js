'use strict';

const http = require('http');
const config = require('./config/env');
const { connectDatabase } = require('./db');
const { createApp } = require('./app');
const { initSocket } = require('./socket');
const scheduler = require('./jobs/scheduler');
const { APP_NAME } = require('./config/appConfig');

async function main() {
  await connectDatabase(config.mongoUri);
  const server = http.createServer(createApp());
  initSocket(server);
  if (config.schedulerEnabled) scheduler.start(config.schedulerIntervalMs);
  server.listen(config.port, () => {
    console.log(`${APP_NAME} API in ascolto su http://localhost:${config.port}/api`);
  });

  const shutdown = () => {
    scheduler.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`Avvio non riuscito: ${err.message}`);
  if (/ECONNREFUSED|Server selection/i.test(err.message)) {
    console.error('MongoDB non risponde: hai avviato "docker compose up -d"? Controlla MONGODB_URI nel file .env.');
  }
  process.exit(1);
});
