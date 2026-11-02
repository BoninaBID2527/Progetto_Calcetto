'use strict';

const { Schema, model } = require('mongoose');

// Disponibilità dichiarata da un membro per un giorno (indipendente dalle singole partite).
const availabilitySchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD" nel fuso del gruppo
    status: { type: String, enum: ['disponibile', 'forse', 'non_disponibile'], required: true },
  },
  { timestamps: true }
);
availabilitySchema.index({ group: 1, user: 1, date: 1 }, { unique: true });
availabilitySchema.index({ group: 1, date: 1 });

module.exports = model('Availability', availabilitySchema);
