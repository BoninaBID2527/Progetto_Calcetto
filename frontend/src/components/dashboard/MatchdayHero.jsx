import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../Icon';
import { FieldSymbol } from '../FieldBadge';
import { AvatarStack } from '../Avatar';
import { Countdown, StatusPill } from '../ui';
import { myParticipation } from '../MatchCard';
import { getField } from '../../config';
import { formatDay, formatTime, formatEuro } from '../../utils/format';

/** La card protagonista della home: la prossima partita in stile locandina. */
export default function MatchdayHero({ match, userId, onRespond, busy, createTo }) {
  const reduce = useReducedMotion();
  if (!match) {
    return (
      <section className="matchday-hero is-empty" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="overline">Matchday</span>
          <h1 id="hero-title" className="hero-day">
            Nessuna partita in calendario
          </h1>
          <p className="muted">Il campo è libero. Organizza la prossima e il gruppo riceverà subito la notifica.</p>
          {createTo && (
            <Link to={createTo} className="btn btn-primary btn-lg">
              <Icon name="plus" /> Organizza una partita
            </Link>
          )}
        </div>
      </section>
    );
  }
  const field = getField(match.field);
  const confirmed = match.participants.filter((p) => p.response === 'ci_sono').map((p) => p.user);
  const mine = myParticipation(match, userId);
  const missing = Math.max(0, match.slots - match.counts.ci_sono);
  const pct = Math.min(100, (match.counts.ci_sono / match.slots) * 100);

  return (
    <motion.section
      className="matchday-hero"
      style={{ '--field-color': field.color }}
      aria-labelledby="hero-title"
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <span className="hero-watermark" aria-hidden="true">
        <FieldSymbol symbol={field.symbol} />
      </span>
      <div className="hero-copy">
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <span className="overline">Matchday · prossima partita</span>
          <StatusPill status={match.status} />
        </div>
        <h1 id="hero-title" className="hero-day">
          {formatDay(match.startsAt, { short: false })}
          <span className="hero-time">{formatTime(match.startsAt)}</span>
        </h1>
        <p className="hero-field">
          <Icon name="pin" /> {field.name} <span className="muted">· {field.town}</span>
          {match.quotaCents && <span className="muted"> · {formatEuro(match.quotaCents)} a testa</span>}
        </p>
        <div className="hero-actions">
          {match.status === 'aperta' && mine.response !== 'ci_sono' && mine.response !== 'attesa' && (
            <button type="button" className="btn btn-in" onClick={() => onRespond(match, 'ci_sono')} disabled={busy}>
              <Icon name="check" /> Ci sono
            </button>
          )}
          {mine.response === 'ci_sono' && (
            <span className="chip chip-primary hero-chip">
              <Icon name="check" /> Sei convocato
            </span>
          )}
          {mine.response === 'attesa' && <span className="chip chip-orange hero-chip">In lista d'attesa · {mine.queuePosition}°</span>}
          <Link to={`/partite/${match.id}`} className="btn btn-lg">
            Dettagli <Icon name="chevron-right" />
          </Link>
        </div>
      </div>
      <div className="hero-side">
        <Countdown to={match.startsAt} />
        <div className="hero-slots">
          <div className="spread">
            <span className="slots-count" aria-label={`${match.counts.ci_sono} confermati su ${match.slots} posti`}>
              {match.counts.ci_sono}
              <small>/{match.slots}</small>
            </span>
            <span className={`chip ${missing ? 'chip-primary' : 'chip-orange'}`}>
              {missing ? `Mancano ${missing}` : match.counts.attesa ? `Completa · ${match.counts.attesa} in attesa` : 'Completa'}
            </span>
          </div>
          <div className={`slots-bar ${missing ? '' : 'is-full'}`} aria-hidden="true">
            <motion.span initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, delay: 0.15 }} />
          </div>
          {confirmed.length > 0 && <AvatarStack users={confirmed} max={8} label={`Confermati: ${confirmed.map((u) => u.name).join(', ')}`} />}
        </div>
      </div>
    </motion.section>
  );
}
