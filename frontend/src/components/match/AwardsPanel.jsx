import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../Icon';
import { Avatar, PlayerName } from '../Avatar';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';
import { useToast } from '../../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../../context/RealtimeContext';

const ICON = { portiere: 'shield', difensore: 'shield', bomber: 'ball', sorpresa: 'sparkles', ironico: 'smile' };
const MODE = { voto: 'Si vota', automatico: 'Dai marcatori', assegnato: "Scelto dall'organizzatore" };

/** Premiazione di un premio assegnato: ingresso animato (statico se si riducono le animazioni). */
function Winners({ award }) {
  const reduce = useReducedMotion();
  if (!award.winners.length) {
    return <p className="muted">{award.mode === 'automatico' ? 'Nessun marcatore inserito: questo premio resta senza vincitore.' : 'Nessun voto: stavolta nessun vincitore.'}</p>;
  }
  return (
    <div role="status">
    <ul className="award-winners">
      {award.winners.map((u, i) => (
        <motion.li
          key={u.id}
          className="award-winner"
          initial={reduce ? false : { opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.12 * i, type: 'spring', stiffness: 260, damping: 20 }}
        >
          <Avatar user={u} size={44} />
          <span>
            <span className="player-sub">{award.label}</span>
            <span className="player-name">
              <PlayerName user={u} />
            </span>
          </span>
          <Icon name="award" />
        </motion.li>
      ))}
    </ul>
    </div>
  );
}

function Award({ award, players, meId, matchId, canManage, onChanged }) {
  const toast = useToast();
  const [nominee, setNominee] = useState('');
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const candidates = players.filter((p) => p.id !== meId);
  const isPlayer = players.some((p) => p.id === meId);

  const run = async (path, body, ok) => {
    setBusy(true);
    try {
      await api(`/matches/${matchId}/awards/${award.key}/${path}`, { method: 'POST', body });
      toast.success(ok);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="award stack" aria-label={award.label}>
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <h3 className="section-title">
          <Icon name={ICON[award.key] || 'award'} /> {award.label}
        </h3>
        <span className="chip">{MODE[award.mode]}</span>
      </div>

      {award.decided ? (
        <Winners award={award} />
      ) : award.open ? (
        <>
          <p className="muted">
            {award.votedCount}/{award.eligibleCount} hanno votato.{' '}
            {isPlayer ? (award.myVote ? 'Hai votato: i risultati si vedono a votazione chiusa.' : 'Un voto a testa, anonimo.') : 'Votano i giocatori della partita.'}
          </p>
          {isPlayer && !award.myVote && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (nominee) run('vote', { nominee }, 'Voto registrato!');
              }}
            >
              <label className="visually-hidden" htmlFor={`nom-${award.key}`}>
                Chi voti per {award.label}
              </label>
              <select id={`nom-${award.key}`} className="select" value={nominee} onChange={(e) => setNominee(e.target.value)} style={{ flex: '1 1 180px' }}>
                <option value="">Scegli un compagno…</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname ? `${p.name} «${p.nickname}»` : p.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary" disabled={!nominee || busy}>
                Vota
              </button>
            </form>
          )}
        </>
      ) : (
        <p className="muted">Votazione chiusa.</p>
      )}

      {canManage && award.mode !== 'automatico' && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (assignee) run('assign', { userIds: [assignee] }, 'Premio assegnato.');
          }}
        >
          <label className="visually-hidden" htmlFor={`ass-${award.key}`}>
            Assegna direttamente {award.label}
          </label>
          <select id={`ass-${award.key}`} className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ flex: '1 1 180px' }}>
            <option value="">Assegna tu il premio…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname ? `${p.name} «${p.nickname}»` : p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary" disabled={!assignee || busy}>
            Assegna
          </button>
        </form>
      )}
    </article>
  );
}

/** Premi di partita opzionali; non compare se l'admin non ne ha attivati. */
export default function AwardsPanel({ match, meId, canManage }) {
  const { data, reload } = useResource(() => api(`/matches/${match.id}/awards`), [match.id, match.voting?.closed]);
  useRealtimeEvent('voting:updated', (v) => v.matchId === match.id && reload());
  useOnReconnect(reload);
  const awards = data?.awards;
  if (!awards?.enabled) return null;
  return (
    <section className="card stack" aria-labelledby="awards-title" id="premi">
      <h2 id="awards-title" className="section-title">
        <Icon name="award" /> Premi della serata
      </h2>
      {awards.awards.map((a) => (
        <Award key={a.key} award={a} players={awards.players} meId={meId} matchId={match.id} canManage={canManage} onChanged={reload} />
      ))}
    </section>
  );
}
