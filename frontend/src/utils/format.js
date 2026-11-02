import { TIME_ZONE } from '../config';

const fmt = (options) => new Intl.DateTimeFormat('it-IT', { timeZone: TIME_ZONE, ...options });
const dayKey = (d) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatTime(date) {
  return fmt({ hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

/** "Oggi", "Domani", "Ieri" oppure "Giovedì 14 nov". */
export function formatDay(date, { short = true } = {}) {
  const d = new Date(date);
  const now = new Date();
  const k = dayKey(d);
  if (k === dayKey(now)) return 'Oggi';
  if (k === dayKey(new Date(now.getTime() + 86_400_000))) return 'Domani';
  if (k === dayKey(new Date(now.getTime() - 86_400_000))) return 'Ieri';
  return capitalize(fmt({ weekday: 'long', day: 'numeric', month: short ? 'short' : 'long' }).format(d));
}

export function formatDateLong(date) {
  return capitalize(fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date)));
}

export function formatDateTime(date) {
  return `${formatDay(date)} · ${formatTime(date)}`;
}

export function formatEuro(cents) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
}

export function timeAgo(date) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return 'adesso';
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h fa`;
  if (diff < 7 * 86_400) return `${Math.floor(diff / 86_400)} g fa`;
  return fmt({ day: 'numeric', month: 'short' }).format(new Date(date));
}

export const sameDay = (a, b) => dayKey(new Date(a)) === dayKey(new Date(b));

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Nome da mostrare secondo la preferenza: soprannome accanto o al posto del nome. */
export function displayName(user, mode = 'accanto') {
  if (!user) return '';
  if (user.nickname && mode === 'sostituisci') return user.nickname;
  return user.name;
}

/** Converte "YYYY-MM-DD" + "HH:MM" dell'ora locale in ISO. */
export function toIso(date, time) {
  return new Date(`${date}T${time}`).toISOString();
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
