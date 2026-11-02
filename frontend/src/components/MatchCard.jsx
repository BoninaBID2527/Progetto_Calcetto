import { Link } from 'react-router-dom';
import FieldBadge from './FieldBadge';
import Icon from './Icon';
import { AvatarStack } from './Avatar';
import { SlotsBar, StatusPill } from './ui';
import { getField } from '../config';
import { formatDay, formatTime, formatEuro } from '../utils/format';

export function myParticipation(match, userId) {
  const list = match.participants;
  const mine = list.find((p) => p.user.id === userId);
  if (!mine) return { response: null };
  if (mine.response === 'attesa') {
    const queue = list.filter((p) => p.response === 'attesa');
    return { ...mine, queuePosition: queue.findIndex((p) => p.user.id === userId) + 1 };
  }
  return mine;
}

export default function MatchCard({ match, userId, onRespond, busy }) {
  const field = getField(match.field);
  const confirmed = match.participants.filter((p) => p.response === 'ci_sono').map((p) => p.user);
  const mine = myParticipation(match, userId);
  const open = match.status === 'aperta';

  return (
    <article className="card match-card" style={{ '--field-color': field.color }} aria-labelledby={`match-${match.id}`}>
      <div className="match-card-head">
        <FieldBadge fieldKey={match.field} />
        <div className="grow">
          <div className="match-field-name" id={`match-${match.id}`}>
            <Link to={`/partite/${match.id}`} className="cover-link">
              {field.name}
            </Link>
          </div>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {field.town}
          </span>
        </div>
        <StatusPill status={match.status} />
      </div>

      <div className="match-when">
        <span className="match-day">{formatDay(match.startsAt)}</span>
        <span className="match-time">{formatTime(match.startsAt)}</span>
        <span className="kv">
          <Icon name="clock" /> {match.durationMinutes} min
        </span>
        {match.quotaCents && (
          <span className="kv">
            <Icon name="euro" /> {formatEuro(match.quotaCents)} a testa
          </span>
        )}
      </div>

      {match.status !== 'giocata' && match.status !== 'archiviata' ? (
        <SlotsBar taken={match.counts.ci_sono} slots={match.slots} waiting={match.counts.attesa} />
      ) : (
        match.result && (
          <div className="spread">
            <span className="num" style={{ fontSize: '2rem' }}>
              {match.result.scoreA} - {match.result.scoreB}
            </span>
            <span className="muted">
              {match.teams?.a.name} · {match.teams?.b.name}
            </span>
          </div>
        )
      )}

      <div className="match-card-foot">
        {confirmed.length ? (
          <AvatarStack users={confirmed} label={`Presenti: ${confirmed.map((u) => u.name).join(', ')}`} />
        ) : (
          <span className="muted">Ancora nessun iscritto: rompi il ghiaccio!</span>
        )}
        {open && onRespond && (
          <>
            {mine.response === 'ci_sono' && (
              <span className="chip chip-primary on-top">
                <Icon name="check" /> Ci sei
              </span>
            )}
            {mine.response === 'attesa' && (
              <span className="chip chip-orange on-top">In attesa · {mine.queuePosition}°</span>
            )}
            {mine.response !== 'ci_sono' && mine.response !== 'attesa' && (
              <button type="button" className="btn btn-primary" onClick={() => onRespond(match, 'ci_sono')} disabled={busy}>
                <Icon name="check" /> Ci sono
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
