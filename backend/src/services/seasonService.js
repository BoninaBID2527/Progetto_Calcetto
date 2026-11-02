'use strict';

/*
 * Stagioni del gruppo. Una stagione è solo una finestra temporale sulle
 * partite: nessuna statistica viene mai cancellata o spostata.
 * Modalità: annuale (default, dal mese di inizio), trimestrale, mensile,
 * personalizzata (stagioni definite dall'admin, vedi M9).
 */
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function settingsOf(group) {
  return { mode: group?.settings?.season?.mode || 'annuale', startMonth: group?.settings?.season?.startMonth || 9 };
}

/** Stagione che contiene `date` (mesi 1-12 per startMonth). */
function seasonAt(group, date = new Date(), customSeasons = []) {
  const { mode, startMonth } = settingsOf(group);
  const d = new Date(date);
  if (mode === 'personalizzata') {
    const s = customSeasons.find((c) => d >= new Date(c.startsAt) && d < new Date(c.endsAt));
    return s ? { key: String(s._id), label: s.name, start: new Date(s.startsAt), end: new Date(s.endsAt) } : null;
  }
  if (mode === 'mensile') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    return { key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`, start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
  }
  if (mode === 'trimestrale') {
    const q = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), q * 3, 1);
    return { key: `${start.getFullYear()}-T${q + 1}`, label: `${q + 1}° trimestre ${start.getFullYear()}`, start, end: new Date(start.getFullYear(), q * 3 + 3, 1) };
  }
  const m = startMonth - 1;
  const year = d.getMonth() >= m ? d.getFullYear() : d.getFullYear() - 1;
  const start = new Date(year, m, 1);
  const label = m === 0 ? `Stagione ${year}` : `Stagione ${year}/${String((year + 1) % 100).padStart(2, '0')}`;
  return { key: m === 0 ? `${year}` : `${year}-${String((year + 1) % 100).padStart(2, '0')}`, label, start, end: new Date(year + 1, m, 1) };
}

function previousSeason(group, date = new Date(), customSeasons = []) {
  const current = seasonAt(group, date, customSeasons);
  if (!current) return null;
  return seasonAt(group, new Date(current.start.getTime() - 86_400_000), customSeasons);
}

module.exports = { seasonAt, previousSeason, settingsOf };
