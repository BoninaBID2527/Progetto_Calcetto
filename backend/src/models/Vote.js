'use strict';

const { Schema, model } = require('mongoose');

// Voti anonimi: l'API restituisce solo i totali, mai chi ha votato chi.

const mvpVoteSchema = new Schema(
  {
    match: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    voter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mvp: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
mvpVoteSchema.index({ match: 1, voter: 1 }, { unique: true });

const ratingSchema = new Schema(
  {
    match: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    rater: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ratee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true, min: 1, max: 10 },
  },
  { timestamps: true }
);
ratingSchema.index({ match: 1, rater: 1, ratee: 1 }, { unique: true });
ratingSchema.index({ group: 1, ratee: 1 });

const prizeVoteSchema = new Schema(
  {
    match: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    voter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    option: { type: String, required: true },
  },
  { timestamps: true }
);
prizeVoteSchema.index({ match: 1, voter: 1 }, { unique: true });

module.exports = {
  MvpVote: model('MvpVote', mvpVoteSchema),
  Rating: model('Rating', ratingSchema),
  PrizeVote: model('PrizeVote', prizeVoteSchema),
};
