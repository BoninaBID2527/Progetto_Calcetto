import { useState } from 'react';
import Icon from '../Icon';
import { Player, PlayerName } from '../Avatar';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Stepper } from '../../pages/NewMatch';

export function Scoreboard({ match }) {
  const { result, teams } = match;
  const winner = result.scoreA === result.scoreB ? null : result.scoreA > result.scoreB ? 'a' : 'b';
  return (
    <div className="scoreboard" aria-label={`Risultato: ${teams.a.name} ${result.scoreA}, ${teams.b.name} ${result.scoreB}`}>
      <span className={`team-name ${winner === 'a' ? 'winner' : ''}`}>{teams.a.name}</span>
      <span className="score">
        {result.scoreA}
        <span>-</span>
        {result.scoreB}
      </span>
      <span className={`team-name ${winner === 'b' ? 'winner' : ''}`}>{teams.b.name}</span>
    </div>
  );
}

function ResultForm({ match, onSaved }) {
  const toast = useToast();
  const [score, setScore] = useState({ a: match.result?.scoreA ?? 0, b: match.result?.scoreB ?? 0 });
  const [goals, setGoals] = useState(() => Object.fromEntries((match.result?.scorers || []).map((s) => [s.user.id, s.goals])));
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const scorers = Object.entries(goals)
        .filter(([, g]) => g > 0)
        .map(([userId, g]) => ({ userId, goals: g }));
      const res = await api(`/matches/${match.id}/result`, { method: 'PUT', body: { scoreA: score.a, scoreB: score.b, scorers } });
      onSaved(res.match);
      toast.success(match.result ? 'Risultato corretto.' : 'Risultato salvato: votazioni aperte!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="team-columns">
        {['a', 'b'].map((side) => (
          <div key={side} className="team-box stack" style={{ '--team-color': side === 'a' ? '#F2F7F4' : '#0B1F1A', gap: 'var(--space-3)' }}>
            <div className="field">
              <label className="label" htmlFor={`score-${side}`}>
                Gol {match.teams[side].name}
              </label>
              <Stepper id={`score-${side}`} label={`gol ${match.teams[side].name}`} value={score[side]} min={0} max={99} onChange={(v) => setScore({ ...score, [side]: v })} />
            </div>
            <span className="label">Marcatori (facoltativo)</span>
            <ul className="people">
              {match.teams[side].players.map((u) => (
                <li key={u.id}>
                  <span className="grow">
                    <Player user={u} size={30} />
                  </span>
                  <span className="stepper">
                    <button type="button" className="btn btn-sm btn-icon" aria-label={`Togli un gol a ${u.name}`} onClick={() => setGoals({ ...goals, [u.id]: Math.max(0, (goals[u.id] || 0) - 1) })}>
                      –
                    </button>
                    <span className="num" style={{ minWidth: 24, textAlign: 'center' }} aria-label={`${goals[u.id] || 0} gol`}>
                      {goals[u.id] || 0}
                    </span>
                    <button type="button" className="btn btn-sm btn-icon" aria-label={`Aggiungi un gol a ${u.name}`} onClick={() => setGoals({ ...goals, [u.id]: (goals[u.id] || 0) + 1 })}>
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
        <Icon name="flag" /> {match.result ? 'Correggi il risultato' : 'Salva il risultato'}
      </button>
    </form>
  );
}

export default function ResultPanel({ match, canManage, onUpdated, hasReport = false }) {
  const [editing, setEditing] = useState(false);
  if (!match.teams) return null;
  const canEnter = canManage && (match.status === 'chiusa' || match.status === 'giocata');

  if (!match.result) {
    if (!canManage) return null;
    return (
      <section className="card stack" aria-labelledby="result-title">
        <h2 id="result-title" className="section-title">
          <Icon name="flag" /> Risultato
        </h2>
        {match.status === 'aperta' ? (
          <p className="muted">Chiudi le iscrizioni quando si gioca: poi potrai inserire il risultato.</p>
        ) : (
          <ResultForm match={match} onSaved={onUpdated} />
        )}
      </section>
    );
  }

  // Con la pagella visibile il tabellone c'è già: qui resta solo la correzione per chi gestisce.
  if (hasReport && !(canEnter && match.status === 'giocata')) return null;

  return (
    <section className="card stack" aria-labelledby="result-title">
      <div className="spread">
        <h2 id="result-title" className="section-title">
          <Icon name="flag" /> {hasReport ? 'Correggi il risultato' : 'Risultato'}
        </h2>
        {canEnter && match.status === 'giocata' && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            <Icon name="edit" /> {editing ? 'Chiudi' : 'Correggi'}
          </button>
        )}
      </div>
      {!hasReport && <Scoreboard match={match} />}
      {hasReport && !editing && <p className="muted">Hai sbagliato un gol? Correggi il risultato: classifiche e pagella si aggiornano.</p>}
      {!hasReport && match.result.scorers.length > 0 && (
        <p className="kv" style={{ flexWrap: 'wrap' }}>
          <Icon name="ball" />
          <span>
            {match.result.scorers.map((s, i) => (
              <span key={s.user.id}>
                {i > 0 && ', '}
                <strong>
                  <PlayerName user={s.user} />
                </strong>
                {s.goals > 1 && ` (${s.goals})`}
              </span>
            ))}
          </span>
        </p>
      )}
      {editing && <ResultForm match={match} onSaved={(m) => { onUpdated(m); setEditing(false); }} />}
    </section>
  );
}
