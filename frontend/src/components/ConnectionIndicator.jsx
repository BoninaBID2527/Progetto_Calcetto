import { useRealtime } from '../context/RealtimeContext';

const LABELS = { online: 'In diretta', connecting: 'Riconnessione…', offline: 'Non in linea' };

export default function ConnectionIndicator() {
  const { status } = useRealtime();
  return (
    <span className={`conn conn-${status}`} role="status" aria-live="polite" title="Stato della connessione in tempo reale">
      <span className="conn-dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}

/** Striscia in alto quando la connessione in tempo reale è assente. */
export function ConnectionBanner() {
  const { status } = useRealtime();
  if (status === 'online') return null;
  return (
    <div className={`conn-banner ${status === 'offline' ? 'is-offline' : ''}`} role="status">
      {status === 'connecting'
        ? 'Connessione persa: mi riconnetto e recupero ciò che ti sei perso…'
        : 'Aggiornamenti dal vivo non disponibili. Ricarica la pagina per riprovare.'}
    </div>
  );
}
