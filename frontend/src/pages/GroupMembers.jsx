import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import { Player } from '../components/Avatar';
import { CardSkeleton, ErrorState, FormAlert, FormField, Modal, Segmented, useConfirm } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { PRIZE_OPTIONS, roleLabel, footLabel } from '../config';
import { timeAgo } from '../utils/format';
import { GroupForm } from './Groups';

const STATUS_LABEL = { attivo: 'attivo', sostituito: 'sostituito', rifiutato: 'rifiutato', rimosso: 'rimosso da un admin' };

function NicknameDialog({ group, member, meId, isAdmin, onClose, onChanged }) {
  const toast = useToast();
  const self = member.user.id === meId;
  const { data, reload } = useResource(() => api(`/groups/${group.id}/nicknames?userId=${member.user.id}`), [member.user.id]);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const history = data?.nicknames || [];
  const active = history.find((n) => n.status === 'attivo');

  const act = async (fn, message) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast.success(message);
      setText('');
      await reload();
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (self && active) {
      act(() => api(`/groups/${group.id}/nicknames/${active.id}/replace`, { method: 'POST', body: { text } }), 'Soprannome sostituito.');
    } else {
      act(() => api(`/groups/${group.id}/nicknames`, { method: 'POST', body: { targetUserId: member.user.id, text } }), 'Soprannome assegnato!');
    }
  };

  return (
    <Modal title={self ? 'Il tuo soprannome' : `Soprannome per ${member.user.name}`} onClose={onClose}>
      <div className="stack">
        {active ? (
          <div className="card card-flat stack" style={{ background: 'var(--c-surface-2)', gap: 'var(--space-2)' }}>
            <span className="muted">Soprannome attuale</span>
            <strong className="nickname" style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>
              «{active.text}»
            </strong>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Proposto da {active.proposer.name} · {timeAgo(active.createdAt)}
            </span>
            <div className="btn-row">
              {self && (
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => act(() => api(`/groups/${group.id}/nicknames/${active.id}/reject`, { method: 'POST' }), 'Soprannome rifiutato.')}>
                  <Icon name="x" /> Rifiuta
                </button>
              )}
              {isAdmin && !self && (
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => act(() => api(`/groups/${group.id}/nicknames/${active.id}`, { method: 'DELETE' }), 'Soprannome rimosso.')}>
                  <Icon name="trash" /> Rimuovi (admin)
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">{self ? 'Nessun soprannome per ora. Puoi sceglierne uno tu.' : 'Ancora nessun soprannome: tocca a te inventarlo.'}</p>
        )}

        <form className="form" onSubmit={submit} noValidate>
          <FormAlert>{error && !error.fields.text ? error.message : null}</FormAlert>
          <FormField label={self ? (active ? 'Sostituiscilo con' : 'Scegli il tuo soprannome') : 'Nuovo soprannome'} error={error?.fields.text} hint="Simpatico sì, offensivo no: il destinatario può rifiutarlo.">
            {(p) => <input {...p} className="input" maxLength={30} placeholder="Il Muro, Cesarini, Turbo…" value={text} onChange={(e) => setText(e.target.value)} />}
          </FormField>
          <button type="submit" className="btn btn-primary" disabled={busy || text.trim().length < 2}>
            <Icon name="tag" /> {self && active ? 'Sostituisci' : 'Assegna'}
          </button>
        </form>

        {history.length > 0 && (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <h3 className="row" style={{ gap: 8, fontSize: '1.05rem', textTransform: 'uppercase' }}>
              <Icon name="history" /> Storico
            </h3>
            <ul className="list">
              {history.map((n) => (
                <li key={n.id} className="list-item" style={{ minHeight: 48 }}>
                  <span className="grow">
                    <strong>«{n.text}»</strong>
                    <span className="player-sub">
                      proposto da {n.proposer.name} · {timeAgo(n.createdAt)}
                    </span>
                  </span>
                  <span className={`chip ${n.status === 'attivo' ? 'chip-primary' : ''}`}>{STATUS_LABEL[n.status]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function InviteCard({ group, isAdmin }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshGroups } = useAppData();
  const [busy, setBusy] = useState(false);
  const link = `${window.location.origin}/entra/${group.inviteCode}`;

  const copy = async (value, message) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error('Copia non riuscita: seleziona il testo a mano.');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: group.name, text: `Entra nel gruppo di calcetto "${group.name}"`, url: link });
      } catch {
        // annullato dall'utente
      }
    } else copy(link, 'Link copiato.');
  };
  const regenerate = async () => {
    if (!(await confirm({ title: 'Rigenerare il codice?', message: 'Il codice e il link attuali smetteranno di funzionare.', confirmLabel: 'Rigenera' }))) return;
    setBusy(true);
    try {
      await api(`/groups/${group.id}/invite-code`, { method: 'POST' });
      await refreshGroups();
      toast.success('Nuovo codice generato.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-labelledby="invite-title">
      <h2 id="invite-title" className="section-title">
        <Icon name="link" /> Invita gli amici
      </h2>
      <p className="muted">Manda il codice o il link: chi lo apre entra nel gruppo.</p>
      <div className="invite-code">
        <span className="visually-hidden">Codice d'invito: {group.inviteCode.split('').join(' ')}</span>
        {group.inviteCode.split('').map((c, i) => (
          <span key={i} aria-hidden="true">
            {c}
          </span>
        ))}
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={share}>
          <Icon name="share" /> Condividi link
        </button>
        <button type="button" className="btn" onClick={() => copy(group.inviteCode, 'Codice copiato.')}>
          <Icon name="copy" /> Copia codice
        </button>
        {isAdmin && (
          <button type="button" className="btn btn-ghost" onClick={regenerate} disabled={busy}>
            <Icon name="refresh" /> Rigenera
          </button>
        )}
      </div>
    </section>
  );
}

const MONTH_NAMES = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Modalità di stagione, mese di inizio e stagioni personalizzate. Lo storico non si cancella mai. */
function SeasonSettings({ group, settings, update }) {
  const toast = useToast();
  const season = settings.season || { mode: 'annuale', startMonth: 9 };
  const { data, reload } = useResource(() => api(`/groups/${group.id}/seasons`), [group.id, season.mode]);
  const [form, setForm] = useState({ name: '', startsAt: '', endsAt: '' });
  const [error, setError] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/groups/${group.id}/seasons`, {
        method: 'POST',
        body: { name: form.name, startsAt: new Date(`${form.startsAt}T00:00:00`).toISOString(), endsAt: new Date(`${form.endsAt}T00:00:00`).toISOString() },
      });
      setForm({ name: '', startsAt: '', endsAt: '' });
      toast.success('Stagione creata.');
      reload();
    } catch (err) {
      setError(err);
    }
  };
  const remove = async (s) => {
    try {
      await api(`/groups/${group.id}/seasons/${s.id}`, { method: 'DELETE' });
      toast.success('Stagione eliminata: le partite restano nello storico.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <fieldset className="field stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label">Stagioni</legend>
      <Segmented
        label="Durata della stagione"
        value={season.mode}
        onChange={(mode) => update({ season: { ...season, mode } })}
        options={[
          { value: 'annuale', label: 'Annuale' },
          { value: 'trimestrale', label: 'Trimestrale' },
          { value: 'mensile', label: 'Mensile' },
          { value: 'personalizzata', label: 'Personalizzata' },
        ]}
      />
      {season.mode === 'annuale' && (
        <FormField label="Mese di inizio della stagione">
          {(p) => (
            <select {...p} className="select" value={season.startMonth} onChange={(e) => update({ season: { ...season, startMonth: Number(e.target.value) } })}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </FormField>
      )}
      <p className="muted">Cambiare modalità non cancella nulla: le partite restano e ogni stagione resta consultabile nelle classifiche.</p>
      {season.mode === 'personalizzata' && (
        <form className="stack" onSubmit={add} aria-label="Nuova stagione personalizzata">
          <FormAlert>{error?.message}</FormAlert>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <FormField label="Nome" error={error?.fields?.name}>
              {(p) => <input {...p} className="input" required minLength={2} maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
            </FormField>
            <FormField label="Inizio" error={error?.fields?.startsAt}>
              {(p) => <input {...p} className="input" type="date" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />}
            </FormField>
            <FormField label="Fine (esclusa)" error={error?.fields?.endsAt}>
              {(p) => <input {...p} className="input" type="date" required value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />}
            </FormField>
          </div>
          <button type="submit" className="btn btn-secondary">
            <Icon name="plus" /> Aggiungi stagione
          </button>
          <ul className="list">
            {(data?.seasons || []).map((s) => (
              <li key={s.key} className="list-item">
                <span className="grow">
                  <span className="player-name">{s.label}</span>
                  <span className="player-sub">
                    {new Date(s.start).toLocaleDateString('it-IT')} – {new Date(s.end).toLocaleDateString('it-IT')}
                    {s.current ? ' · in corso' : ''}
                  </span>
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => remove(s)} aria-label={`Elimina la stagione ${s.label}`}>
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </form>
      )}
    </fieldset>
  );
}

function SettingsCard({ group }) {
  const toast = useToast();
  const { refreshGroups } = useAppData();
  const [settings, setSettings] = useState(group.settings);
  const [extra, setExtra] = useState({ label: '', emoji: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (patch) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/groups/${group.id}`, { method: 'PATCH', body: patch });
      await refreshGroups();
      toast.success('Impostazioni salvate.');
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const update = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const { extraPrizeOptions, ...rest } = patch;
    await save({ settings: extraPrizeOptions ? { extraPrizeOptions: extraPrizeOptions.map(({ label, emoji }) => ({ label, emoji })) } : rest });
  };

  return (
    <section className="card stack" aria-labelledby="settings-title">
      <h2 id="settings-title" className="section-title">
        <Icon name="sliders" /> Impostazioni (admin)
      </h2>
      <FormAlert>{error?.message}</FormAlert>
      <div className="field">
        <span className="label">Chi può creare partite</span>
        <Segmented
          label="Chi può creare partite"
          value={settings.organizers}
          onChange={(organizers) => update({ organizers })}
          options={[
            { value: 'tutti', label: 'Tutti i membri' },
            { value: 'admin', label: 'Solo gli admin' },
          ]}
        />
      </div>
      <FormField label="Partite minime per entrare in classifica" error={error?.fields['settings.minMatchesForRanking']}>
        {(p) => (
          <select {...p} className="select" value={settings.minMatchesForRanking} onChange={(e) => update({ minMatchesForRanking: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <SeasonSettings group={group} settings={settings} update={update} />
      <div className="field">
        <span className="label">Chi perde offre il primo giro</span>
        <Segmented
          label="Chi perde offre il primo giro"
          value={settings.loserPaysFirstRound ? 'si' : 'no'}
          onChange={(v) => update({ loserPaysFirstRound: v === 'si' })}
          options={[
            { value: 'si', label: 'Attivo' },
            { value: 'no', label: 'Spento' },
          ]}
        />
      </div>
      <div className="field">
        <span className="label">Opzioni del terzo tempo</span>
        <div className="row">
          {PRIZE_OPTIONS.map((p) => (
            <span key={p.key} className="chip">
              {p.emoji} {p.label}
            </span>
          ))}
          {settings.extraPrizeOptions.map((p) => (
            <span key={p.key} className="chip chip-orange">
              {p.emoji} {p.label}
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                style={{ minHeight: 24, width: 24 }}
                aria-label={`Togli ${p.label}`}
                onClick={() => update({ extraPrizeOptions: settings.extraPrizeOptions.filter((o) => o.key !== p.key) })}
              >
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
        {settings.extraPrizeOptions.length < 5 && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!extra.label.trim() || !extra.emoji.trim()) return;
              update({ extraPrizeOptions: [...settings.extraPrizeOptions, { key: extra.label, label: extra.label.trim(), emoji: extra.emoji.trim() }] }).then(() => setExtra({ label: '', emoji: '' }));
            }}
          >
            <label className="visually-hidden" htmlFor="extra-emoji">
              Emoji
            </label>
            <input id="extra-emoji" className="input" style={{ width: 72 }} maxLength={4} placeholder="🍦" value={extra.emoji} onChange={(e) => setExtra({ ...extra, emoji: e.target.value })} />
            <label className="visually-hidden" htmlFor="extra-label">
              Nome opzione
            </label>
            <input id="extra-label" className="input" style={{ flex: '1 1 160px' }} maxLength={24} placeholder="Gelato" value={extra.label} onChange={(e) => setExtra({ ...extra, label: e.target.value })} />
            <button type="submit" className="btn" disabled={busy}>
              <Icon name="plus" /> Aggiungi
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

export default function GroupMembers() {
  const { group } = useOutletContext();
  const { user } = useAuth();
  const { refreshGroups } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useResource(() => api(`/groups/${group.id}/members`), [group.id]);
  const [nicknameFor, setNicknameFor] = useState(null);
  const [editing, setEditing] = useState(false);
  const isAdmin = group.myRole === 'admin';

  useRealtimeEvent('group:updated', (e) => e.groupId === group.id && reload());
  useOnReconnect(reload);

  const setRole = async (member, role) => {
    try {
      await api(`/groups/${group.id}/members/${member.user.id}`, { method: 'PATCH', body: { role } });
      toast.success(role === 'admin' ? `${member.user.name} ora è admin.` : `${member.user.name} non è più admin.`);
      reload();
      refreshGroups();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (member) => {
    const self = member.user.id === user.id;
    const ok = await confirm({
      title: self ? `Uscire da ${group.name}?` : `Rimuovere ${member.user.name}?`,
      message: self ? 'Non vedrai più partite, chat e classifiche del gruppo.' : 'Non vedrà più partite, chat e classifiche del gruppo.',
      confirmLabel: self ? 'Esci dal gruppo' : 'Rimuovi',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/groups/${group.id}/members/${member.user.id}`, { method: 'DELETE' });
      if (self) {
        await refreshGroups();
        toast.info(`Sei uscito da ${group.name}.`);
        navigate('/gruppi');
      } else {
        toast.success(`${member.user.name} rimosso dal gruppo.`);
        reload();
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const editGroup = async (form) => {
    try {
      await api(`/groups/${group.id}`, { method: 'PATCH', body: form });
      await refreshGroups();
      toast.success('Gruppo aggiornato.');
      setEditing(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const me = data?.members.find((m) => m.user.id === user.id);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h2>Membri</h2>
          <p>Tocca un nome per dargli un soprannome. Il soprannome si vede in chat e nelle classifiche.</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            <Icon name="edit" /> Modifica gruppo
          </button>
        )}
      </div>
      <div className="grid-main-side">
        <section className="card stack" aria-labelledby="members-title">
          <h3 id="members-title" className="section-title">
            <Icon name="users" /> {group.memberCount} in rosa
          </h3>
          {loading && <CardSkeleton lines={5} />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {data && (
            <ul className="list">
              {data.members.map((m) => {
                const self = m.user.id === user.id;
                const details = [roleLabel(m.user.preferredRole), footLabel(m.user.foot) && `piede ${footLabel(m.user.foot).toLowerCase()}`].filter(Boolean).join(' · ');
                return (
                  <li key={m.user.id} className="list-item" style={{ flexWrap: 'wrap' }}>
                    <button type="button" className="grow" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', minWidth: 180 }} onClick={() => setNicknameFor(m)}>
                      <Player user={m.user} size={44} sub={[details, isAdmin ? m.user.email : null].filter(Boolean).join(' · ') || (self ? 'Sei tu' : null)} />
                      <span className="visually-hidden">: gestisci il soprannome</span>
                    </button>
                    <Link to={`/gruppi/${group.id}/giocatori/${m.user.id}`} className="btn btn-sm" aria-label={`BONCARD di ${m.user.name}`}>
                      <Icon name="card" /> BONCARD
                    </Link>
                    {m.role === 'admin' && (
                      <span className="chip chip-yellow">
                        <Icon name="crown" /> Admin
                      </span>
                    )}
                    {self && <span className="chip chip-primary">Tu</span>}
                    {isAdmin && !self && (
                      <span className="btn-row">
                        <button type="button" className="btn btn-sm" onClick={() => setRole(m, m.role === 'admin' ? 'member' : 'admin')}>
                          {m.role === 'admin' ? 'Togli admin' : 'Fai admin'}
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(m)} aria-label={`Rimuovi ${m.user.name}`}>
                          <Icon name="trash" />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {me && (
            <button type="button" className="btn btn-danger" style={{ justifySelf: 'start' }} onClick={() => remove(me)}>
              <Icon name="logout" /> Esci dal gruppo
            </button>
          )}
        </section>
        <div className="stack">
          <InviteCard group={group} isAdmin={isAdmin} />
          {isAdmin && <SettingsCard group={group} />}
        </div>
      </div>
      {nicknameFor && (
        <NicknameDialog
          group={group}
          member={nicknameFor}
          meId={user.id}
          isAdmin={isAdmin}
          onClose={() => setNicknameFor(null)}
          onChanged={reload}
        />
      )}
      {editing && (
        <Modal title="Modifica gruppo" onClose={() => setEditing(false)}>
          <GroupForm initial={{ name: group.name, description: group.description, emoji: group.emoji, color: group.color }} onSubmit={editGroup} submitLabel="Salva" />
        </Modal>
      )}
    </div>
  );
}

