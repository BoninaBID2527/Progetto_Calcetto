import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Button, Card, CardHeader, FormAlert, SegmentedControl } from './ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, onInstallAvailable, promptInstall, pushSupport } from '../utils/pwa';

const CATEGORIES = [
  { key: 'boncall', label: 'BONCALL e sostituti', hint: 'convocazioni, "mancano 2", posti liberi' },
  { key: 'partite', label: 'Partite', hint: 'nuove partite, chiusure (le promozioni e gli annullamenti arrivano sempre)' },
  { key: 'promemoria', label: 'Promemoria', hint: 'il giorno prima, a metà convocazione' },
  { key: 'risultati', label: 'Risultati e votazioni', hint: 'finale, vota l\'MVP' },
  { key: 'social', label: 'Gruppo', hint: 'soprannomi, premi, traguardi' },
];

export default function NotificationSettings() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const prefs = user.notificationPrefs;
  const support = pushSupport();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    currentSubscription().then((s) => setActive(Boolean(s) && prefs.push)).catch(() => {});
    return onInstallAvailable(setCanInstall);
  }, [prefs.push]);

  const save = async (patch) => {
    try {
      await updateProfile({ notificationPrefs: patch });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (active) {
        await disablePush();
        await updateProfile({});
        setActive(false);
        toast.info('Notifiche push disattivate su questo dispositivo.');
      } else {
        await enablePush();
        await updateProfile({});
        setActive(true);
        toast.success('Notifiche push attive su questo dispositivo.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    const res = await api('/push/test', { method: 'POST' });
    if (res.sent) toast.success('Notifica di prova inviata.');
    else toast.error(res.reason || 'Nessun dispositivo registrato.');
  };

  return (
    <Card className="stack" aria-labelledby="notif-title">
      <CardHeader id="notif-title" eyebrow="Notifiche" title="Come ti avvisiamo" icon="bell-ring" />
      <p className="muted">Le notifiche dentro l'app arrivano sempre. Le push sul telefono si attivano solo se lo chiedi tu, qui sotto.</p>
      <FormAlert>{error}</FormAlert>
      {support.supported ? (
        <div className="row">
          <Button variant={active ? 'secondary' : 'primary'} icon={active ? 'x' : 'bell'} onClick={toggle} loading={busy}>
            {active ? 'Disattiva le push su questo dispositivo' : 'Attiva le notifiche push'}
          </Button>
          {active && (
            <Button variant="ghost" icon="send" onClick={test}>
              Invia una prova
            </Button>
          )}
        </div>
      ) : (
        <p className="form-alert" style={{ background: 'var(--c-gold-soft)', color: 'var(--c-gold-text)' }}>
          <Icon name="info" />
          <span>{support.reason}</span>
        </p>
      )}
      {support.supported && support.permission === 'denied' && <p className="muted">Il browser ha bloccato le notifiche per questo sito: riattivale dalle impostazioni del sito.</p>}
      {canInstall && (
        <Button icon="download" onClick={promptInstall}>
          Installa BONMATCH sul dispositivo
        </Button>
      )}
      {isIos() && !isStandalone() && support.supported && <p className="muted">Su iPhone conviene aggiungere BONMATCH alla schermata Home: le push arrivano solo dall'app installata.</p>}

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Cosa vuoi ricevere</legend>
        {CATEGORIES.map((c) => (
          <label key={c.key} className="check-row">
            <input type="checkbox" checked={prefs.categories[c.key] !== false} onChange={(e) => save({ categories: { [c.key]: e.target.checked } })} />
            <span>
              {c.label}
              <span className="player-sub">{c.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <span className="label">Fascia silenziosa per le push</span>
        <SegmentedControl
          label="Fascia silenziosa"
          value={prefs.quietHours.enabled ? 'si' : 'no'}
          onChange={(v) => save({ quietHours: { enabled: v === 'si' } })}
          options={[
            { value: 'si', label: 'Attiva' },
            { value: 'no', label: 'Spenta' },
          ]}
        />
        {prefs.quietHours.enabled && (
          <div className="row">
            <label className="row" style={{ gap: 6 }}>
              dalle
              <input className="input" type="time" style={{ width: 130 }} value={prefs.quietHours.start} onChange={(e) => save({ quietHours: { start: e.target.value } })} />
            </label>
            <label className="row" style={{ gap: 6 }}>
              alle
              <input className="input" type="time" style={{ width: 130 }} value={prefs.quietHours.end} onChange={(e) => save({ quietHours: { end: e.target.value } })} />
            </label>
          </div>
        )}
        <span className="hint">In quella fascia la notifica resta nell'app, ma il telefono non suona.</span>
      </div>

      <div className="field">
        <label className="label" htmlFor="max-push">
          Al massimo push all'ora
        </label>
        <select id="max-push" className="select" style={{ maxWidth: 160 }} value={prefs.maxPushPerHour} onChange={(e) => save({ maxPushPerHour: Number(e.target.value) })}>
          {[2, 4, 6, 10, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </Card>
  );
}
