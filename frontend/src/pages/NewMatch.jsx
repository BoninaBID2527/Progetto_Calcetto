import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import { FieldSymbol } from '../components/FieldBadge';
import { FormAlert, FormField, Segmented } from '../components/ui';
import { api } from '../api/client';
import { FIELDS, DEFAULTS } from '../config';
import { useToast } from '../context/ToastContext';
import { toIso } from '../utils/format';

function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Scelta del campo con schede grafiche (radiogroup accessibile da tastiera). */
export function FieldPicker({ value, onChange, error }) {
  const onKey = (e, index) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = FIELDS[(index + delta + FIELDS.length) % FIELDS.length];
    onChange(next.key);
    document.getElementById(`field-${next.key}`)?.focus();
  };
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label" id="field-picker-label">
        Campo
      </legend>
      <div className="field-picker" role="radiogroup" aria-labelledby="field-picker-label">
        {FIELDS.map((f, i) => (
          <button
            key={f.key}
            id={`field-${f.key}`}
            type="button"
            role="radio"
            aria-checked={value === f.key}
            tabIndex={value === f.key || (!value && i === 0) ? 0 : -1}
            className="field-option"
            style={{ '--field-color': f.color }}
            onClick={() => onChange(f.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="field-badge" style={{ '--field-color': f.color }}>
              <FieldSymbol symbol={f.symbol} />
            </span>
            <strong>{f.name}</strong>
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              {f.town}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <span className="field-error">
          <Icon name="alert" />
          {error}
        </span>
      )}
    </fieldset>
  );
}

export function Stepper({ id, value, onChange, min, max, label, describedBy }) {
  return (
    <div className="stepper">
      <button type="button" className="btn btn-icon" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Diminuisci ${label}`} disabled={value <= min}>
        –
      </button>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-describedby={describedBy}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 84 }}
      />
      <button type="button" className="btn btn-icon" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Aumenta ${label}`} disabled={value >= max}>
        +
      </button>
    </div>
  );
}

export default function NewMatch() {
  const { group } = useOutletContext();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ field: FIELDS[0].key, date: localDate(1), time: '21:00', durationMinutes: DEFAULTS.durationMinutes, cost: '', slots: DEFAULTS.slots, notes: '', repeat: false, until: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const canCreate = group.settings.organizers === 'tutti' || group.myRole === 'admin';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const costCents = form.cost === '' ? 0 : Math.round(Number(String(form.cost).replace(',', '.')) * 100);
    if (!form.date || !form.time) {
      setError({ message: 'Scegli data e ora.', fields: { startsAt: 'Data e ora sono obbligatorie.' } });
      setBusy(false);
      return;
    }
    try {
      if (form.repeat) {
        const weekday = new Date(`${form.date}T00:00:00Z`).getUTCDay() || 7;
        const res = await api(`/groups/${group.id}/series`, {
          method: 'POST',
          body: { field: form.field, weekday, time: form.time, startsOn: form.date, endsOn: form.until || null, durationMinutes: Number(form.durationMinutes), costCents: Number.isFinite(costCents) ? costCents : -1, slots: Number(form.slots), notes: form.notes },
        });
        toast.success(`Ricorrenza creata: ${res.created} partite in programma.`);
        navigate('/calendario');
        return;
      }
      const { match } = await api(`/groups/${group.id}/matches`, {
        method: 'POST',
        body: {
          field: form.field,
          startsAt: toIso(form.date, form.time),
          durationMinutes: Number(form.durationMinutes),
          costCents: Number.isFinite(costCents) ? costCents : -1,
          slots: Number(form.slots),
          notes: form.notes,
        },
      });
      toast.success('Partita creata: ora tocca agli altri dire "ci sono".');
      navigate(`/partite/${match.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  if (!canCreate) {
    return (
      <div className="page">
        <div className="form-alert">In questo gruppo solo gli admin possono creare partite.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h2>Nuova partita</h2>
          <p>Scegli il campo, la data e quanti posti ci sono. Al resto pensa {group.name}.</p>
        </div>
      </div>
      <form className="grid-main-side" onSubmit={submit} noValidate>
        <div className="card stack">
          <FormAlert>{error && !Object.keys(error.fields || {}).length ? error.message : null}</FormAlert>
          <FieldPicker value={form.field} onChange={(field) => set({ field })} error={error?.fields?.field} />
          <div className="form-row">
            <FormField label="Data" error={error?.fields?.startsAt}>
              {(p) => <input {...p} className="input" type="date" min={localDate(0)} value={form.date} onChange={(e) => set({ date: e.target.value })} />}
            </FormField>
            <FormField label="Ora d'inizio">
              {(p) => <input {...p} className="input" type="time" step="900" value={form.time} onChange={(e) => set({ time: e.target.value })} />}
            </FormField>
          </div>
          <div className="field">
            <label className="check-row">
              <input type="checkbox" checked={form.repeat} onChange={(e) => set({ repeat: e.target.checked })} />
              <span>
                <strong>Ripeti ogni settimana</strong>
                <span className="player-sub">Le prossime 4 settimane vengono create subito, le altre man mano. Ogni partita si può modificare o annullare da sola.</span>
              </span>
            </label>
            {form.repeat && (
              <FormField label="Fino al (facoltativo)" error={error?.fields?.endsOn}>
                {(p) => <input {...p} className="input" type="date" min={form.date} value={form.until} onChange={(e) => set({ until: e.target.value })} />}
              </FormField>
            )}
          </div>
          <div className="field">
            <span className="label" id="duration-label">
              Durata
            </span>
            <Segmented
              label="Durata"
              value={Number(form.durationMinutes)}
              onChange={(v) => set({ durationMinutes: v })}
              options={[60, 90, 120].map((v) => ({ value: v, label: `${v} min` }))}
            />
            {error?.fields?.durationMinutes && <span className="field-error">{error.fields.durationMinutes}</span>}
          </div>
        </div>
        <div className="card stack">
          <FormField label="Numero di posti" error={error?.fields?.slots} hint="Di solito 10 per il calcetto a 5.">
            {(p) => <Stepper id={p.id} describedBy={p['aria-describedby']} label="posti" value={form.slots} min={2} max={30} onChange={(slots) => set({ slots })} />}
          </FormField>
          <FormField label="Costo totale del campo (€)" error={error?.fields?.costCents} hint="Lo dividiamo noi per i presenti.">
            {(p) => <input {...p} className="input" inputMode="decimal" placeholder="60" value={form.cost} onChange={(e) => set({ cost: e.target.value })} />}
          </FormField>
          <FormField label="Note (facoltative)" error={error?.fields?.notes}>
            {(p) => <textarea {...p} className="textarea" placeholder="Maglia chiara e scura, ritrovo 15 minuti prima…" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />}
          </FormField>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Creazione…' : (
              <>
                <Icon name="whistle" /> Crea la partita
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
