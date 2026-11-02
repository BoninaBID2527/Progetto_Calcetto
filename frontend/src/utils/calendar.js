// Date "AAAA-MM-GG" trattate come calendario puro (nessun fuso): lo stesso criterio del backend.
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const WEEKDAYS_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
export const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

const utc = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const addDays = (ymd, n) => {
  const d = utc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Giorno ISO: 1 = lunedì … 7 = domenica. */
export const isoWeekday = (ymd) => utc(ymd).getUTCDay() || 7;

export const startOfWeek = (ymd) => addDays(ymd, 1 - isoWeekday(ymd));
export const startOfMonth = (ymd) => `${ymd.slice(0, 7)}-01`;

export function addMonths(ymd, n) {
  const d = utc(startOfMonth(ymd));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Oggi nel fuso indicato. */
export const todayIn = (tz = 'Europe/Rome') => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Le 6 settimane (42 giorni) che coprono il mese di `ymd`, a partire dal lunedì. */
export function monthGrid(ymd) {
  const first = startOfWeek(startOfMonth(ymd));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export const weekDays = (ymd) => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(ymd), i));

export const dayLabel = (ymd) => {
  const d = utc(ymd);
  return `${WEEKDAYS[isoWeekday(ymd) - 1]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

export const timeIn = (iso, tz = 'Europe/Rome') => new Intl.DateTimeFormat('it-IT', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
