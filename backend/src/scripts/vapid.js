'use strict';

// Genera una coppia di chiavi VAPID da copiare nel file .env (npm run vapid).
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log('Copia queste righe in backend/.env (la chiave privata non va mai condivisa):\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:tuo-indirizzo@example.com');
