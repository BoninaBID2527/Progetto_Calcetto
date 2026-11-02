import { Link, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import { Avatar, PlayerName } from '../components/Avatar';
import { CardHeader, CardSkeleton, EmptyState, ErrorState } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useOnReconnect } from '../context/RealtimeContext';

const TITLE_ICONS = { forti: 'shield', mvp: 'star', bomber: 'ball', vincenti: 'trophy' };

const MAX_HOLDERS = 3;

function Holders({ users, group }) {
  if (!users.length) return <span className="muted">—</span>;
  return (
    <span className="hof-holders">
      {users.slice(0, MAX_HOLDERS).map((u) => (
        <Link key={u.id} to={`/gruppi/${group.id}/giocatori/${u.id}`} className="hof-holder">
          <Avatar user={u} size={28} />
          <PlayerName user={u} />
        </Link>
      ))}
      {users.length > MAX_HOLDERS && <span className="player-sub">a pari merito con altri {users.length - MAX_HOLDERS}</span>}
    </span>
  );
}

const dateOf = (d) => (d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' }) : null);

export default function HallOfFame() {
  const { group } = useOutletContext();
  const { data, error, loading, reload } = useResource(() => api(`/groups/${group.id}/hall-of-fame`), [group.id]);
  useOnReconnect(reload);
  const hof = data?.hallOfFame;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h2>Hall of Fame</h2>
          <p>La memoria del gruppo: stagioni concluse, record assoluti e i più premiati. Solo dati reali delle partite giocate.</p>
        </div>
      </div>

      {loading && <CardSkeleton lines={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {hof && hof.totalMatches === 0 && (
        <EmptyState title="Ancora nessun record">La Hall of Fame si riempie con le partite giocate. Il primo nome scritto sarà il più difficile da battere.</EmptyState>
      )}

      {hof && hof.totalMatches > 0 && (
        <div className="grid-main-side">
          <div className="stack">
            <section className="card stack" aria-labelledby="hof-seasons">
              <CardHeader id="hof-seasons" icon="crown" title="Vincitori delle stagioni" />
              {hof.seasons.length === 0 ? (
                <p className="muted">Nessuna stagione è ancora conclusa: i vincitori compariranno qui a fine stagione.</p>
              ) : (
                hof.seasons.map((s) => (
                  <article key={s.key} className="hof-season stack" aria-label={s.label}>
                    <h4 className="hof-season-title">
                      {s.label} <span className="chip">{s.matches} {s.matches === 1 ? 'partita' : 'partite'}</span>
                    </h4>
                    <ul className="hof-winners">
                      {s.winners.map((w) => (
                        <li key={w.key} className="hof-winner">
                          <Icon name={TITLE_ICONS[w.key]} />
                          <span className="grow">
                            <span className="player-sub">{w.title}</span>
                            <Holders users={w.users} group={group} />
                          </span>
                          {w.display && <span className="num">{w.display}</span>}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </section>
          </div>

          <div className="stack">
            <section className="card stack" aria-labelledby="hof-records">
              <CardHeader id="hof-records" icon="medal" title="Record assoluti" />
              <ul className="list">
                {hof.records.map((r) => (
                  <li key={r.key} className="list-item hof-record">
                    <span className="grow">
                      <span className="player-sub">
                        {r.title}
                        {r.note ? ` · ${r.note}` : ''}
                      </span>
                      {r.available ? <Holders users={r.users} group={group} /> : <span className="muted">Dati non ancora sufficienti</span>}
                      {r.available && r.date && <span className="player-sub">{dateOf(r.date)}</span>}
                    </span>
                    <span className="num">{r.available ? r.value : '—'}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card stack" aria-labelledby="hof-awarded">
              <CardHeader id="hof-awarded" icon="award" title="I più premiati" />
              {hof.mostAwarded.length === 0 ? (
                <p className="muted">Nessun premio assegnato finora.</p>
              ) : (
                <ol className="list">
                  {hof.mostAwarded.map((a) => (
                    <li key={a.user.id} className="list-item">
                      <Avatar user={a.user} size={34} />
                      <span className="grow">
                        <span className="player-name">
                          <PlayerName user={a.user} />
                        </span>
                        <span className="player-sub">
                          {a.mvp} MVP · {a.awards} premi · {a.seasonTitles} titoli
                        </span>
                      </span>
                      <span className="num" aria-label={`${a.total} riconoscimenti`}>
                        {a.total}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
