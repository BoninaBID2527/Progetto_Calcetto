import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { PlayerName } from '../components/Avatar';
import FieldBadge from '../components/FieldBadge';
import { Button, Card, CardHeader, CardSkeleton, ErrorState } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { formatDay, initials } from '../utils/format';

function Side({ user, align, delay }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`vs-side vs-${align}`}
      initial={reduce ? false : { opacity: 0, x: align === 'left' ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <span className="vs-photo" style={{ '--avatar-bg': user.avatarColor }} aria-hidden="true">
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials(user.name)}
      </span>
      <strong className="vs-name">{user.name}</strong>
      {user.nickname && <span className="vs-nick">«{user.nickname}»</span>}
    </motion.div>
  );
}

function Compare({ label, a, b, format = (v) => v }) {
  const total = (Number(a) || 0) + (Number(b) || 0);
  const pa = total ? ((Number(a) || 0) / total) * 100 : 50;
  return (
    <li className="compare-row">
      <span className="tabular">{a === null ? '—' : format(a)}</span>
      <span className="compare-label">
        {label}
        <span className="compare-bar" aria-hidden="true">
          <i style={{ width: `${pa}%` }} />
        </span>
      </span>
      <span className="tabular">{b === null ? '—' : format(b)}</span>
    </li>
  );
}

const RESULT = { V: 'vinta', P: 'pari', S: 'persa' };

export default function Versus() {
  const { group } = useOutletContext();
  const { userId } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const other = params.get('with') || user.id;
  const { data, error, loading, reload } = useResource(() => api(`/groups/${group.id}/rivalries/${userId}?with=${other}`).then((r) => r.versus), [group.id, userId, other]);

  if (loading) {
    return (
      <div className="page">
        <CardSkeleton lines={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  const v = data;
  const o = v.opposed;
  const one = (x) => String(x).replace('.', ',');

  return (
    <div className="page">
      <Button variant="ghost" size="sm" icon="chevron-left" to={`/gruppi/${group.id}/rivalita`} style={{ justifySelf: 'start' }}>
        Rivalità
      </Button>
      <section className="vs-stage" aria-label={`${v.a.name} contro ${v.b.name}: ${o.winsA} vittorie a ${o.winsB}, ${o.draws} pareggi in ${o.played} scontri diretti`}>
        <Side user={v.a} align="left" delay={0} />
        <div className="vs-center" aria-hidden="true">
          <span className="vs-mark">VS</span>
          <span className="vs-record tabular">
            {o.winsA}
            <i>-</i>
            {o.draws}
            <i>-</i>
            {o.winsB}
          </span>
          <span className="overline">in {o.played} scontri diretti</span>
        </div>
        <Side user={v.b} align="right" delay={0.08} />
      </section>

      {!v.reliable && (
        <p className="form-alert" style={{ background: 'var(--c-gold-soft)', color: 'var(--c-gold-text)' }}>
          <span>
            Solo {o.played} {o.played === 1 ? 'scontro diretto' : 'scontri diretti'}: servono almeno {v.minMeetings} per parlare di vera rivalità. Prendi questi numeri con le pinze.
          </span>
        </p>
      )}

      <div className="grid-main-side">
        <Card aria-labelledby="cmp-title">
          <CardHeader id="cmp-title" eyebrow="Negli scontri diretti" title="Il confronto" icon="rivalry" />
          <ul className="compare">
            <Compare label="Vittorie" a={o.winsA} b={o.winsB} />
            <Compare label="Gol segnati" a={o.goalsA} b={o.goalsB} />
            <Compare label="MVP (partite giocate entrambi)" a={v.mvp.a} b={v.mvp.b} />
            <Compare label="Voto medio" a={v.avgRating.a} b={v.avgRating.b} format={one} />
          </ul>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            Insieme nella stessa squadra: {v.together.played} partite, {v.together.wins} vinte.
            {v.streak && (
              <>
                {' '}
                Serie in corso: {v.streak.length} {v.streak.length === 1 ? 'vittoria' : 'vittorie'} di fila per <PlayerName user={v.streak.user} />.
              </>
            )}
          </p>
        </Card>
        <Card aria-labelledby="last-title">
          <CardHeader id="last-title" eyebrow="Ultimi scontri" title="Come è andata" icon="history" />
          {v.last.length ? (
            <ul className="list">
              {v.last.map((m) => (
                <li key={m.matchId}>
                  <Link to={`/partite/${m.matchId}`} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <FieldBadge fieldKey={m.field} size={32} />
                    <span className="grow">
                      <span className="player-name">{formatDay(m.date)}</span>
                      <span className="player-sub">
                        per {v.a.name}: {RESULT[m.resultA]} {m.score}
                      </span>
                    </span>
                    <span className={`form-strip-item form-${m.resultA}`} aria-hidden="true">
                      {m.resultA}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Non si sono mai affrontati: la prima sfida è ancora da giocare.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
