// Unica fonte per nome dell'app, campi, premi e default: la stessa del backend.
import appConfig from '@shared/app.config.json';

export const APP_NAME = appConfig.appName;
export const TAGLINE = appConfig.tagline;
export const TIME_ZONE = appConfig.timeZone;
export const FIELDS = appConfig.fields;
export const PRIZE_OPTIONS = appConfig.prizeOptions;
export const REACTIONS = appConfig.reactions;
export const ROLES = appConfig.roles;
export const FEET = appConfig.feet;
export const DEFAULTS = appConfig.defaults;

export const getField = (key) => FIELDS.find((f) => f.key === key) || { key, name: key, town: '', color: '#9DB5AB', symbol: 'pallone' };
export const roleLabel = (key) => ROLES.find((r) => r.key === key)?.label || null;
export const footLabel = (key) => FEET.find((f) => f.key === key)?.label || null;
