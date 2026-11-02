import { Link } from 'react-router-dom';
import Icon from '../Icon';
import { Avatar, PlayerName } from '../Avatar';
import { timeAgo } from '../../utils/format';

const NOTIFICATION_ICONS = {
  nuova_partita: 'calendar',
  promozione: 'check-circle',
  partita_chiusa: 'lock',
  partita_annullata: 'ban',
  risultato: 'flag',
  votazione_aperta: 'star',
  soprannome: 'tag',
  promemoria: 'clock',
  boncall: 'boncall',
  sostituto: 'swap',
  achievement: 'medal',
  premio: 'award',
};

export function NotificationItem({ notification: n, onOpen }) {
  return (
    <Link to={n.link || '#'} className={`notif ${n.read ? '' : 'is-unread'}`} onClick={() => onOpen?.(n)}>
      <span className="icon-wrap">
        <Icon name={NOTIFICATION_ICONS[n.type] || 'bell'} />
      </span>
      <span className="stack" style={{ gap: 2 }}>
        <strong>{n.title}</strong>
        {n.body && (
          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            {n.body}
          </span>
        )}
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          {timeAgo(n.createdAt)}
          {!n.read && <span className="visually-hidden"> · non letta</span>}
        </span>
      </span>
    </Link>
  );
}

/** Variazione rispetto alla stagione precedente; assente se non c'è un confronto. */
function PositionChange({ now, before }) {
  if (before === null || before === undefined) return null;
  const diff = before - now;
  if (diff === 0) return <span className="pos-change same" role="img" aria-label="Stessa posizione della stagione precedente">=</span>;
  const label = diff > 0 ? `Sale di ${diff} ${diff === 1 ? 'posizione' : 'posizioni'} rispetto alla stagione precedente` : `Scende di ${-diff} ${diff === -1 ? 'posizione' : 'posizioni'} rispetto alla stagione precedente`;
  return (
    <span className={`pos-change ${diff > 0 ? 'up' : 'down'}`} role="img" aria-label={label}>
      {diff > 0 ? '▲' : '▼'}
      {Math.abs(diff)}
    </span>
  );
}

export function LeaderboardRow({ entry: e, isMe, to }) {
  const body = (
    <>
      <span className="pos" aria-label={`${e.position}° posto`}>
        {e.position}
        <PositionChange now={e.position} before={e.previousPosition} />
      </span>
      <span className="body">
        <span className="player">
          <Avatar user={e.user} size={34} />
          <span className="player-text">
            <span className="player-name">
              <PlayerName user={e.user} />
            </span>
            <span className="player-sub">{e.detail}</span>
          </span>
        </span>
        <span className="progress" aria-hidden="true">
          <span style={{ width: `${Math.round(e.bar * 100)}%` }} />
        </span>
      </span>
      <span className="value">{e.display}</span>
    </>
  );
  return (
    <li className={`rank-row ${isMe ? 'is-me' : ''}`}>
      {to ? (
        <Link to={to} className="rank-row-link">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
