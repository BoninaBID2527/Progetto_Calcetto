import { useState } from 'react';
import Icon from '../Icon';
import Pitch from '../Pitch';
import { Player } from '../Avatar';
import { Modal } from '../ui';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';

function ManualEditor({ match, onClose, onSaved }) {
  const confirmed = match.participants.filter((p) => p.response === 'ci_sono').map((p) => p.user);
  const initialA = match.teams?.a.players.map((u) => u.id) || confirmed.filter((_, i) => i % 2 === 0).map((u) => u.id);
  const [sideOf, setSideOf] = useState(() => Object.fromEntries(confirmed.map((u) => [u.id, initialA.includes(u.id) ? 'a' : 'b'])));
  const [names, setNames] = useState({ a: match.teams?.a.name || 'Maglie chiare', b: match.teams?.b.name || 'Maglie scure' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    setBusy(true);
    try {
      const players = (side) => confirmed.filter((u) => sideOf[u.id] === side).map((u) => u.id);
      const res = await api(`/matches/${match.id}/teams`, {
        method: 'PUT',
        body: { a: { name: names.a, players: players('a') }, b: { name: names.b, players: players('b') } },
      });
      onSaved(res.match);
      toast.success('Squadre salvate.');
      onClose();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Squadre a mano" onClose={onClose}>
      <div className="team-columns">
        {['a', 'b'].map((side) => (
          <div key={side} className="team-box" style={{ '--team-color': side === 'a' ? '#F2F7F4' : '#0B1F1A' }}>
            <label className="field">
              <span className="label">Nome squadra</span>
              <input className="input" value={names[side]} maxLength={30} onChange={(e) => setNames({ ...names, [side]: e.target.value })} />
            </label>
            <ul className="people" style={{ marginTop: 8 }}>
              {confirmed
                .filter((u) => sideOf[u.id] === side)
                .map((u) => (
                  <li key={u.id}>
                    <span className="grow">
                      <Player user={u} size={32} showRole />
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setSideOf({ ...sideOf, [u.id]: side === 'a' ? 'b' : 'a' })}
                      aria-label={`Sposta ${u.name} in ${side === 'a' ? names.b : names.a}`}
                    >
                      <Icon name={side === 'a' ? 'chevron-right' : 'chevron-left'} /> Sposta
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 'var(--space-4)' }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          Salva squadre
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Annulla
        </button>
      </div>
    </Modal>
  );
}

export default function TeamsPanel({ match, canManage, onUpdated }) {
  const toast = useToast();
  const [drawKey, setDrawKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [strength, setStrength] = useState(null);
  const confirmed = match.participants.filter((p) => p.response === 'ci_sono').map((p) => p.user);
  const editable = canManage && ['aperta', 'chiusa'].includes(match.status);
  const inTeams = new Set([...(match.teams?.a.players || []), ...(match.teams?.b.players || [])].map((u) => u.id));
  const benched = match.teams ? confirmed.filter((u) => !inTeams.has(u.id)) : [];

  const balance = async () => {
    setBusy(true);
    try {
      const res = await api(`/matches/${match.id}/teams/balance`, { method: 'POST', body: {} });
      onUpdated(res.match);
      setStrength(res.strength);
      setDrawKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!match.teams && confirmed.length < 2) {
    return (
      <section className="card stack" aria-labelledby="teams-title">
        <h2 id="teams-title" className="section-title">
          <Icon name="shield" /> Squadre
        </h2>
        <p className="muted">Le squadre si fanno quando ci sono almeno due giocatori. Per ora il campo aspetta.</p>
      </section>
    );
  }

  return (
    <section className="card stack" aria-labelledby="teams-title">
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <h2 id="teams-title" className="section-title">
          <Icon name="shield" /> Squadre
        </h2>
        {editable && (
          <div className="btn-row">
            <button type="button" className="btn btn-accent" onClick={balance} disabled={busy || confirmed.length < 2}>
              <Icon name="scale" /> {match.teams ? 'Rigenera' : 'Bilancia'}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)} disabled={confirmed.length < 2}>
              <Icon name="edit" /> A mano
            </button>
          </div>
        )}
      </div>
      {match.teams ? (
        <>
          <Pitch key={drawKey} teams={match.teams} drawing={drawKey > 0} />
          <div className="row muted" style={{ fontSize: '0.88rem' }}>
            <span>{match.teams.method === 'bilancia' ? 'Fatte con «Bilancia» in base ai voti ricevuti (5 per chi è nuovo).' : "Fatte a mano dall'organizzatore."}</span>
            {strength && (
              <span className="chip">
                Forza {strength.a.toFixed(1).replace('.', ',')} contro {strength.b.toFixed(1).replace('.', ',')}
              </span>
            )}
          </div>
          {benched.length > 0 && (
            <p className="form-alert" style={{ background: 'var(--c-yellow-soft)', color: 'var(--c-yellow-text)' }}>
              <Icon name="info" />
              <span>
                Senza squadra: {benched.map((u) => u.name).join(', ')}. {editable ? 'Rigenera o sistemale a mano.' : ''}
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="muted">{editable ? 'Premi «Bilancia» per dividere i presenti in due squadre equilibrate, oppure falle a mano.' : "Le squadre le fa l'organizzatore: arriveranno a breve."}</p>
      )}
      {editing && <ManualEditor match={match} onClose={() => setEditing(false)} onSaved={onUpdated} />}
    </section>
  );
}
