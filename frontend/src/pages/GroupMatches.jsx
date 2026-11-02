import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import MatchCard from '../components/MatchCard';
import { CardSkeleton, EmptyState, ErrorState } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';

const UPCOMING = ['aperta', 'chiusa'];

export function responseToast(toast, res) {
  if (res.outcome === 'ci_sono') toast.success('Ci sei! Posto preso.');
  else if (res.outcome === 'attesa') toast.info("Posti finiti: sei in lista d'attesa. Se qualcuno si ritira entri da solo.");
  else if (res.outcome === 'forse') toast.info('Segnato come "forse": decidi presto!');
  else toast.info('Ok, sarà per la prossima.');
}

export default function GroupMatches() {
  const { group } = useOutletContext();
  const { user } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const { data, error, loading, reload, setData } = useResource(async () => {
    const [up, past] = await Promise.all([api(`/groups/${group.id}/matches?scope=prossime`), api(`/groups/${group.id}/matches?scope=passate`)]);
    return { upcoming: up.matches, past: past.matches };
  }, [group.id]);

  const upsert = (match) => {
    if (match.groupId !== group.id) return;
    setData((d) => {
      if (!d) return d;
      const all = [...d.upcoming, ...d.past].filter((m) => m.id !== match.id).concat(match);
      return {
        upcoming: all.filter((m) => UPCOMING.includes(m.status)).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)),
        past: all.filter((m) => !UPCOMING.includes(m.status)).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt)),
      };
    });
  };
  useRealtimeEvent('match:created', upsert);
  useRealtimeEvent('match:updated', upsert);
  useOnReconnect(reload);

  const respond = async (match, response) => {
    setBusyId(match.id);
    try {
      const res = await api(`/matches/${match.id}/response`, { method: 'PUT', body: { response } });
      upsert(res.match);
      responseToast(toast, res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const canCreate = group.settings.organizers === 'tutti' || group.myRole === 'admin';

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h2>Prossime partite</h2>
          <p>Rispondi presto: i posti vanno a chi arriva prima, gli altri finiscono in lista d'attesa.</p>
        </div>
        {canCreate && (
          <Link to={`/gruppi/${group.id}/nuova-partita`} className="btn btn-primary desktop-only">
            <Icon name="plus" /> Nuova partita
          </Link>
        )}
      </div>

      {loading && (
        <div className="grid">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </div>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && (
        <>
          {data.upcoming.length ? (
            <div className="grid">
              {data.upcoming.map((m) => (
                <MatchCard key={m.id} match={m} userId={user.id} onRespond={respond} busy={busyId === m.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nessuna partita in programma"
              action={
                canCreate && (
                  <Link to={`/gruppi/${group.id}/nuova-partita`} className="btn btn-primary">
                    <Icon name="plus" /> Organizza la prossima
                  </Link>
                )
              }
            >
              Il pallone è sgonfio e il campo è vuoto. Basta un minuto per organizzare la prossima.
            </EmptyState>
          )}

          <section className="stack" aria-labelledby="past-title">
            <h2 id="past-title">Già giocate</h2>
            {data.past.length ? (
              <div className="grid">
                {data.past.map((m) => (
                  <MatchCard key={m.id} match={m} userId={user.id} />
                ))}
              </div>
            ) : (
              <p className="muted">Qui compariranno le partite giocate, con risultato, MVP e pagella.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
