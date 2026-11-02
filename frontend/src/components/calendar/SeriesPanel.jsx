import { useState } from 'react';
import Icon from '../Icon';
import { Card, CardHeader, FormAlert, FormField, Modal, useConfirm } from '../ui';
import { api } from '../../api/client';
import { useResource } from '../../hooks/useResource';
import { useToast } from '../../context/ToastContext';
import { getField } from '../../config';
import { WEEKDAYS } from '../../utils/calendar';

function EditDialog({ series, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ time: series.time, weekday: series.weekday, slots: series.slots, cost: series.costCents ? String(series.costCents / 100) : '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/series/${series.id}`, {
        method: 'PATCH',
        body: { time: form.time, weekday: Number(form.weekday), slots: Number(form.slots), costCents: Math.round(Number(String(form.cost || 0).replace(',', '.')) * 100) },
      });
      toast.success(`Aggiornata. ${res.updated} ${res.updated === 1 ? 'partita futura modificata' : 'partite future modificate'}.`);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Modifica la ricorrenza" onClose={onClose}>
      <form className="stack" onSubmit={save} noValidate>
        <p className="muted">Si applica alle prossime partite ancora aperte e senza iscritti, e non a quelle modificate a mano. Le altre restano come sono.</p>
        <FormAlert>{error?.message}</FormAlert>
        <div className="form-row">
          <FormField label="Giorno" error={error?.fields?.weekday}>
            {(p) => (
              <select {...p} className="select" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i + 1}>
                    {w}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Ora" error={error?.fields?.time}>
            {(p) => <input {...p} className="input" type="time" step="900" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />}
          </FormField>
        </div>
        <div className="form-row">
          <FormField label="Posti" error={error?.fields?.slots}>
            {(p) => <input {...p} className="input" type="number" min={2} max={30} value={form.slots} onChange={(e) => setForm({ ...form, slots: e.target.value })} />}
          </FormField>
          <FormField label="Costo campo (€)" error={error?.fields?.costCents}>
            {(p) => <input {...p} className="input" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />}
          </FormField>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Salva
        </button>
      </form>
    </Modal>
  );
}

/** Partite ricorrenti del gruppo: elenco, modifica e fine (con o senza annullare le prossime). */
export default function SeriesPanel({ group, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useResource(() => api(`/groups/${group.id}/series`), [group.id]);
  const [editing, setEditing] = useState(null);
  const list = (data?.series || []).filter((s) => s.active);

  const end = async (s) => {
    const choice = await confirm({
      title: 'Fermare la ricorrenza?',
      message: `Non verranno create nuove partite "ogni ${s.weekdayLabel}". Le partite già create restano, a meno che tu non scelga di annullarle.`,
      confirmLabel: 'Ferma e annulla le prossime',
      cancelLabel: 'Non ora',
      danger: true,
    });
    if (!choice) return;
    try {
      const res = await api(`/series/${s.id}?cancelFuture=true`, { method: 'DELETE' });
      toast.success(`Ricorrenza fermata. ${res.cancelled} partite annullate.`);
      reload();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const stopOnly = async (s) => {
    try {
      await api(`/series/${s.id}`, { method: 'DELETE' });
      toast.success('Ricorrenza fermata: le partite già create restano.');
      reload();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card aria-labelledby="series-title">
      <CardHeader id="series-title" icon="repeat" title="Partite ricorrenti" eyebrow={group.name} />
      {list.length === 0 ? (
        <p className="muted">Nessuna ricorrenza. Quando crei una partita puoi scegliere "Ripeti ogni settimana".</p>
      ) : (
        <ul className="list">
          {list.map((s) => (
            <li key={s.id} className="list-item">
              <span className="grow">
                <span className="player-name">
                  Ogni {s.weekdayLabel} alle {s.time}
                </span>
                <span className="player-sub">
                  {getField(s.field).name} · {s.slots} posti · {s.upcoming} {s.upcoming === 1 ? 'partita in programma' : 'partite in programma'}
                </span>
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(s)} aria-label={`Modifica la ricorrenza di ${s.weekdayLabel}`}>
                <Icon name="edit" />
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => stopOnly(s)} aria-label={`Ferma la ricorrenza di ${s.weekdayLabel}`}>
                <Icon name="x" />
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => end(s)} aria-label={`Ferma e annulla le prossime partite di ${s.weekdayLabel}`}>
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <EditDialog
          series={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
            onChanged();
          }}
        />
      )}
    </Card>
  );
}
