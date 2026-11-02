import { Link } from 'react-router-dom';
import Icon from '../Icon';
import { AvatarStack } from '../Avatar';
import { Countdown, StatusPill } from '../ui';
import { getField } from '../../config';
import { formatDay, formatTime } from '../../utils/format';

export const POLL_STATUS = { aperta: 'Aperta', completa: 'Completa', scaduta: 'Scaduta', convertita: 'Confermata', annullata: 'Annullata' };

export function pollTitle(poll) {
  if (poll.mode === 'fissa') return `${formatDay(poll.startsAt)} · ${formatTime(poll.startsAt)}`;
  return `${poll.options.length} date proposte`;
}

export function myPollResponse(poll, userId) {
  return poll.responses.find((r) => r.user.id === userId) || null;
}

/** Card compatta di una convocazione, per dashboard ed elenco. */
export default function PollCard({ poll, userId }) {
  const confirmed = poll.responses.filter((r) => r.response === 'ci_sono').map((r) => r.user);
  const mine = myPollResponse(poll, userId);
  const field = poll.mode === 'fissa' ? getField(poll.field) : null;
  return (
    <Link to={`/boncall/${poll.id}`} className="poll-card">
      <span className="poll-card-icon" aria-hidden="true">
        <Icon name="boncall" />
      </span>
      <span className="poll-card-body">
        <span className="overline">BONCALL · {field ? field.name : 'più alternative'}</span>
        <strong className="poll-card-title">{pollTitle(poll)}</strong>
        <span className="row" style={{ gap: 8 }}>
          <StatusPill status={poll.status === 'aperta' ? 'aperta' : poll.status === 'completa' ? 'chiusa' : 'archiviata'} label={POLL_STATUS[poll.status]} />
          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            {poll.missing ? `Mancano ${poll.missing}` : 'Ci sono tutti'}
            {mine ? ` · tu: ${mine.response === 'ci_sono' ? 'ci sei' : mine.response === 'attesa' ? 'in attesa' : mine.response === 'forse' ? 'forse' : 'non ci sei'}` : ' · non hai risposto'}
          </span>
        </span>
      </span>
      <span className="poll-card-side">
        {['aperta', 'completa'].includes(poll.status) && <Countdown to={poll.deadline} compact label="Scade tra" />}
        {confirmed.length > 0 && <AvatarStack users={confirmed} max={4} size={28} label={`${confirmed.length} confermati`} />}
      </span>
    </Link>
  );
}
