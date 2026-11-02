import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Avatar, PlayerName } from '../components/Avatar';
import { Button, Card, CardHeader, CardSkeleton, EmptyState, ErrorState } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function Pair({ users, summary, to }) {
  const [a, b] = users;
  return (
    <Link to={to} className="pair-row">
      <Avatar user={a} size={40} />
      <span className="pair-names">
        <PlayerName user={a} /> <span className="pair-vs">vs</span> <PlayerName user={b} />
      </span>
      <Avatar user={b} size={40} />
      {summary && (
        <span className="pair-score tabular" aria-label={`${summary.winsA} vittorie, ${summary.draws} pari, ${summary.winsB} sconfitte in ${summary.played} scontri`}>
          {summary.winsA}-{summary.draws}-{summary.winsB}
        </span>
      )}
    </Link>
  );
}

export default function Rivalries() {
  const { group } = useOutletContext();
  const { user } = useAuth();
  const toast = useToast();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useResource(async () => {
    const [list, members] = await Promise.all([api(`/groups/${group.id}/rivalries`), api(`/groups/${group.id}/members`)]);
    return { ...list, members: members.members };
  }, [group.id]);

  const vsLink = (a, b) => `/gruppi/${group.id}/rivalita/${a.id}?with=${b.id}`;

  const act = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
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
        <CardSkeleton lines={4} />
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

  const pending = data.chosen.filter((r) => r.awaitingMe);
  const active = data.chosen.filter((r) => r.status === 'attiva');
  const mineSent = data.chosen.filter((r) => r.status === 'proposta' && !r.awaitingMe);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <span className="overline">Testa a testa</span>
          <h2>Rivalità</h2>
          <p>Facoltative e solo per divertimento: i numeri vengono dalle partite giocate davvero. Sotto i 3 scontri diretti il confronto è "da confermare".</p>
        </div>
      </div>

      {pending.length > 0 && (
        <Card variant="feature" accent="var(--c-orange)" aria-labelledby="pending-title">
          <CardHeader id="pending-title" eyebrow="Ti hanno sfidato" title="Proposte da accettare" icon="rivalry" />
          <ul className="list">
            {pending.map((r) => (
              <li key={r.id} className="list-item" style={{ flexWrap: 'wrap' }}>
                <Avatar user={r.proposedBy} size={36} />
                <span className="grow player-name">
                  <PlayerName user={r.proposedBy} /> ti propone una rivalità
                </span>
                <Button size="sm" variant="primary" disabled={busy} onClick={() => act(() => api(`/rivalries/${r.id}/accept`, { method: 'POST' }), 'Rivalità accettata.')}>
                  Accetta
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api(`/rivalries/${r.id}/decline`, { method: 'POST' }), 'Proposta rifiutata.')}>
                  Rifiuta
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid-2">
        <Card aria-labelledby="active-title">
          <CardHeader id="active-title" eyebrow="Scelte dai giocatori" title="Rivalità dichiarate" icon="flame" />
          {active.length ? (
            <ul className="list">
              {active.map((r) => (
                <li key={r.id}>
                  <Pair users={r.users} summary={r.summary} to={vsLink(r.users[0], r.users[1])} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nessuna rivalità dichiarata. Sfida qualcuno qui sotto.</p>
          )}
          {mineSent.length > 0 && (
            <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
              In attesa di risposta: {mineSent.map((r) => r.users.find((u) => u.id !== user.id)?.name).join(', ')}.
            </p>
          )}
        </Card>
        <Card aria-labelledby="auto-title">
          <CardHeader id="auto-title" eyebrow="Nate dai risultati" title="Rivalità naturali" icon="rivalry" />
          {data.auto.length ? (
            <ul className="list">
              {data.auto.map((r) => (
                <li key={r.users.map((u) => u.id).join()}>
                  <Pair users={r.users} summary={r.opposed} to={vsLink(r.users[0], r.users[1])} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="Ancora nessuna">Servono almeno 3 scontri diretti tra due giocatori.</EmptyState>
          )}
        </Card>
      </div>

      <Card aria-labelledby="challenge-title">
        <CardHeader id="challenge-title" eyebrow="Facoltativo" title="Sfida un compagno" icon="target" />
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (target) act(() => api(`/groups/${group.id}/rivalries`, { method: 'POST', body: { targetUserId: target } }), 'Sfida inviata: deve accettarla.');
          }}
        >
          <label className="visually-hidden" htmlFor="rival-target">
            Chi vuoi sfidare
          </label>
          <select id="rival-target" className="select" style={{ flex: '1 1 220px' }} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Scegli un compagno…</option>
            {data.members
              .filter((m) => m.user.id !== user.id)
              .map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                  {m.user.nickname ? ` «${m.user.nickname}»` : ''}
                </option>
              ))}
          </select>
          <Button type="submit" variant="primary" icon="rivalry" disabled={!target || busy}>
            Proponi la rivalità
          </Button>
          {target && (
            <Button variant="ghost" to={`/gruppi/${group.id}/rivalita/${user.id}?with=${target}`}>
              Guarda prima il testa a testa
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
