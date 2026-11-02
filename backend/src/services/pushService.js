'use strict';

/*
 * Invio delle notifiche Web Push. In questa fase (M4) fa solo da punto di
 * aggancio: senza configurazione VAPID non invia nulla e lo dichiara nello
 * stato della notifica. L'implementazione completa arriva con la M5.
 */
const { Notification } = require('../models');

async function deliver(docs) {
  await Notification.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { $set: { pushStatus: 'saltata' } });
}

module.exports = { deliver };
