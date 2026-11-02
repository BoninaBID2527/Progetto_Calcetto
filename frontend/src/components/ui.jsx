import { useEffect, useId, useRef } from 'react';
import Icon from './Icon';

export function FormField({ label, error, hint, children, id: givenId }) {
  const autoId = useId();
  const id = givenId || autoId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {typeof children === 'function' ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }) : children}
      {hint && !error && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={errorId}>
          <Icon name="alert" />
          {error}
        </span>
      )}
    </div>
  );
}

export function FormAlert({ children }) {
  if (!children) return null;
  return (
    <div className="form-alert" role="alert">
      <Icon name="alert" />
      <span>{children}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, labelledBy }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    node?.querySelector('input, select, textarea, button:not([data-close])')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && node) {
        const focusable = [...node.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId} ref={ref}>
        <div className="modal-head">
          <h2 id={titleId} style={{ fontSize: '1.5rem' }}>
            {title}
          </h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Chiudi" data-close>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ height = 20, width = '100%', radius }) {
  return <span className="skeleton" style={{ display: 'block', height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function CardSkeleton({ lines = 3 }) {
  return (
    <div className="card" aria-busy="true" aria-label="Caricamento">
      <div className="stack">
        <Skeleton height={28} width="60%" />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} height={16} width={`${90 - i * 15}%`} />
        ))}
      </div>
    </div>
  );
}

/** Pallone che rotola verso una porta vuota: illustrazione degli stati vuoti. */
export function EmptyArt() {
  return (
    <svg className="empty-art" viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <path d="M20 88h120" stroke="var(--c-border-strong)" strokeWidth="3" strokeLinecap="round" />
      <path d="M84 88V30h56v58" fill="none" stroke="var(--c-text-2)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M90 36l44 46M90 50l30 32M104 36l30 30M118 36l16 16M90 64l16 18M134 36l-44 46M134 50l-30 32M120 36l-30 30" stroke="var(--c-border-strong)" strokeWidth="1.5" />
      <circle cx="44" cy="74" r="14" fill="var(--c-surface)" stroke="var(--c-primary)" strokeWidth="4" />
      <path d="M44 67l6 4.5-2.3 7h-7.4l-2.3-7z" fill="var(--c-primary)" />
      <path d="M12 70h10M8 78h10" stroke="var(--c-primary)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <EmptyArt />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <strong>Fuorigioco!</strong>
      <p>{error?.message || 'Non sono riuscito a caricare i dati.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          <Icon name="refresh" /> Riprova
        </button>
      )}
    </div>
  );
}

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

export function StatusPill({ status }) {
  return <span className={`status status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
