import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PollCard from '../components/boncall/PollCard';
import { Button, CardSkeleton, EmptyState, ErrorState, SegmentedControl } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';

export default function GroupPolls() {
  const { group } = useOutletContext();
  const { user } = useAuth();
  const [scope, setScope] = useState('aperte');
  const { data, error, loading, reload } = useResource(() => api(`/groups/${group.id}/polls?scope=${scope}`).then((r) => r.polls), [group.id, scope]);
  useRealtimeEvent('poll:created', (p) => p.groupId === group.id && reload());
  useRealtimeEvent('poll:updated', (p) => p.groupId === group.id && reload());
  useOnReconnect(reload);
  const canOrganize = group.settings.organizers === 'tutti' || group.myRole === 'admin';

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <span className="overline">BONCALL</span>
          <h2>Convocazioni</h2>
          <p>Cerchi giocatori? Apri una convocazione: il gruppo riceve subito la notifica e, quando ci sono tutti, la trasformi in partita con un tocco.</p>
        </div>
        {canOrganize && (
          <Button variant="primary" icon="boncall" to={`/gruppi/${group.id}/boncall/nuova`}>
            Cerca giocatori
          </Button>
        )}
      </div>
      <SegmentedControl
        label="Quali convocazioni"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'aperte', label: 'Aperte' },
          { value: 'tutte', label: 'Tutte' },
        ]}
      />
      {loading && <CardSkeleton />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data &&
        (data.length ? (
          <div className="poll-list">
            {data.map((p) => (
              <PollCard key={p.id} poll={p} userId={user.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={scope === 'aperte' ? 'Nessuna convocazione aperta' : 'Ancora nessuna convocazione'}
            action={canOrganize && <Button variant="primary" icon="boncall" to={`/gruppi/${group.id}/boncall/nuova`}>Apri la prima</Button>}
          >
            Quando manca gente per giovedì, BONCALL avvisa tutti e conta le risposte al posto tuo.
          </EmptyState>
        ))}
    </div>
  );
}
