import { useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import ClubCrest from '../components/club/ClubCrest';
import Kit from '../components/club/Kit';
import { Avatar, PlayerName } from '../components/Avatar';
import { Card, CardHeader, CardSkeleton, ErrorState, FormAlert, FormField, StatCard } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../context/ToastContext';
import { useAppData } from '../context/AppDataContext';
import { useRealtimeEvent } from '../context/RealtimeContext';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LIMITS = { crest: 128 * 1024, cover: 700 * 1024 };
const date = (d) => new Date(d).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });

function Leader({ title, data, unit }) {
  return (
    <li className="list-item">
      <span className="grow">
        <span className="player-sub">{title}</span>
        {data ? (
          <span className="hof-holders">
            {data.users.map((u) => (
              <span key={u.id} className="hof-holder">
                <Avatar user={u} size={26} />
                <PlayerName user={u} />
              </span>
            ))}
            {data.others > 0 && <span className="player-sub">a pari merito con altri {data.others}</span>}
          </span>
        ) : (
          <span className="muted">Dati non ancora disponibili</span>
        )}
      </span>
      {data && (
        <span className="num" aria-label={`${data.value} ${unit}`}>
          {data.value}
        </span>
      )}
    </li>
  );
}

function ImageUpload({ kind, label, hint, group, onDone }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const has = kind === 'crest' ? Boolean(group.crestUrl) : group.hasCover;

  const send = async (file) => {
    setError(null);
    if (!TYPES.includes(file.type)) return setError('Usa un\'immagine PNG, JPEG o WebP (niente SVG).');
    if (file.size > LIMITS[kind]) return setError(`Il file pesa troppo: massimo ${LIMITS[kind] / 1024} KB.`);
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      await api(`/groups/${group.id}/club/${kind}`, { method: 'PUT', body: form });
      toast.success(`${label} aggiornato.`);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/groups/${group.id}/club/${kind}`, { method: 'DELETE' });
      toast.success(`${label} rimosso.`);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input ref={input} id={`up-${kind}`} className="visually-hidden" type="file" accept={TYPES.join(',')} onChange={(e) => e.target.files[0] && send(e.target.files[0])} />
        <label htmlFor={`up-${kind}`} className="btn btn-secondary" aria-disabled={busy}>
          <Icon name="upload" /> {has ? 'Sostituisci' : 'Carica'}
        </label>
        {has && (
          <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>
            <Icon name="trash" /> Rimuovi
          </button>
        )}
      </div>
      <span className="player-sub" style={{ whiteSpace: 'normal' }}>{hint}</span>
      <FormAlert>{error}</FormAlert>
    </div>
  );
}

function ColorField({ label, value, fallback, onChange }) {
  return (
    <FormField label={label}>
      {(p) => <input {...p} className="input" type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} style={{ padding: 4, height: 44, minWidth: 80 }} />}
    </FormField>
  );
}

function Editor({ group, onChanged }) {
  const toast = useToast();
  const { refreshGroups } = useAppData();
  const [form, setForm] = useState({
    motto: group.motto || '',
    secondaryColor: group.secondaryColor || '',
    light: { ...group.kits.light },
    dark: { ...group.kits.dark },
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/groups/${group.id}`, {
        method: 'PATCH',
        body: { motto: form.motto, secondaryColor: form.secondaryColor || null, kits: { light: clean(form.light), dark: clean(form.dark) } },
      });
      await refreshGroups();
      toast.success('Identità del club salvata.');
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="club-edit">
      <CardHeader id="club-edit" eyebrow="Solo admin" title="Personalizza il club" icon="sliders" />
      <div className="stack">
        <ImageUpload kind="crest" label="Stemma" hint="PNG, JPEG o WebP quadrato, massimo 128 KB. Niente SVG." group={group} onDone={onChanged} />
        <ImageUpload kind="cover" label="Copertina" hint="PNG, JPEG o WebP orizzontale, massimo 700 KB." group={group} onDone={onChanged} />
        <form className="stack" onSubmit={save} noValidate>
          <FormAlert>{error?.message}</FormAlert>
          <FormField label="Motto (facoltativo)" error={error?.fields?.motto}>
            {(p) => <input {...p} className="input" maxLength={80} placeholder="Mai sotto di due gol" value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} />}
          </FormField>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <ColorField label="Colore secondario" value={form.secondaryColor} fallback="#C7FF36" onChange={(v) => setForm({ ...form, secondaryColor: v })} />
          </div>
          {['light', 'dark'].map((side) => (
            <fieldset key={side} className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">Maglia {side === 'light' ? 'chiara' : 'scura'}</legend>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <ColorField label="Corpo" value={form[side].primary} fallback={side === 'light' ? '#F4F8F2' : '#1B1F1D'} onChange={(v) => setForm({ ...form, [side]: { ...form[side], primary: v } })} />
                <ColorField label="Dettagli e numero" value={form[side].secondary} fallback={side === 'light' ? '#111915' : '#C7FF36'} onChange={(v) => setForm({ ...form, [side]: { ...form[side], secondary: v } })} />
              </div>
            </fieldset>
          ))}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Salva identità
          </button>
        </form>
      </div>
    </Card>
  );
}

