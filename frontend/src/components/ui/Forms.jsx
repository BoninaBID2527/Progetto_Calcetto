import { useId } from 'react';
import Icon from '../Icon';

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

/** Scelta singola a pillole (radiogroup con frecce da tastiera). */
export function SegmentedControl({ options, value, onChange, label }) {
  const onKey = (e, index) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    onChange(next.value);
    e.currentTarget.parentElement.children[(index + delta + options.length) % options.length]?.focus();
  };
  const selected = options.findIndex((o) => o.value === value);
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value || (selected === -1 && i === 0) ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Segmented = SegmentedControl;
