import ClubCrest from '../components/club/ClubCrest';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { CardSkeleton, EmptyState, FormAlert, FormField } from '../components/ui';
import { api } from '../api/client';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const EMOJIS = ['⚽', '🥅', '🏆', '🔥', '⚡', '🦁', '🐺', '🍺'];
const COLORS = ['#2EE59D', '#FF8A3D', '#FFD23F', '#4CC9F0', '#C9A0FF', '#FF7AA2'];

export function GroupForm({ initial = {}, onSubmit, submitLabel, busy, error }) {
  const [form, setForm] = useState({ name: '', description: '', emoji: '⚽', color: '#2EE59D', ...initial });
  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <FormAlert>{error && !Object.keys(error.fields).length ? error.message : null}</FormAlert>
      <FormField label="Nome del gruppo" error={error?.fields.name}>
        {(p) => <input {...p} className="input" placeholder="Calcetto del giovedì" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
      </FormField>
      <FormField label="Descrizione (facoltativa)" error={error?.fields.description}>
        {(p) => (
          <textarea {...p} className="textarea" placeholder="Chi siamo, quando giochiamo, regole della casa…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        )}
      </FormField>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Simbolo</legend>
        <div className="row" role="radiogroup" aria-label="Simbolo del gruppo">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              role="radio"
              aria-checked={form.emoji === em}
              aria-label={`Simbolo ${em}`}
              className="btn btn-icon"
              style={form.emoji === em ? { borderColor: 'var(--c-primary)', background: 'var(--c-primary-soft)' } : undefined}
              onClick={() => setForm({ ...form, emoji: em })}
            >
              <span style={{ fontSize: '1.3rem' }} aria-hidden="true">
                {em}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Colore</legend>
        <div className="row" role="radiogroup" aria-label="Colore del gruppo">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={form.color === c}
              aria-label={`Colore ${c}`}
              className="btn btn-icon"
              style={{ background: c, borderColor: form.color === c ? 'var(--c-text)' : c, boxShadow: form.color === c ? '0 0 0 3px var(--c-bg), 0 0 0 5px var(--c-text)' : undefined }}
              onClick={() => setForm({ ...form, color: c })}
            />
          ))}
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? 'Un attimo…' : submitLabel}
      </button>
    </form>
  );
}

export default function Groups() {
  const { groups, refreshGroups } = useAppData();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [createState, setCreateState] = useState({ busy: false, error: null });
  const [code, setCode] = useState('');
  const [joinState, setJoinState] = useState({ busy: false, error: null });

  const create = async (form) => {
    setCreateState({ busy: true, error: null });
    try {
      const { group } = await api('/groups', { method: 'POST', body: form });
      await refreshGroups();
      toast.success(`Gruppo "${group.name}" creato: ora invita gli amici!`);
      navigate(`/gruppi/${group.id}/membri`);
    } catch (error) {
      setCreateState({ busy: false, error });
    }
  };

  const join = async (e) => {
    e.preventDefault();
    setJoinState({ busy: true, error: null });
    try {
      const { group } = await api('/groups/join', { method: 'POST', body: { code: code.trim() } });
      await refreshGroups();
      toast.success(`Benvenuto in ${group.name}!`);
      navigate(`/gruppi/${group.id}/partite`);
    } catch (error) {
      setJoinState({ busy: false, error });
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Ciao {user?.name?.split(' ')[0]}</span>
          <h1>I tuoi gruppi</h1>
          <p>Puoi stare in più gruppi: quello del giovedì, quello dei colleghi, quello delle rivincite.</p>
        </div>
      </div>

      {groups === null ? (
        <div className="grid">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState title="Ancora nessun gruppo">Crea il gruppo del tuo calcetto oppure entra con il codice che ti hanno mandato.</EmptyState>
      ) : (
        <div className="grid">
          {groups.map((g) => (
            <Link key={g.id} to={`/gruppi/${g.id}/partite`} className="card group-tile" style={{ '--group-color': g.color }}>
              <ClubCrest group={g} size={60} />
              <span className="stack" style={{ gap: 4, flex: 1 }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', textTransform: 'uppercase', lineHeight: 1.1 }}>{g.name}</strong>
                <span className="muted">
                  {g.memberCount} {g.memberCount === 1 ? 'membro' : 'membri'} · {g.myRole === 'admin' ? 'sei admin' : 'membro'}
                </span>
              </span>
              {g.unreadCount > 0 && <span className="badge-count" aria-label={`${g.unreadCount} messaggi non letti`}>{g.unreadCount}</span>}
              <Icon name="chevron-right" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid-2">
        <section className="card" aria-labelledby="join-title">
          <div className="card-title">
            <h2 id="join-title" className="section-title">
              <Icon name="enter" /> Entra con un codice
            </h2>
          </div>
          <form className="form" onSubmit={join} noValidate>
            <FormAlert>{joinState.error && !joinState.error.fields.code ? joinState.error.message : null}</FormAlert>
            <FormField label="Codice d'invito (6 caratteri)" error={joinState.error?.fields.code}>
              {(p) => (
                <input
                  {...p}
                  className="input num"
                  style={{ fontSize: '1.6rem', letterSpacing: '0.3em', textTransform: 'uppercase' }}
                  maxLength={6}
                  autoComplete="off"
                  placeholder="AB3K9Q"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              )}
            </FormField>
            <button type="submit" className="btn btn-primary" disabled={joinState.busy || code.trim().length !== 6}>
              Entra nel gruppo
            </button>
          </form>
        </section>
        <section className="card" aria-labelledby="create-title">
          <div className="card-title">
            <h2 id="create-title" className="section-title">
              <Icon name="plus" /> Crea un gruppo
            </h2>
          </div>
          <GroupForm onSubmit={create} submitLabel="Crea il gruppo" busy={createState.busy} error={createState.error} />
        </section>
      </div>
    </div>
  );
}
