'use strict';

/*
 * Orari locali e fusi orari senza librerie esterne. Un orario "21:00 di
 * giovedì" va sempre convertito nel fuso del gruppo (di norma Europe/Rome),
 * perché a cavallo dell'ora legale lo stesso orario locale corrisponde a
 * istanti UTC diversi.
 */
const DEFAULT_ZONE = 'Europe/Rome';

function isValidZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Scarto in minuti di `tz` rispetto a UTC nell'istante `date` (es. +120 con l'ora legale italiana). */
function offsetMinutes(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** Data locale "YYYY-MM-DD" di un istante nel fuso indicato. */
function ymdIn(date, tz = DEFAULT_ZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Istante UTC di "YYYY-MM-DD" alle "HH:MM" locali del fuso. */
function zonedToUtc(ymd, time, tz = DEFAULT_ZONE) {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - offsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

/** Somma `days` giorni a una data "YYYY-MM-DD" (calendario puro, senza fusi). */
function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Giorno della settimana ISO di "YYYY-MM-DD": 1 = lunedì … 7 = domenica. */
function isoWeekday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

const isYmd = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

module.exports = { DEFAULT_ZONE, isValidZone, offsetMinutes, ymdIn, zonedToUtc, addDays, isoWeekday, isYmd };
