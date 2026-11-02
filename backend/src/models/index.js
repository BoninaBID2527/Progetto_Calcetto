'use strict';

const { MvpVote, Rating, PrizeVote } = require('./Vote');

module.exports = {
  User: require('./User'),
  RevokedToken: require('./RevokedToken'),
  Group: require('./Group'),
  Nickname: require('./Nickname'),
  Match: require('./Match'),
  Message: require('./Message'),
  Notification: require('./Notification'),
  MvpVote,
  Rating,
  PrizeVote,
};
