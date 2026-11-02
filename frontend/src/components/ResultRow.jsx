import { Link } from 'react-router-dom';
import FieldBadge from './FieldBadge';
import { Avatar, PlayerName } from './Avatar';
import { getField } from '../config';
import { TIME_ZONE } from '../config';

const day = new Intl.DateTimeFormat('it-IT', { day: '2-digit', timeZone: TIME_ZONE });
const month = new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: TIME_ZONE });

/** Riga di risultato in stile "grafica TV": data, campo, punteggio, MVP. */
export default function ResultRow({ match: m }) {
  const field = getField(m.field);
  const cancelled = m.status === 'annullata';
  const winner = m.result ? (m.result.scoreA === m.result.scoreB ? null : m.result.scoreA > m.result.scoreB ? 'a' : 'b') : null;
  return (
    <li>
      <Link to={`/partite/${m.id}`} className={`result-row ${cancelled ? 'is-cancelled' : ''}`} style={{ '--field-color': field.color }}>
        <span className="result-date" aria-hidden="true">
          <b>{day.format(new Date(m.startsAt))}</b>
          <i>{month.format(new Date(m.startsAt)).replace('.', '')}</i>
        </span>
        <FieldBadge fieldKey={m.field} size={34} />
        <span className="result-teams">
          {m.result ? (
            <>
              <span className={winner === 'a' ? 'is-winner' : ''}>{m.teams?.a.name}</span>
              <span className="result-score tabular">
                {m.result.scoreA}
                <i>–</i>
                {m.result.scoreB}
              </span>
              <span className={winner === 'b' ? 'is-winner' : ''}>{m.teams?.b.name}</span>
            </>
          ) : (
            <span className="muted">{cancelled ? 'Annullata' : 'Senza risultato'}</span>
          )}
        </span>
        <span className="result-meta">
          {field.name}
          {m.voting?.mvp?.[0] && (
            <span className="result-mvp">
              <Avatar user={m.voting.mvp[0]} size={22} />
              <span>
                MVP <PlayerName user={m.voting.mvp[0]} />
              </span>
            </span>
          )}
        </span>
        <span className="visually-hidden">
          {new Date(m.startsAt).toLocaleDateString('it-IT', { timeZone: TIME_ZONE })}
        </span>
      </Link>
    </li>
  );
}
