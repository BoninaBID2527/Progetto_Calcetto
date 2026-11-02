'use strict';

const { MvpVote, Rating, PrizeVote, AwardVote } = require('./Vote');

module.exports = {
  User: require('./User'),
  RevokedToken: require('./RevokedToken'),
  Group: require('./Group'),
  Nickname: require('./Nickname'),
  Match: require('./Match'),
  Message: require('./Message'),
  Notification: require('./Notification'),
  Activity: require('./Activity'),
  Poll: require('./Poll'),
  PushSubscription: require('./PushSubscription'),
  Rivalry: require('./Rivalry'),
  Season: require('./Season'),
  Achievement: require('./Achievement'),
  MatchSeries: require('./MatchSeries'),
  Availability: require('./Availability'),
  MvpVote,
  Rating,
  PrizeVote,
  AwardVote,
};
