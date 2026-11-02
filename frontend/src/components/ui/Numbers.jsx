import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

const defaultFormat = (v) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v);

/** Numero che "sale" fino al valore. Con movimento ridotto compare subito. */
export function CountUp({ value, format = defaultFormat, duration = 700 }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce || typeof value !== 'number') {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduce, duration]);
  const final = typeof value === 'number' ? format(value) : value;
  return (
    <>
      <span aria-hidden="true" className="tabular">
        {typeof shown === 'number' ? format(Number.isInteger(value) ? Math.round(shown) : shown) : shown}
      </span>
      <span className="visually-hidden">{final}</span>
    </>
  );
}

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Conto alla rovescia verso `to`. Si aggiorna ogni secondo solo nell'ultima ora. */
export function Countdown({ to, label = 'Al calcio d\'inizio', compact = false }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(Date.now());
  const left = target - now;
  useEffect(() => {
    const every = left < 3_600_000 ? 1000 : 30_000;
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [left < 3_600_000]); // eslint-disable-line react-hooks/exhaustive-deps
  if (left <= 0) return <span className="countdown is-live">In campo!</span>;
  const p = parts(left);
  const units = p.d > 0 ? [[p.d, 'g'], [p.h, 'h'], [p.m, 'm']] : [[p.h, 'h'], [p.m, 'm'], [p.s, 's']];
  const spoken = p.d > 0 ? `${p.d} giorni, ${p.h} ore e ${p.m} minuti` : `${p.h} ore, ${p.m} minuti`;
  return (
    <span className={`countdown ${compact ? 'is-compact' : ''}`} role="timer" aria-label={`${label}: ${spoken}`}>
      {!compact && <span className="overline">{label}</span>}
      <span className="countdown-units" aria-hidden="true">
        {units.map(([n, u]) => (
          <span key={u} className="countdown-unit">
            <b>{String(n).padStart(2, '0')}</b>
            <i>{u}</i>
          </span>
        ))}
      </span>
    </span>
  );
}
