import { Avatar, PlayerName } from './Avatar';

/** Podio con i primi tre: in ordine visivo secondo, primo, terzo. */
export default function Podium({ entries }) {
  const top = entries.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const cls = ['p2', 'p1', 'p3'];
  return (
    <ol className="podium" aria-label="Podio">
      {order.map((e, i) =>
        e ? (
          <li key={e.user.id} className={`podium-step ${cls[i]}`} style={{ listStyle: 'none' }}>
            <Avatar user={e.user} size={cls[i] === 'p1' ? 76 : 60} />
            <span className={`medal m${Math.min(e.position, 3)}`} aria-label={`${e.position}° posto`}>
              {e.position}
            </span>
            <span className="name">
              <PlayerName user={e.user} />
            </span>
            <span className="value">{e.display}</span>
            <span className="podium-block" aria-hidden="true" />
          </li>
        ) : (
          <li key={`vuoto-${i}`} className={`podium-step ${cls[i]}`} style={{ listStyle: 'none', opacity: 0.45 }} aria-hidden="true">
            <span className="avatar" style={{ '--size': '60px' }}>
              ?
            </span>
            <span className="name">Posto libero</span>
            <span className="value">–</span>
            <span className="podium-block" />
          </li>
        )
      )}
    </ol>
  );
}

export function RankRows({ entries, meId }) {
  return (
    <ol className="rank-rows">
      {entries.map((e) => (
        <li key={e.user.id} className={`rank-row ${e.user.id === meId ? 'is-me' : ''}`}>
          <span className="pos" aria-label={`${e.position}° posto`}>
            {e.position}
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
        </li>
      ))}
    </ol>
  );
}
