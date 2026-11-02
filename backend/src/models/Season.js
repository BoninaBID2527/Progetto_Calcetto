'use strict';

const { Schema, model } = require('mongoose');

// Stagioni definite dall'admin (modalità "personalizzata"). Sono solo finestre di date.
const seasonSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  { timestamps: true }
);

seasonSchema.index({ group: 1, startsAt: 1 });

module.exports = model('Season', seasonSchema);
