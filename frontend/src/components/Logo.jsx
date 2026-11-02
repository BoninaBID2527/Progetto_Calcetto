import { Link } from 'react-router-dom';
import { APP_NAME } from '../config';

/** Icona del logo: un pallone stilizzato dentro un badge squadrato. */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="var(--c-primary)" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="var(--c-ink)" strokeWidth="4.5" />
      <path d="M32 24.5l7.1 5.2-2.7 8.3h-8.8l-2.7-8.3z" fill="var(--c-ink)" />
      <path
        d="M32 24.5V15.5M39.1 29.7l8.4-2.9M36.4 38l5.4 7.4M27.6 38l-5.4 7.4M24.9 29.7l-8.4-2.9"
        stroke="var(--c-ink)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Wordmark: le prime tre lettere in chiaro, il resto nel colore primario. */
export function Wordmark() {
  return (
    <span className="logo-word">
      {APP_NAME.slice(0, 3)}
      <b>{APP_NAME.slice(3)}</b>
    </span>
  );
}

export default function Logo({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`logo ${className}`} aria-label={`${APP_NAME}, pagina principale`}>
      <LogoMark />
      <Wordmark />
    </Link>
  );
}
