import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import MatchdayHero from '../components/dashboard/MatchdayHero';
import ActivityFeed from '../components/dashboard/ActivityFeed';
import FieldBadge from '../components/FieldBadge';
import { Card, CardHeader, CardSkeleton, ErrorState, StatCard } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { getField } from '../config';
import { formatDateTime, formatDay, formatTime } from '../utils/format';
import { responseToast } from './GroupMatches';

const pct = (v) => `${Math.round(v)}%`;
const one = (v) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

function FormStrip({ form }) {
  if (!form.length) return <span className="muted">Nessuna partita giocata</span>;
  const label = { V: 'vittoria', P: 'pareggio', S: 'sconfitta' };
  return (
    <ol className="form-strip" aria-label={`Ultime partite: ${form.map((r) => label[r]).join(', ')}`}>
      {form.map((r, i) => (
        <li key={i} className={`form-${r}`} aria-hidden="true">
          {r}
        </li>
      ))}
    </ol>
  );
}

export default function Dashboard() {
  const { group } = useOutletContext();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload, setData } = useResource(() => api(`/groups/${group.id}/dashboard`).then((r) => r.dashboard), [group.id]);

  useRealtimeEvent('activity:new', (a) => setData((d) => (d ? { ...d, activity: [a, ...d.activity.filter((x) => x.id !== a.id)].slice(0, 8) } : d)));
  useRealtimeEvent('match:updated', (m) => m.groupId === group.id && reload());
  useRealtimeEvent('match:created', (m) => m.groupId === group.id && reload());
  useOnReconnect(reload);

  const canOrganize = group.settings.organizers === 'tutti' || group.myRole === 'admin';
  const base = `/gruppi/${group.id}`;

  const respond = async (match, response) => {
    setBusy(true);
    try {
      const res = await api(`/matches/${match.id}/response`, { method: 'PUT', body: { response } });
      responseToast(toast, res);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <CardSkeleton lines={5} />
        <div className="dash-grid">
          <CardSkeleton />
          <CardSkeleton />
        </div>
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

  const { me } = data;
  const fewMatches = me.played < me.minSamples;
  const quick = [
    canOrganize && { to: `${base}/nuova-partita`, icon: 'plus', label: 'Nuova partita', primary: true },
    { to: `${base}/classifiche`, icon: 'trophy', label: 'Classifiche' },
    { to: `${base}/partite`, icon: 'calendar', label: 'Tutte le partite' },
    { to: `${base}/membri`, icon: 'users', label: 'Il gruppo' },
  ].filter(Boolean);

  return (
    <div className="page dashboard">
      <MatchdayHero match={data.nextMatch} userId={user.id} onRespond={respond} busy={busy} createTo={canOrganize ? `${base}/nuova-partita` : null} />

      <nav className="quick-actions" aria-label="Azioni rapide">
        {quick.map((q) => (
          <Link key={q.to} to={q.to} className={`quick-action ${q.primary ? 'is-primary' : ''}`}>
            <Icon name={q.icon} />
            {q.label}
          </Link>
        ))}
      </nav>

      {data.openVoting.length > 0 && (
        <section className="todo-strip" aria-label="Da fare">
          {data.openVoting.map((v) => (
            <Link key={v.matchId} to={`/partite/${v.matchId}#votazioni`} className="todo-card">
              <span className="todo-icon">
                <Icon name="star" />
              </span>
              <span className="stack" style={{ gap: 2 }}>
                <strong>Vota l'MVP di {formatDay(v.startsAt).toLowerCase()} a {getField(v.field).name}</strong>
                <span className="muted">Si chiude {formatDateTime(v.closesAt).toLowerCase()}</span>
              </span>
              <Icon name="chevron-right" />
            </Link>
          ))}
        </section>
      )}

      <div className="dash-grid">
        <Card className="dash-stats" aria-labelledby="my-season">
          <CardHeader id="my-season" eyebrow="Le tue statistiche" title="Il tuo campionato" icon="chart" />
          <div className="stat-grid">
            <StatCard label="Presenze" value={me.played} icon="calendar" tone="primary" />
            <StatCard label="Gol" value={me.goals} icon="ball" />
            <StatCard label="MVP" value={me.mvp} icon="star" tone="gold" />
            <StatCard
              label="Vittorie"
              value={me.winRate === null ? null : me.winRate * 100}
              format={pct}
              icon="trophy"
              samples={me.played}
              minSamples={me.minSamples}
              hint={`${me.wins} vinte · ${me.draws} pari · ${me.losses} perse`}
            />
            <StatCard
              label="Voto medio"
              value={me.avgRating}
              format={one}
              icon="target"
              hint={me.ratingsCount ? `su ${me.ratingsCount} voti ricevuti` : 'Ancora nessun voto ricevuto'}
            />
          </div>
          <div className="spread" style={{ marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
            <span className="overline">Forma · ultime 5</span>
            <FormStrip form={me.form} />
          </div>
          {fewMatches && me.played > 0 && (
            <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 'var(--space-3)' }}>
              Con {me.played} {me.played === 1 ? 'partita' : 'partite'} le percentuali dicono ancora poco: diventano affidabili dalla {me.minSamples}ª.
            </p>
          )}
        </Card>

        <Card aria-labelledby="my-positions">
          <CardHeader id="my-positions" eyebrow={`Stagione · ${data.seasonMatches} partite`} title="Dove sei in classifica" icon="trophy" />
          <ul className="position-list">
            {data.positions.map((p) => (
              <li key={p.key}>
                <Link to={`${base}/classifiche`} className="position-row">
                  <span className="position-badge">{p.position ? `${p.position}°` : '–'}</span>
                  <span className="grow">
                    <span className="player-name">{p.title}</span>
                    <span className="player-sub">{p.position ? `${p.value} · su ${p.total}` : `Servono ${p.minMatches} partite nella stagione`}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="dash-feed" aria-labelledby="feed-title">
          <CardHeader id="feed-title" eyebrow="In tempo reale" title="Nello spogliatoio" icon="activity" />
          <ActivityFeed items={data.activity} />
        </Card>

        {data.upcoming.length > 0 && (
          <Card aria-labelledby="next-title">
            <CardHeader id="next-title" eyebrow="In calendario" title="Le prossime" icon="calendar" />
            <ul className="list">
              {data.upcoming.map((m) => (
                <li key={m.id}>
                  <Link to={`/partite/${m.id}`} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <FieldBadge fieldKey={m.field} size={36} />
                    <span className="grow">
                      <span className="player-name">
                        {formatDay(m.startsAt)} · {formatTime(m.startsAt)}
                      </span>
                      <span className="player-sub">
                        {getField(m.field).name} · {m.counts.ci_sono}/{m.slots} confermati
                      </span>
                    </span>
                    <Icon name="chevron-right" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
