import { useState } from 'react';
import Icon from '../Icon';
import { FormAlert, FormField, Modal, useConfirm } from '../ui';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { FieldPicker, Stepper } from '../../pages/NewMatch';
import { toIso } from '../../utils/format';

function toLocalParts(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function EditMatch({ match, onClose, onSaved }) {
  const toast = useToast();
  const parts = toLocalParts(match.startsAt);
  const [form, setForm] = useState({ field: match.field, ...parts, slots: match.slots, cost: match.costCents ? String(match.costCents / 100).replace('.', ',') : '', notes: match.notes });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { field: form.field, slots: Number(form.slots), notes: form.notes, costCents: form.cost === '' ? 0 : Math.round(Number(form.cost.replace(',', '.')) * 100) };
    if (form.date !== parts.date || form.time !== parts.time) body.startsAt = toIso(form.date, form.time);
    try {
      const res = await api(`/matches/${match.id}`, { method: 'PATCH', body });
      onSaved(res.match);
      toast.success('Partita aggiornata.');
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal title="Modifica partita" onClose={onClose}>
      <form className="form" onSubmit={save} noValidate>
        <FormAlert>{error && !Object.keys(error.fields).length ? error.message : null}</FormAlert>
        <FieldPicker value={form.field} onChange={(field) => setForm({ ...form, field })} />
        <div className="form-row">
          <FormField label="Data" error={error?.fields.startsAt}>
            {(p) => <input {...p} className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}
          </FormField>
          <FormField label="Ora">
            {(p) => <input {...p} className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />}
          </FormField>
        </div>
        <FormField label="Posti" error={error?.fields.slots || (error?.status === 409 ? error.message : null)}>
          {(p) => <Stepper id={p.id} label="posti" value={form.slots} min={2} max={30} onChange={(slots) => setForm({ ...form, slots })} />}
        </FormField>
        <FormField label="Costo totale (€)" error={error?.fields.costCents}>
          {(p) => <input {...p} className="input" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />}
        </FormField>
        <FormField label="Note" error={error?.fields.notes}>
          {(p) => <textarea {...p} className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}
        </FormField>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Salva modifiche
        </button>
      </form>
    </Modal>
  );
}

export default function ManagePanel({ match, voting, onUpdated }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const run = async (fn, message) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.match) onUpdated(res.match);
      toast.success(message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const status = (s, message) => run(() => api(`/matches/${match.id}/status`, { method: 'POST', body: { status: s } }), message);
  const future = new Date(match.startsAt) > new Date();

  return (
    <section className="card stack" aria-labelledby="manage-title">
      <h2 id="manage-title" className="section-title">
        <Icon name="whistle" /> Fischietto dell'organizzatore
      </h2>
      <div className="btn-row">
        {match.status === 'aperta' && (
          <button type="button" className="btn" disabled={busy} onClick={() => status('chiusa', 'Iscrizioni chiuse.')}>
            <Icon name="lock" /> Chiudi iscrizioni
          </button>
        )}
        {match.status === 'chiusa' && future && (
          <button type="button" className="btn" disabled={busy} onClick={() => status('aperta', 'Iscrizioni riaperte.')}>
            <Icon name="unlock" /> Riapri iscrizioni
          </button>
        )}
        {['aperta', 'chiusa'].includes(match.status) && (
          <button type="button" className="btn" disabled={busy} onClick={() => setEditing(true)}>
            <Icon name="edit" /> Modifica
          </button>
        )}
        {match.status === 'giocata' && (voting?.mvp?.open || voting?.prize?.open) && (
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => api(`/matches/${match.id}/voting/close`, { method: 'POST' }), 'Votazioni chiuse.')}>
            <Icon name="flag" /> Chiudi votazioni
          </button>
        )}
        {match.status === 'giocata' && (
          <button type="button" className="btn" disabled={busy} onClick={() => status('archiviata', 'Partita archiviata.')}>
            <Icon name="archive" /> Archivia
          </button>
        )}
        {['aperta', 'chiusa'].includes(match.status) && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({ title: 'Annullare la partita?', message: 'Gli iscritti riceveranno una notifica. Non si può tornare indietro.', confirmLabel: 'Annulla la partita', cancelLabel: 'Lascia stare', danger: true });
              if (ok) status('annullata', 'Partita annullata.');
            }}
          >
            <Icon name="ban" /> Annulla partita
          </button>
        )}
      </div>
      {match.status === 'archiviata' && <p className="muted">Partita archiviata: resta nelle classifiche, ma non si modifica più.</p>}
      {match.status === 'annullata' && <p className="muted">Partita annullata: non conta per le classifiche.</p>}
      {editing && <EditMatch match={match} onClose={() => setEditing(false)} onSaved={onUpdated} />}
    </section>
  );
}
