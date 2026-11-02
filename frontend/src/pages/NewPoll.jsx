import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FieldPicker, Stepper } from './NewMatch';
import { Button, Card, FormAlert, FormField, IconButton, SegmentedControl } from '../components/ui';
import { api } from '../api/client';
import { FIELDS } from '../config';
import { useToast } from '../context/ToastContext';
import { toIso } from '../utils/format';

const pad = (n) => String(n).padStart(2, '0');
const localDate = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function NewPoll() {
  const { group } = useOutletContext();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState('fissa');
  const [form, setForm] = useState({
    field: FIELDS[0].key,
    date: localDate(2),
    time: '21:00',
    options: [
      { date: localDate(2), time: '21:00', field: FIELDS[0].key },
      { date: localDate(3), time: '21:00', field: FIELDS[1].key },
    ],
    playersNeeded: 10,
    deadlineDate: localDate(1),
    deadlineTime: '20:00',
    cost: '',
    notes: '',
    authorPlays: true,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setOption = (i, patch) => set({ options: form.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const costCents = form.cost === '' ? 0 : Math.round(Number(String(form.cost).replace(',', '.')) * 100);
    const body = {
      mode,
      playersNeeded: Number(form.playersNeeded),
      deadline: toIso(form.deadlineDate, form.deadlineTime),
      costCents: Number.isFinite(costCents) ? costCents : -1,
      notes: form.notes,
      authorPlays: form.authorPlays,
      ...(mode === 'fissa'
        ? { field: form.field, startsAt: toIso(form.date, form.time) }
        : { options: form.options.map((o) => ({ startsAt: toIso(o.date, o.time), field: o.field })) }),
    };
    try {
      const { poll } = await api(`/groups/${group.id}/polls`, { method: 'POST', body });
      toast.success('Convocazione aperta: il gruppo è stato avvisato.');
      navigate(`/boncall/${poll.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const f = error?.fields || {};
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <span className="overline">BONCALL</span>
          <h2>Cerca giocatori</h2>
          <p>Il gruppo riceve una notifica appena salvi. Puoi fissare giorno e ora oppure proporre più alternative e far scegliere agli altri.</p>
        </div>
      </div>
      <form className="grid-main-side" onSubmit={submit} noValidate>
        <Card className="stack">
          <FormAlert>{error && !Object.keys(f).length ? error.message : null}</FormAlert>
          <div className="field">
            <span className="label">Quando</span>
            <SegmentedControl
              label="Modalità della convocazione"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'fissa', label: 'Giorno e ora decisi', icon: 'calendar' },
                { value: 'opzioni', label: 'Più alternative', icon: 'vote' },
              ]}
            />
          </div>
          {mode === 'fissa' ? (
            <>
              <FieldPicker value={form.field} onChange={(field) => set({ field })} error={f.field} />
              <div className="form-row">
                <FormField label="Giorno" error={f.startsAt}>
                  {(p) => <input {...p} className="input" type="date" min={localDate(0)} value={form.date} onChange={(e) => set({ date: e.target.value })} />}
                </FormField>
                <FormField label="Ora">
                  {(p) => <input {...p} className="input" type="time" step="900" value={form.time} onChange={(e) => set({ time: e.target.value })} />}
                </FormField>
              </div>
            </>
          ) : (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">Alternative (da 2 a 5)</legend>
              <ol className="option-editor">
                {form.options.map((o, i) => (
                  <li key={i}>
                    <span className="option-index">{i + 1}</span>
                    <label className="visually-hidden" htmlFor={`opt-date-${i}`}>
                      Giorno alternativa {i + 1}
                    </label>
                    <input id={`opt-date-${i}`} className="input" type="date" min={localDate(0)} value={o.date} onChange={(e) => setOption(i, { date: e.target.value })} />
                    <label className="visually-hidden" htmlFor={`opt-time-${i}`}>
                      Ora alternativa {i + 1}
                    </label>
                    <input id={`opt-time-${i}`} className="input" type="time" step="900" value={o.time} onChange={(e) => setOption(i, { time: e.target.value })} />
                    <label className="visually-hidden" htmlFor={`opt-field-${i}`}>
                      Campo alternativa {i + 1}
                    </label>
                    <select id={`opt-field-${i}`} className="select" value={o.field} onChange={(e) => setOption(i, { field: e.target.value })}>
                      {FIELDS.map((fl) => (
                        <option key={fl.key} value={fl.key}>
                          {fl.name}
                        </option>
                      ))}
                    </select>
                    {form.options.length > 2 && <IconButton icon="trash" label={`Togli l'alternativa ${i + 1}`} onClick={() => set({ options: form.options.filter((_, j) => j !== i) })} />}
                  </li>
                ))}
              </ol>
              {form.options.length < 5 && (
                <Button icon="plus" size="sm" onClick={() => set({ options: [...form.options, { date: localDate(4), time: '21:00', field: FIELDS[0].key }] })}>
                  Aggiungi alternativa
                </Button>
              )}
              {f.options && <span className="field-error">{f.options}</span>}
            </fieldset>
          )}
        </Card>
        <Card className="stack">
          <FormField label="Giocatori necessari" error={f.playersNeeded} hint="Conta anche te, se giochi.">
            {(p) => <Stepper id={p.id} describedBy={p['aria-describedby']} label="giocatori" value={form.playersNeeded} min={2} max={30} onChange={(playersNeeded) => set({ playersNeeded })} />}
          </FormField>
          <div className="form-row">
            <FormField label="Risposte entro il" error={f.deadline}>
              {(p) => <input {...p} className="input" type="date" min={localDate(0)} value={form.deadlineDate} onChange={(e) => set({ deadlineDate: e.target.value })} />}
            </FormField>
            <FormField label="alle ore">
              {(p) => <input {...p} className="input" type="time" step="900" value={form.deadlineTime} onChange={(e) => set({ deadlineTime: e.target.value })} />}
            </FormField>
          </div>
          <FormField label="Costo totale del campo (€, facoltativo)" error={f.costCents}>
            {(p) => <input {...p} className="input" inputMode="decimal" placeholder="70" value={form.cost} onChange={(e) => set({ cost: e.target.value })} />}
          </FormField>
          <FormField label="Note (facoltative)" error={f.notes}>
            {(p) => <textarea {...p} className="textarea" placeholder="Serve un portiere, porto io il pallone…" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />}
          </FormField>
          <label className="check-row">
            <input type="checkbox" checked={form.authorPlays} onChange={(e) => set({ authorPlays: e.target.checked })} />
            <span>Gioco anch'io: contami tra i confermati</span>
          </label>
          <Button type="submit" variant="primary" size="lg" icon="boncall" loading={busy}>
            Apri la convocazione
          </Button>
        </Card>
      </form>
    </div>
  );
}
