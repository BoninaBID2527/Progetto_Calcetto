import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import Podium, { RankRows } from '../components/Podium';
import { Avatar, PlayerName } from '../components/Avatar';
import { CardSkeleton, EmptyState, ErrorState } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';

const ICONS = {
  forti: 'shield',
  mvp: 'star',
  vincenti: 'trophy',
  sfortunati: 'help',
  presenti: 'calendar',
  bomber: 'ball',
  forma: 'flame',
  media_gol: 'target',
  difensore: 'shield',
  portiere: 'kit',
  rendimento: 'chart',
  crescita: 'trend',
};

/** Il valore del selettore diventa la query: sempre, mese, stagione corrente o una stagione passata. */
function queryFor(scope) {
  if (scope.startsWith('season:')) return `season=${encodeURIComponent(scope.slice(7))}`;
  return `period=${scope}`;
}

export default function GroupRankings() {
  const { group } = useOutletContext();
  const { user } = useAuth();
  const [scope, setScope] = useState('sempre');
  const [selected, setSelected] = useState('forti');
  const seasons = useResource(() => api(`/groups/${group.id}/seasons`), [group.id]);
  const { data, error, loading, reload } = useResource(async () => {
    const [rankings, prizes] = await Promise.all([api(`/groups/${group.id}/rankings?${queryFor(scope)}`), api(`/groups/${group.id}/prize-stats`)]);
    return { ...rankings, prizes: prizes.prizes };
  }, [group.id, scope]);
  const past = (seasons.data?.seasons || []).filter((x) => x.closed);

  // Le classifiche si aggiornano partita dopo partita.
  useRealtimeEvent('match:updated', (m) => m.groupId === group.id && ['giocata', 'archiviata'].includes(m.status) && reload());
  useOnReconnect(reload);

  const ranking = data?.rankings.find((r) => r.key === selected);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h2>Classifiche</h2>
          <p>Solo partite giocate. Per comparire servono almeno {group.settings.minMatchesForRanking} partite nel periodo.</p>
        </div>
        <div className="field" style={{ minWidth: 220 }}>
          <label className="label" htmlFor="ranking-scope">
            Periodo
          </label>
          <select id="ranking-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="sempre">Sempre</option>
            <option value="mese">Questo mese</option>
            <option value="stagione">Stagione corrente{seasons.data?.seasons?.find((x) => x.current) ? ` · ${seasons.data.seasons.find((x) => x.current).label}` : ''}</option>
            {past.length > 0 && (
              <optgroup label="Stagioni passate">
                {past.map((x) => (
                  <option key={x.key} value={`season:${x.key}`}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {loading && <CardSkeleton lines={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data?.season && (
        <p className="rank-note" role="status">
          <Icon name="info" />
          <span>
            <strong>{data.season.label}</strong>
            {data.previous ? ` · le frecce confrontano con ${data.previous.label.toLowerCase()}.` : ' · nessuna stagione precedente da confrontare.'}
          </span>
        </p>
      )}

      {data && (
        <div className="grid-main-side">
          <div className="stack">
            <div className="tabs" role="tablist" aria-label="Classifiche">
              {data.rankings.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="tab"
                  id={`tab-${r.key}`}
                  aria-selected={selected === r.key}
                  aria-controls="ranking-panel"
                  className="tab"
                  onClick={() => setSelected(r.key)}
                >
                  <Icon name={ICONS[r.key]} />
                  {r.key === 'sfortunati' ? 'Sfortunati' : r.title}
                  {!r.available && <span className="visually-hidden"> (non disponibile)</span>}
                </button>
              ))}
            </div>
            <section className="card stack" id="ranking-panel" role="tabpanel" aria-labelledby={`tab-${selected}`}>
              <div className="spread" style={{ flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.7rem', textTransform: 'uppercase' }}>{ranking.title}</h3>
                <span className="chip">
                  {data.totalMatches} {data.totalMatches === 1 ? 'partita' : 'partite'}
                  {ranking.minMatches ? ` · min. ${ranking.minMatches}` : ''}
                </span>
              </div>
              {ranking.entries.length ? (
                <>
                  <Podium entries={ranking.entries} />
                  <RankRows entries={ranking.entries} meId={user.id} linkFor={(e) => `/gruppi/${group.id}/giocatori/${e.user.id}`} />
                </>
              ) : (
                <EmptyState title="Classifica non disponibile">
                  {ranking.key === 'bomber' && !data.hasScorers
                    ? 'Inserite i marcatori nei risultati e qui nascerà la corsa al titolo di bomber.'
                    : ranking.unavailableReason || 'Nessuno soddisfa ancora il requisito.'}
                </EmptyState>
              )}
              <p className="rank-note">
                <Icon name="info" />
                <span>
                  <strong>Requisito: </strong>
                  {ranking.requirement}
                  <br />
                  <strong>Come si calcola: </strong>
                  {ranking.note}
                </span>
              </p>
            </section>
          </div>

          <div className="stack">
            <section className="card stack" aria-labelledby="leaders-title">
              <h3 id="leaders-title" className="section-title">
                <Icon name="crown" /> In testa
              </h3>
              <ul className="list">
                {data.rankings.map((r) => (
                  <li key={r.key}>
                    <button type="button" className="list-item" style={{ width: '100%', border: 0, background: 'none', textAlign: 'left' }} onClick={() => setSelected(r.key)}>
                      <Icon name={ICONS[r.key]} />
                      <span className="grow">
                        <span className="player-sub">{r.title}</span>
                        <span className="player-name">{r.entries[0] ? <PlayerName user={r.entries[0].user} /> : '—'}</span>
                      </span>
                      {r.entries[0] && (
                        <>
                          <Avatar user={r.entries[0].user} size={30} />
                          <span className="num">{r.entries[0].display}</span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card stack" aria-labelledby="prize-count-title">
              <h3 id="prize-count-title" className="section-title">
                <Icon name="mug" /> Terzo tempo preferito
              </h3>
              <ul className="list">
                {data.prizes.map((p) => (
                  <li key={p.key} className="list-item">
                    <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
                      {p.emoji}
                    </span>
                    <span className="grow">
                      <span className="player-name">{p.label}</span>
                      <span className="progress" aria-hidden="true">
                        <span style={{ width: `${(p.count / Math.max(1, data.prizes[0].count)) * 100}%` }} />
                      </span>
                    </span>
                    <span className="num" aria-label={`${p.count} volte`}>
                      {p.count}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
