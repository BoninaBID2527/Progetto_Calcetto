export function SlotsBar({ taken, slots, waiting = 0 }) {
  const full = taken >= slots;
  return (
    <div className="slots">
      <div className="slots-head">
        <span className="slots-count" aria-label={`${taken} presenti su ${slots} posti`}>
          {taken}
          <small>/{slots}</small>
        </span>
        <span className={`chip ${full ? 'chip-orange' : 'chip-primary'}`}>
          {full ? (waiting ? `Completa · ${waiting} in attesa` : 'Completa') : `${slots - taken} ${slots - taken === 1 ? 'posto libero' : 'posti liberi'}`}
        </span>
      </div>
      <div className={`slots-bar ${full ? 'is-full' : ''}`} aria-hidden="true">
        <span style={{ width: `${Math.min(100, (taken / slots) * 100)}%` }} />
      </div>
    </div>
  );
}

const STATUS_LABELS = { aperta: 'Iscrizioni aperte', chiusa: 'Iscrizioni chiuse', giocata: 'Giocata', archiviata: 'Archiviata', annullata: 'Annullata' };

export function StatusPill({ status, label }) {
  return <span className={`status status-${status}`}>{label || STATUS_LABELS[status] || status}</span>;
}
