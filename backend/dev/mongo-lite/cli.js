#!/usr/bin/env node
'use strict';

// Avvia mongo-lite da riga di comando: node dev/mongo-lite/cli.js [--port 27017]
const { startMongoLite } = require('./server');

const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 27017;

startMongoLite({ port })
  .then(({ host, port: actual }) => {
    console.log(`mongo-lite in ascolto su mongodb://${host}:${actual} (dati solo in memoria, solo per sviluppo)`);
  })
  .catch((err) => {
    console.error(`mongo-lite non si è avviato: ${err.message}`);
    process.exit(1);
  });