export default function Club() {
  const { group } = useOutletContext();
  const { refreshGroups } = useAppData();
  const { data, error, loading, reload } = useResource(() => api(`/groups/${group.id}/club`), [group.id, group.crestUrl, group.motto, group.hasCover]);
  useRealtimeEvent('group:updated', (e) => e.groupId === group.id && (reload(), refreshGroups()));

  if (loading && !data) {
    return (
      <div className="page">
        <CardSkeleton lines={5} />
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
  const { identity, stats } = data.club;
  const accent = identity.secondaryColor || identity.color;
  const changed = () => {
    refreshGroups();
    reload();
  };

  return (
    <div className="page">
      <section className="club-hero" style={{ '--club-1': identity.color, '--club-2': accent }} aria-label="Identità del club">
        {identity.coverUrl && <img className="club-cover" src={identity.coverUrl} alt="" />}
        <div className="club-hero-body">
          <ClubCrest group={identity} size={96} />
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="club-name">{identity.name}</h2>
            {identity.motto ? <p className="club-motto">«{identity.motto}»</p> : <p className="club-motto muted">Nessun motto: lo sceglie un admin.</p>}
            {identity.description && <p className="muted">{identity.description}</p>}
          </div>
        </div>
      </section>

      <div className="grid-main-side">
        <div className="stack">
          <section className="grid stats-grid" aria-label="Statistiche del club">
            <StatCard label="Partite giocate" value={stats.matches} />
            <StatCard label="Gol segnati" value={stats.goals} hint={stats.goalsPerMatch === null ? 'Nessuna partita' : `${String(stats.goalsPerMatch).replace('.', ',')} a partita`} />
            <StatCard label="Giocatori" value={stats.members} hint={`Dal ${date(stats.since)}`} />
            <StatCard label="MVP assegnati" value={stats.mvpAwarded} hint={stats.activeSeason ? stats.activeSeason.label : 'Fuori stagione'} />
          </section>
          <Card aria-labelledby="club-leaders">
            <CardHeader id="club-leaders" title="Nel club" icon="crown" />
            <ul className="list">
              <Leader title="Capocannoniere di sempre" data={stats.topScorer} unit="gol" />
              <Leader title="Più presenze" data={stats.mostPresent} unit="presenze" />
              <Leader title="Più MVP" data={stats.mostMvp} unit="MVP" />
            </ul>
          </Card>
        </div>
        <div className="stack">
          <Card aria-labelledby="club-kits">
            <CardHeader id="club-kits" title="Le maglie" icon="kit" />
            <div className="kits">
              <figure>
                <Kit primary={identity.kits.light.primary || '#F4F8F2'} secondary={identity.kits.light.secondary || '#111915'} label="Maglia chiara" />
                <figcaption>Chiara</figcaption>
              </figure>
              <figure>
                <Kit primary={identity.kits.dark.primary || '#1B1F1D'} secondary={identity.kits.dark.secondary || identity.color} label="Maglia scura" />
                <figcaption>Scura</figcaption>
              </figure>
            </div>
          </Card>
          {group.myRole === 'admin' && <Editor group={identity} onChanged={changed} />}
        </div>
      </div>
    </div>
  );
}
