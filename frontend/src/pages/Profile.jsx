import { useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { FormAlert, FormField, Segmented } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { ROLES, FEET } from '../config';

/** Ridimensiona l'immagine scelta a 256×256 (ritaglio centrale) e la restituisce come data URL. */
function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Non riesco a leggere il file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Il file non sembra un\'immagine.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(img.width, img.height);
        canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    name: user.name,
    avatarUrl: user.avatarUrl,
    preferredRole: user.preferredRole,
    foot: user.foot,
    nicknameMode: user.settings.nicknameMode,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setForm((f) => ({ ...f, avatarUrl: null }));
      const url = await resizeImage(file);
      setForm((f) => ({ ...f, avatarUrl: url }));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateProfile({
        name: form.name,
        avatarUrl: form.avatarUrl || null,
        preferredRole: form.preferredRole || null,
        foot: form.foot || null,
        settings: { nicknameMode: form.nicknameMode },
      });
      toast.success('Profilo aggiornato.');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1>Il tuo profilo</h1>
          <p>Ruolo e piede aiutano a disporre i giocatori sul campo. La foto è facoltativa: senza, ci sono le tue iniziali.</p>
        </div>
      </div>
      <form className="grid-main-side" onSubmit={save} noValidate>
        <section className="card stack" aria-labelledby="me-title">
          <h2 id="me-title" className="visually-hidden">
            Dati personali
          </h2>
          <FormAlert>{error && !Object.keys(error.fields).length ? error.message : null}</FormAlert>
          <div className="profile-avatar">
            <Avatar user={{ ...user, name: form.name || user.name, avatarUrl: form.avatarUrl }} size={88} />
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" id="avatar-file" onChange={pick} />
              <label htmlFor="avatar-file" className="btn btn-sm">
                <Icon name="image" /> {form.avatarUrl ? 'Cambia foto' : 'Carica una foto'}
              </label>
              {form.avatarUrl && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForm({ ...form, avatarUrl: null })}>
                  <Icon name="trash" /> Usa le iniziali
                </button>
              )}
              {error?.fields.avatarUrl && <span className="field-error">{error.fields.avatarUrl}</span>}
            </div>
          </div>
          <FormField label="Nome" error={error?.fields.name}>
            {(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </FormField>
          <FormField label="Email">
            {(p) => <input {...p} className="input" value={user.email} readOnly aria-readonly="true" />}
          </FormField>
          <div className="field">
            <span className="label">Ruolo preferito</span>
            <Segmented label="Ruolo preferito" value={form.preferredRole} onChange={(preferredRole) => setForm({ ...form, preferredRole })} options={ROLES.map((r) => ({ value: r.key, label: r.label }))} />
          </div>
          <div className="field">
            <span className="label">Piede</span>
            <Segmented label="Piede" value={form.foot} onChange={(foot) => setForm({ ...form, foot })} options={FEET.map((f) => ({ value: f.key, label: f.label }))} />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Salvataggio…' : 'Salva il profilo'}
          </button>
        </section>
        <div className="stack">
          <section className="card stack" aria-labelledby="pref-title">
            <h2 id="pref-title" className="section-title">
              <Icon name="sliders" /> Preferenze
            </h2>
            <div className="field">
              <span className="label">Soprannomi degli altri</span>
              <Segmented
                label="Come mostrare i soprannomi"
                value={form.nicknameMode}
                onChange={(nicknameMode) => setForm({ ...form, nicknameMode })}
                options={[
                  { value: 'accanto', label: 'Accanto al nome' },
                  { value: 'sostituisci', label: 'Al posto del nome' },
                ]}
              />
              <span className="hint">Esempio: «Luca «Cesarini»» oppure solo «Cesarini». Ricordati di salvare.</span>
            </div>
            <div className="field">
              <span className="label">Tema</span>
              <Segmented
                label="Tema"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'dark', label: 'Scuro' },
                  { value: 'light', label: 'Chiaro' },
                ]}
              />
            </div>
          </section>
          <section className="card stack">
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                await logout();
              }}
            >
              <Icon name="logout" /> Esci da questo dispositivo
            </button>
          </section>
        </div>
      </form>
    </div>
  );
}
