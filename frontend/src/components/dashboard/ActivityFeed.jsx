import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../Icon';
import { Avatar, PlayerName } from '../Avatar';
import { getField } from '../../config';
import { formatDay, timeAgo } from '../../utils/format';

const ICON = {
  partita_creata: 'calendar',
  iscrizione: 'check-circle',
  promozione: 'swap',
  risultato: 'flag',
  mvp: 'star',
  premio: 'mug',
  membro_entrato: 'users',
  boncall_aperta: 'boncall',
  boncall_completa: 'check-circle',
  boncall_confermata: 'calendar',
  achievement: 'medal',
  record: 'trend',
};

/** Testo della voce, costruito solo dai dati salvati nell'attività. */
function describe(a) {
  const field = a.match?.field ? getField(a.match.field).name : null;
  const when = a.match?.startsAt ? formatDay(a.match.startsAt).toLowerCase() : null;
  switch (a.type) {
    case 'partita_creata':
      return <>{a.actor && <PlayerName user={a.actor} />} ha creato una partita{field && ` a ${field}`}{when && ` per ${when}`}</>;
    case 'iscrizione':
      return <><PlayerName user={a.actor} /> ci sarà{when && ` ${when}`}{field && ` a ${field}`}</>;
    case 'promozione':
      return <><PlayerName user={a.target} /> entra dalla lista d'attesa{when && ` per ${when}`}</>;
    case 'risultato':
      return <>Finale{field && ` a ${field}`}: {a.data.teamA} <b className="tabular">{a.data.scoreA}-{a.data.scoreB}</b> {a.data.teamB}</>;
    case 'mvp':
      return <><PlayerName user={a.target} /> è l'MVP della serata{a.data.winners?.length > 1 && ' (condiviso)'}</>;
    case 'premio':
      return <>Terzo tempo: vince {a.data.labels?.join(' e ')}</>;
    case 'membro_entrato':
      return <><PlayerName user={a.actor} /> è entrato nel gruppo</>;
    default:
      return a.data?.text || 'Novità nel gruppo';
  }
}

export default function ActivityFeed({ items }) {
  const reduce = useReducedMotion();
  if (!items.length) {
    return <p className="muted">Ancora nessuna attività: la prima partita accende il feed.</p>;
  }
  return (
    <ol className="feed">
      {items.map((a, i) => {
        const person = a.actor || a.target;
        const content = (
          <>
            <span className={`feed-icon feed-${a.type}`}>
              <Icon name={ICON[a.type] || 'activity'} />
            </span>
            <span className="feed-body">
              <span className="feed-text">{describe(a)}</span>
              <span className="feed-meta">{timeAgo(a.createdAt)}</span>
            </span>
            {person && <Avatar user={person} size={30} />}
          </>
        );
        return (
          <motion.li key={a.id} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: Math.min(i, 6) * 0.03 }}>
            {a.match?.id ? (
              <Link to={`/partite/${a.match.id}`} className="feed-row">
                {content}
              </Link>
            ) : (
              <div className="feed-row">{content}</div>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}
