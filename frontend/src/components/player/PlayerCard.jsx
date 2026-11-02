import { motion, useReducedMotion } from 'motion/react';
import { initials } from '../../utils/format';

export const ROLE_SHORT = { portiere: 'POR', difensore: 'DIF', centrocampista: 'CEN', attaccante: 'ATT' };
export const ATTR_LABEL = { vel: 'VEL', tir: 'TIR', pas: 'PAS', dri: 'DRI', dif: 'DIF', fis: 'FIS' };
export const ATTR_NAME = { vel: 'velocità', tir: 'tiro', pas: 'passaggio', dri: 'dribbling', dif: 'difesa', fis: 'fisico' };

const pct = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const one = (v) => (v === null || v === undefined ? '—' : String(v).replace('.', ','));

/** Descrizione testuale completa della carta, per lettori di schermo. */
export function cardSummary(card) {
  const attrs = Object.entries(card.attributes)
    .map(([k, a]) => `${ATTR_NAME[k]} ${a ? a.value : 'non disponibile'}`)
    .join(', ');
  return `BONCARD ${card.edition.label} di ${card.user.name}${card.user.nickname ? `, detto ${card.user.nickname}` : ''}. Overall ${card.overall.value}${card.overall.provisional ? ' (provvisorio)' : ''}. ${attrs}. ${card.stats.played} presenze, ${card.stats.goals} gol, ${card.stats.mvp} MVP.`;
}

/**
 * BONCARD: la carta del giocatore. Disegno originale (angoli smussati e
 * fascia diagonale), colori secondo l'edizione speciale sbloccata.
 */
export default function PlayerCard({ card, reveal = true, size = 'lg' }) {
  const reduce = useReducedMotion();
  const { user, overall, attributes, stats, edition } = card;
  return (
    <motion.div
      className={`boncard boncard-${edition.key} boncard-${size}`}
      role="img"
      aria-label={cardSummary(card)}
      initial={reveal && !reduce ? { opacity: 0, rotateY: -70, scale: 0.92 } : false}
      animate={{ opacity: 1, rotateY: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
      style={{ transformPerspective: 900 }}
    >
      <span className="boncard-stripe" aria-hidden="true" />
      <div className="boncard-top" aria-hidden="true">
        <span className="boncard-ovr">
          <b>{overall.value}</b>
          <span>{ROLE_SHORT[user.preferredRole] || '—'}</span>
          {overall.provisional && <i>prov.</i>}
        </span>
        <span className="boncard-edition">{edition.label}</span>
      </div>
      <div className="boncard-photo" aria-hidden="true" style={{ '--avatar-bg': user.avatarColor }}>
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{initials(user.name)}</span>}
      </div>
      <div className="boncard-name" aria-hidden="true">
        <strong>{user.name}</strong>
        {user.nickname && <span>«{user.nickname}»</span>}
      </div>
      <dl className="boncard-attrs" aria-hidden="true">
        {Object.entries(ATTR_LABEL).map(([k, label]) => (
          <div key={k} className={attributes[k]?.provisional ? 'is-provisional' : ''}>
            <dt>{label}</dt>
            <dd>{attributes[k] ? attributes[k].value : '—'}</dd>
          </div>
        ))}
      </dl>
      <dl className="boncard-stats" aria-hidden="true">
        <div>
          <dt>PRE</dt>
          <dd>{stats.played}</dd>
        </div>
        <div>
          <dt>GOL</dt>
          <dd>{stats.goals}</dd>
        </div>
        <div>
          <dt>VIT</dt>
          <dd>{pct(stats.winRate)}</dd>
        </div>
        <div>
          <dt>MVP</dt>
          <dd>{stats.mvp}</dd>
        </div>
        <div>
          <dt>MED</dt>
          <dd>{one(stats.avgRating)}</dd>
        </div>
      </dl>
      <div className="boncard-foot" aria-hidden="true">
        {card.context} · {card.season.label}
      </div>
    </motion.div>
  );
}
