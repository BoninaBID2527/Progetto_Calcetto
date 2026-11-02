'use strict';

// Unica fonte per nome dell'app, campi, premi e default (condivisa con il frontend).
const appConfig = require('../../../shared/app.config.json');

const FIELD_KEYS = appConfig.fields.map((f) => f.key);
const ROLE_KEYS = appConfig.roles.map((r) => r.key);
const FOOT_KEYS = appConfig.feet.map((f) => f.key);
const BASE_PRIZE_KEYS = appConfig.prizeOptions.map((p) => p.key);

const MATCH_STATUSES = ['aperta', 'chiusa', 'giocata', 'archiviata', 'annullata'];
const RESPONSES = ['ci_sono', 'forse', 'non_ci_sono'];
const PLAYED_STATUSES = ['giocata', 'archiviata'];

function getField(key) {
  return appConfig.fields.find((f) => f.key === key) || null;
}

module.exports = {
  appConfig,
  APP_NAME: appConfig.appName,
  FIELD_KEYS,
  ROLE_KEYS,
  FOOT_KEYS,
  BASE_PRIZE_KEYS,
  MATCH_STATUSES,
  RESPONSES,
  PLAYED_STATUSES,
  DEFAULTS: appConfig.defaults,
  REACTIONS: appConfig.reactions,
  getField,
};
