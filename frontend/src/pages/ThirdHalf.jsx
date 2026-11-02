import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../components/Icon';
import PrizeArt from '../components/PrizeArt';
import { Confetti } from '../components/match/PrizePanel';
import { Card, CardHeader, CardSkeleton, Countdown, EmptyState, ErrorState, StatCard } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { formatDateTime } from '../utils/format';

const pct = (v) => `${Math.round(v * 100)}%`;
const day = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' });

/** Premiazione del "premio più scelto": ingresso animato, statico con le animazioni ridotte. */
function Ceremony({ winners, label }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className="ceremony" role="status" initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
      {!reduce && <Confetti />}
      <span className="eyebrow" style={{ color: 'var(--c-orange-text)' }}>
        {label}
      </span>
      <div className="ceremony-art">
        {winners.map((w) => (
          <PrizeArt key={w.key} option={w} />
        ))}
      </div>
      <h3 style={{ fontSize: 'clamp(1.8rem, 1.3rem + 2vw, 2.6rem)', textTransform: 'uppercase' }}>{winners.map((w) => `${w.label} ${w.emoji}`).join(' e ')}</h3>
      <p className="muted">
        {winners[0].wins} {winners[0].wins === 1 ? 'serata vinta' : 'serate vinte'}
        {winners.length > 1 ? ' a testa: il gruppo non sa decidersi' : ''}
      </p>
    </motion.div>
  );
}

export default function ThirdHalf() {
  const { group } = useOutletContext();
  const [scope, setScope] = useState('sempre');
  const seasons = useResource(() => api(`/groups/${group.id}/seasons`), [group.id]);
  const { data, error, loading, reload } = useResource(() => {
    const q = scope.startsWith('season:') ? `season=${encodeURIComponent(scope.slice(7))}` : `period=${scope}`;
    return api(`/groups/${group.id}/third-half?${q}`).then((r) => r.thirdHalf);
  }, [group.id, scope]);
  useRealtimeEvent('voting:updated', reload);
  useOnReconnect(reload);
  const past = (seasons.data?.seasons || []).filter((s) => s.closed);
  const stats = data?.stats;
  const maxVotes = Math.max(1, ...(stats?.options || []).map((o) => o.votes));

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h2>Terzo tempo</h2>
          <p>Dove si va dopo la partita, serata per serata. Si vedono solo i totali: chi ha votato cosa resta anonimo.</p>
        </div>
        <div className="field" style={{ minWidth: 220 }}>
          <label className="label" htmlFor="third-scope">
            Periodo
          </label>
          <select id="third-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="sempre">Sempre</option>
            <option value="stagione">Stagione corrente</option>
            {past.length > 0 && (
              <optgroup label="Stagioni passate">
                {past.map((s) => (
                  <option key={s.key} value={`season:${s.key}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {loading && !data && <CardSkeleton lines={5} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && data.open.length > 0 && (
        <Card aria-labelledby="open-title">
          <CardHeader id="open-title" icon="timer" title="Votazioni in corso" eyebrow="Scadenza" />
          <ul className="list">
            {data.open.map((o) => (
              <li key={o.matchId}>
                <Link to={`/partite/${o.matchId}`} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <span className="grow">
                    <span className="player-name">{o.fieldName}</span>
                    <span className="player-sub">
                      {o.votedCount} su {o.eligibleCount} hanno scelto · si vota fino a {formatDateTime(o.closesAt)}
                    </span>
                  </span>
                  <Countdown to={o.closesAt} label="Mancano" compact />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && stats.polls === 0 && (
        <EmptyState title="Nessun terzo tempo concluso">
          {data.season ? `Nessuna votazione chiusa in ${data.season.label.toLowerCase()}.` : 'Dopo la prima partita con risultato si vota dove andare: qui nascerà la storia del vostro dopo-partita.'}
        </EmptyState>
      )}

      {data && stats.polls > 0 && (
        <div className="grid-main-side">
          <div className="stack">
            {stats.mostChosen.length > 0 && <Ceremony winners={stats.mostChosen} label={data.season ? `Premio più scelto · ${data.season.label}` : 'Premio più scelto di sempre'} />}
            <section className="grid stats-grid" aria-label="Statistiche">
              <StatCard label="Serate" value={stats.polls} hint={`${stats.pollsWithVotes} con almeno un voto`} />
              <StatCard label="Voti espressi" value={stats.totalVotes} />
              <StatCard label="Partecipazione" value={stats.participationRate === null ? null : Math.round(stats.participationRate * 100)} suffix="%" hint="Voti sui giocatori che potevano votare" />
              {stats.streak && <StatCard label="Serie in corso" value={stats.streak.length} hint={`${stats.streak.label} ${stats.streak.emoji} di fila`} />}
            </section>
            <Card aria-labelledby="hist-title">
              <CardHeader id="hist-title" icon="history" title="Storico" eyebrow="Serata per serata" />
              <ul className="list">
                {data.history.map((h) => (
                  <li key={h.matchId} className="third-row">
                    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                      <span className="grow">
                        <Link to={`/partite/${h.matchId}`} className="player-name">
                          {day(h.startsAt)} · {h.fieldName}
                        </Link>
                        {h.score && <span className="player-sub">{h.score}</span>}
                      </span>
                      {h.winners.length ? (
                        <span className="chip chip-orange">
                          {h.winners.map((w) => `${w.label} ${w.emoji}`).join(' e ')}
                        </span>
                      ) : (
                        <span className="chip">Nessun voto</span>
                      )}
                    </div>
                    <span className="player-sub" style={{ whiteSpace: 'normal' }}>
                      {h.votedCount} su {h.eligibleCount} hanno votato ·{' '}
                      {h.options
                        .filter((o) => o.votes > 0)
                        .map((o) => `${o.label} ${o.votes}`)
                        .join(', ') || 'nessun voto'}
                      {'loserTeam' in h && (h.draw ? ' · pareggio: si fa alla romana' : ` · il primo giro, se va, tocca alle ${h.loserTeam}`)}
                    </span>
                  </li>
                ))}
              </ul>
              {data.hasMore && <p className="muted">Mostro le ultime serate: restringi il periodo per vedere le altre.</p>}
            </Card>
          </div>
          <div className="stack">
            <Card aria-labelledby="opt-title">
              <CardHeader id="opt-title" icon="chart" title="Le preferenze" eyebrow="Vittorie e voti" />
              <ul className="list">
                {stats.options.map((o) => (
                  <li key={o.key} className="list-item">
                    <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
                      {o.emoji}
                    </span>
                    <span className="grow">
                      <span className="player-name">{o.label}</span>
                      <span className="progress" aria-hidden="true">
                        <span style={{ width: `${(o.votes / maxVotes) * 100}%` }} />
                      </span>
                      <span className="player-sub">
                        {o.wins} {o.wins === 1 ? 'serata vinta' : 'serate vinte'} · {o.votes} voti ({pct(o.share)})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            {data.loserPaysFirstRound && (
              <p className="rank-note">
                <Icon name="info" />
                <span>
                  <strong>Chi perde offre il primo giro</strong> è un gesto facoltativo scelto dal gruppo: BONMATCH non registra importi né debiti.
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
