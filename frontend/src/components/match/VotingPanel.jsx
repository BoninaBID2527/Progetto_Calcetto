import { useState } from 'react';
import Icon from '../Icon';
import { Avatar, PlayerName } from '../Avatar';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';

function Ratings({ match, voting, meId, onChange }) {
  const toast = useToast();
  const others = voting.players.filter((p) => p.id !== meId);
  const [scores, setScores] = useState(voting.ratings.mine);
  const [busy, setBusy] = useState(false);
  const dirty = others.some((p) => scores[p.id] && scores[p.id] !== voting.ratings.mine[p.id]);

  const save = async () => {
    setBusy(true);
    try {
      const ratings = Object.entries(scores).map(([userId, score]) => ({ userId, score }));
      const res = await api(`/matches/${match.id}/ratings`, { method: 'POST', body: { ratings } });
      onChange(res.voting);
      toast.success('Pagelle salvate. Restano anonime.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <h3>Voti in pagella (facoltativi)</h3>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        Da 1 a 10, anonimi. Servono a bilanciare meglio le prossime squadre. Puoi cambiarli finché la votazione è aperta.
      </p>
      <div>
        {others.map((p) => (
          <div key={p.id} className="rating-row">
            <span className="player">
              <Avatar user={p} size={32} />
              <span className="player-name">
                <PlayerName user={p} />
              </span>
            </span>
            <div className="rating-scale" role="radiogroup" aria-label={`Voto a ${p.name}`}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" role="radio" aria-checked={scores[p.id] === n} aria-label={`${n}`} onClick={() => setScores({ ...scores, [p.id]: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn" onClick={save} disabled={busy || !dirty}>
        <Icon name="check" /> Salva le pagelle
      </button>
    </div>
  );
}

export default function VotingPanel({ match, voting, meId, onChange }) {
  const toast = useToast();
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!voting?.mvp) return null;
  const { mvp } = voting;
  const candidates = voting.players.filter((p) => p.id !== meId);

  const vote = async () => {
    setBusy(true);
    try {
      const res = await api(`/matches/${match.id}/mvp-vote`, { method: 'POST', body: { mvpUserId: choice } });
      onChange(res.voting);
      toast.success('Voto registrato. Nessuno saprà per chi.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const winners = voting.players.filter((p) => mvp.winners.includes(p.id));

  return (
    <section className="card stack" id="votazioni" aria-labelledby="mvp-title">
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <h2 id="mvp-title" className="section-title">
          <Icon name="star" /> MVP della serata
        </h2>
        <span className={`chip ${mvp.open ? 'chip-yellow' : ''}`}>
          {mvp.open ? `Si vota fino a ${formatDateTime(mvp.closesAt)}` : 'Votazione chiusa'}
        </span>
      </div>
      <div className="slots">
        <div className="slots-head">
          <span className="muted">Hanno votato</span>
          <span className="num">
            {mvp.votedCount}/{mvp.eligibleCount}
          </span>
        </div>
        <div className="slots-bar" aria-hidden="true">
          <span style={{ width: `${(mvp.votedCount / Math.max(1, mvp.eligibleCount)) * 100}%`, background: 'var(--c-yellow)' }} />
        </div>
      </div>

      {!mvp.open && (
        <div className="ceremony" style={{ padding: 'var(--space-4)' }}>
          {winners.length ? (
            <>
              <span className="eyebrow" style={{ color: 'var(--c-yellow-text)' }}>
                {winners.length > 1 ? 'MVP condiviso' : 'MVP'}
              </span>
              <div className="row" style={{ justifyContent: 'center' }}>
                {winners.map((w) => (
                  <div key={w.id} className="stack" style={{ justifyItems: 'center', gap: 6 }}>
                    <Avatar user={w} size={84} />
                    <strong style={{ fontSize: '1.1rem' }}>
                      <PlayerName user={w} />
                    </strong>
                  </div>
                ))}
              </div>
              <ul className="rank-rows" style={{ width: '100%', textAlign: 'left' }}>
                {mvp.results.map((r) => (
                  <li key={r.user.id} className="rank-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <span className="body">
                      <span className="player-name">
                        <PlayerName user={r.user} />
                      </span>
                      <span className="progress">
                        <span style={{ width: `${(r.votes / mvp.results[0].votes) * 100}%` }} />
                      </span>
                    </span>
                    <span className="value">{r.votes}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">Nessun voto: stavolta niente stella.</p>
          )}
        </div>
      )}

      {mvp.open && voting.isPlayer && !mvp.hasVoted && (
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <p className="muted">Un solo voto, non puoi votare te stesso. Scegli bene.</p>
          <div className="vote-grid" role="radiogroup" aria-label="Scegli l'MVP">
            {candidates.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={choice === p.id} className="vote-option" onClick={() => setChoice(p.id)}>
                <Avatar user={p} size={36} />
                <span className="player-name">
                  <PlayerName user={p} />
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={vote} disabled={!choice || busy}>
            <Icon name="star" /> Vota MVP
          </button>
        </div>
      )}
      {mvp.open && mvp.hasVoted && (
        <p className="chip chip-primary" style={{ justifySelf: 'start' }}>
          <Icon name="check" /> Hai votato. Il tuo voto resta anonimo.
        </p>
      )}
      {mvp.open && !voting.isPlayer && <p className="muted">Votano solo i giocatori di questa partita.</p>}
      {mvp.open && voting.isPlayer && <Ratings match={match} voting={voting} meId={meId} onChange={onChange} />}
    </section>
  );
}
