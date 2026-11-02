'use strict';

const { Schema, model } = require('mongoose');

// Un dispositivo/browser che ha accettato le notifiche push.
const pushSubscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    lastSuccessAt: { type: Date, default: null },
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ user: 1 });

module.exports = model('PushSubscription', pushSubscriptionSchema);
