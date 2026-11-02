import { motion, useReducedMotion } from 'motion/react';
import Icon from '../Icon';
import { Card, CardHeader } from '../ui';
import { formatDay } from '../../utils/format';

/** Traguardi del giocatore: sbloccati con la data, gli altri con l'avanzamento reale. */
export default function Achievements({ data }) {
  const reduce = useReducedMotion();
  if (!data) return null;
  return (
    <Card aria-labelledby="ach-title">
      <CardHeader id="ach-title" eyebrow="Traguardi" title={`${data.unlockedCount} su ${data.total} sbloccati`} icon="medal" />
      <ul className="achievements">
        {data.achievements.map((a, i) => (
          <motion.li
            key={a.key}
            className={`achievement ${a.unlocked ? 'is-unlocked' : ''}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : Math.min(i, 8) * 0.03, duration: 0.2 }}
          >
            <span className="achievement-icon" aria-hidden="true">
              <Icon name={a.unlocked ? a.icon : 'lock'} />
            </span>
            <span className="grow">
              <span className="player-name">{a.label}</span>
              <span className="player-sub">{a.description}</span>
              {a.unlocked ? (
                <span className="player-sub">Sbloccato il {formatDay(a.unlockedAt).toLowerCase()}</span>
              ) : (
                <>
                  <span className="progress" aria-hidden="true">
                    <span style={{ width: `${Math.round((a.progress.current / a.progress.target) * 100)}%` }} />
                  </span>
                  <span className="player-sub tabular">
                    {a.key === 'fedelta' ? `${a.daysInGroup} giorni su ${a.daysTarget}, ${a.progress.current} presenze su ${a.progress.target}` : `${a.progress.current} su ${a.progress.target}`}
                  </span>
                </>
              )}
            </span>
            <span className="visually-hidden">{a.unlocked ? 'Sbloccato' : 'Da sbloccare'}</span>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}
