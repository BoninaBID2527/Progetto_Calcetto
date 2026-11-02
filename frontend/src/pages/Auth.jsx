import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import FieldBadge from '../components/FieldBadge';
import { FormAlert, FormField } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { FIELDS } from '../config';

function useNext() {
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next');
  return next && next.startsWith('/') ? next : '/';
}

function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden="true">
        <Logo />
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <h2>
            Il campo è prenotato.
            <br />
            <span style={{ color: 'var(--c-primary-text)' }}>Manchi solo tu.</span>
          </h2>
          <div className="row">
            {FIELDS.map((f) => (
              <span key={f.key} className="chip">
                <FieldBadge fieldKey={f.key} size={22} /> {f.name}
              </span>
            ))}
          </div>
        </div>
        <p className="muted">"Giovedì si gioca, chi perde offre la birra." — ogni gruppo di calcetto, da sempre</p>
      </aside>
      <main className="auth-panel">
        <div className="mobile-only" style={{ display: 'block' }}>
          <Logo />
        </div>
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const next = useNext();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.email, form.password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Bentornato in campo" subtitle="Accedi per vedere le partite del tuo gruppo.">
      <form className="form" onSubmit={submit} noValidate>
        <FormAlert>{error && !Object.keys(error.fields).length ? error.message : null}</FormAlert>
        <FormField label="Email" error={error?.fields.email}>
          {(p) => (
            <input {...p} className="input" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          )}
        </FormField>
        <FormField label="Password" error={error?.fields.password}>
          {(p) => (
            <input {...p} className="input" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          )}
        </FormField>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Accesso in corso…' : 'Accedi'}
        </button>
        <p className="muted">
          Non hai un account? <Link to={`/registrati${location.search}`}>Registrati gratis</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const next = useNext();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      navigate(next === '/' ? '/gruppi' : next, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Entra in squadra" subtitle="Crea il tuo account: serve un minuto, meno di un riscaldamento.">
      <form className="form" onSubmit={submit} noValidate>
        <FormAlert>{error && !Object.keys(error.fields).length ? error.message : null}</FormAlert>
        <FormField label="Nome" error={error?.fields.name}>
          {(p) => <input {...p} className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </FormField>
        <FormField label="Email" error={error?.fields.email}>
          {(p) => (
            <input {...p} className="input" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          )}
        </FormField>
        <FormField label="Password" error={error?.fields.password} hint="Almeno 8 caratteri, con lettere e numeri.">
          {(p) => (
            <input {...p} className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          )}
        </FormField>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Creazione account…' : (
            <>
              Crea account <Icon name="chevron-right" />
            </>
          )}
        </button>
        <p className="muted">
          Hai già un account? <Link to={`/accedi${location.search}`}>Accedi</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
