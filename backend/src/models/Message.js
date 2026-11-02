'use strict';

const { Schema, model } = require('mongoose');

const messageSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    kind: { type: String, enum: ['utente', 'sistema'], default: 'utente' },
    text: { type: String, required: true, maxlength: 1000 },
    reactions: [
      new Schema({ emoji: String, users: [{ type: Schema.Types.ObjectId, ref: 'User' }] }, { _id: false }),
    ],
  },
  { timestamps: true }
);

messageSchema.index({ group: 1, _id: -1 });

module.exports = model('Message', messageSchema);
