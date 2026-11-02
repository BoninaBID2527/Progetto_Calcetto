import { cloneElement, useId } from 'react';
import Icon from '../Icon';

export function Badge({ tone = 'default', icon, children }) {
  return (
    <span className={`chip ${tone !== 'default' ? `chip-${tone}` : ''}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

/** Barra di avanzamento accessibile (role="progressbar"). */
export function ProgressBar({ value, max = 100, label, tone = 'primary', showValue = false }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress-wrap">
      <div className={`progress progress-${tone}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {showValue && (
        <span className="tabular muted" style={{ fontSize: 'var(--fs-sm)' }}>
          {Math.round(value)}/{max}
        </span>
      )}
    </div>
  );
}

/** Suggerimento al passaggio o al focus; il testo è collegato con aria-describedby. */
export function Tooltip({ text, children }) {
  const id = useId();
  return (
    <span className="tooltip-wrap">
      {cloneElement(children, { 'aria-describedby': id })}
      <span role="tooltip" id={id} className="tooltip">
        {text}
      </span>
    </span>
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

export function EmptyState({ title, children, action, compact = false }) {
  return (
    <div className={`empty ${compact ? 'is-compact' : ''}`}>
      {!compact && <EmptyArt />}
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
