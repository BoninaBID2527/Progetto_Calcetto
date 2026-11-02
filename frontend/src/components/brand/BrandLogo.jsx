import { Link } from 'react-router-dom';
import { APP_NAME } from '../../config';

/*
 * Logo PROVVISORIO di BONMATCH. Il marchio definitivo verrà fornito più
 * avanti: per sostituirlo basta cambiare <BrandMark> in questo file (e i
 * file in public/brand); tutta l'app usa solo questo componente.
 */

const TONES = {
  auto: { badge: 'var(--c-primary)', ink: 'var(--c-ink)', word: 'var(--c-text)', accent: 'var(--c-primary-text)' },
  onDark: { badge: '#C7FF36', ink: '#090D0C', word: '#F4F8F2', accent: '#C7FF36' },
  onLight: { badge: '#C7FF36', ink: '#090D0C', word: '#0C1410', accent: '#4A6B00' },
  mono: { badge: 'currentColor', ink: 'var(--c-bg)', word: 'currentColor', accent: 'currentColor' },
};

export function BrandMark({ tone = 'auto', className }) {
  const c = TONES[tone] || TONES.auto;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="60" height="60" rx="17" fill={c.badge} />
      <path d="M2 44 L44 2 H52 L2 52 Z" fill={c.ink} opacity="0.12" />
      <circle cx="32" cy="32" r="16" fill="none" stroke={c.ink} strokeWidth="4.5" />
      <path d="M32 25l6.7 4.9-2.6 7.9h-8.2l-2.6-7.9z" fill={c.ink} />
    </svg>
  );
}

export function BrandWordmark({ tone = 'auto' }) {
  const c = TONES[tone] || TONES.auto;
  return (
    <span className="logo-word" style={{ color: c.word }}>
      {APP_NAME.slice(0, 3)}
      <b style={{ color: c.accent }}>{APP_NAME.slice(3)}</b>
    </span>
  );
}

/**
 * @param {"full"|"compact"} variant  completa (simbolo + nome) o compatta (solo simbolo)
 * @param {"auto"|"onDark"|"onLight"|"mono"} tone  segue il tema, oppure fissa per sfondi scuri/chiari, o monocromatica
 */
export default function BrandLogo({ variant = 'full', tone = 'auto', to, className = '' }) {
  const content = (
    <>
      <BrandMark tone={tone} />
      {variant === 'full' && <BrandWordmark tone={tone} />}
    </>
  );
  if (!to) {
    return (
      <span className={`logo ${className}`} role="img" aria-label={APP_NAME}>
        {content}
      </span>
    );
  }
  return (
    <Link to={to} className={`logo ${className}`} aria-label={`${APP_NAME}, pagina principale`}>
      {content}
    </Link>
  );
}
