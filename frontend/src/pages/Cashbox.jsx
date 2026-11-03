import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import { Avatar, PlayerName } from '../components/Avatar';
import { Card, CardHeader, CardSkeleton, EmptyState, ErrorState, FormAlert, FormField, Modal, Segmented, StatCard, useConfirm } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { formatEuro } from '../utils/format';

const TYPE = { quota: 'Quota partita', versamento: 'Versamento', spesa: 'Spesa', rimborso: 'Rimborso' };
const STATUS = { dichiarato: 'In attesa di conferma', verificato: 'Confermato', annullato: 'Annullato' };
const TONE = { dichiarato: 'chip-yellow', verificato: 'chip-primary', annullato: '' };
const when = (d) => new Date(d).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const signed = (c) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${formatEuro(Math.abs(c))}`;
const toCents = (v) => Math.round(Number(String(v).replace(',', '.')) * 100);

function EntryForm({ group, admin, onClose, onSaved }) {
  const toast = useToast();
  const members = useResource(() => api(`/groups/${group.id}/members`), [group.id]);
  const [type, setType] = useState(admin ? 'spesa' : 'versamento');
  const [form, setForm] = useState({ amount: '', note: '', userId: '', paidFrom: group.settings.cashbox ? 'cassa' : 'membro' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const cashbox = group.settings.cashbox;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { type, amountCents: toCents(form.amount), note: form.note };
    if (type === 'spesa') body.paidFrom = form.paidFrom;
    if (form.userId && (type !== 'spesa' || form.paidFrom === 'membro')) body.userId = form.userId;
    try {
      await api(`/groups/${group.id}/ledger`, { method: 'POST', body });
      toast.success(admin ? 'Voce registrata.' : 'Versamento dichiarato: aspetta la conferma di un admin.');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const needsPerson = type === 'rimborso' || (type === 'spesa' && form.paidFrom === 'membro') || (type === 'versamento' && admin);

  return (
    <Modal title={admin ? 'Registra una voce' : 'Dichiara un versamento'} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <p className="muted">È un registro interno: qui si annota ciò che è successo, nessun pagamento reale passa da BONMATCH.</p>
        <FormAlert>{error?.message}</FormAlert>
        {admin && (
          <Segmented
            label="Tipo di voce"
            value={type}
            onChange={setType}
            options={[
              { value: 'spesa', label: 'Spesa' },
              { value: 'rimborso', label: 'Rimborso' },
              ...(cashbox ? [{ value: 'versamento', label: 'Versamento' }] : []),
            ]}
          />
        )}
        <FormField label="Importo (€)" error={error?.fields?.amountCents}>
          {(p) => <input {...p} className="input" inputMode="decimal" placeholder="15" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}
        </FormField>
        {type === 'spesa' && (
          <Segmented
            label="Chi ha pagato la spesa"
            value={form.paidFrom}
            onChange={(paidFrom) => setForm({ ...form, paidFrom })}
            options={[...(cashbox ? [{ value: 'cassa', label: 'Cassa comune' }] : []), { value: 'membro', label: 'Anticipata da un membro' }]}
          />
        )}
        {needsPerson && (
          <FormField label={type === 'rimborso' ? 'Chi riceve il rimborso' : type === 'versamento' ? 'Chi ha versato' : 'Chi ha anticipato'} error={error?.fields?.userId}>
            {(p) => (
              <select {...p} className="select" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">Scegli…</option>
                {(members.data?.members || []).map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}
        <FormField label="Nota (facoltativa)" error={error?.fields?.note}>
          {(p) => <input {...p} className="input" maxLength={200} placeholder="Palloni, pettorine, acqua…" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
        </FormField>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {admin ? 'Registra' : 'Dichiara il versamento'}
        </button>
      </form>
    </Modal>
  );
}

/** Motivo obbligatorio per annullare una voce già confermata: resta nello storico. */
function CancelDialog({ onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal title="Annullare una voce confermata" onClose={onClose}>
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return setError('Il motivo è obbligatorio.');
          return onConfirm(reason.trim());
        }}
      >
        <p className="muted">La voce resta nello storico come annullata e smette di contare nei saldi.</p>
        <FormField label="Motivo" error={error}>
          {(p) => <input {...p} className="input" maxLength={200} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />}
        </FormField>
        <button type="submit" className="btn btn-danger-solid">
          Annulla la voce
        </button>
      </form>
    </Modal>
  );
}

function EntryRow({ e, canManage, onChange, meId }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const mineDeclared = e.status === 'dichiarato' && (e.user?.id === meId || e.createdBy.id === meId);

  const run = async (path, body) => {
    try {
      await api(path, { method: 'POST', body });
      onChange();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const cancel = async () => {
    if (e.status === 'verificato') return setAsking(true);
    if (!(await confirm({ title: 'Annullare la voce?', message: 'Resterà nello storico come annullata.', confirmLabel: 'Annulla la voce', danger: true }))) return undefined;
    return run(`/groups/${e.groupId}/ledger/${e.id}/cancel`, { reason: '' });
  };

  return (
    <li className="ledger-row">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="grow">
          <span className="player-name">
            {TYPE[e.type]}
            {e.user && (
              <>
                {' · '}
                <PlayerName user={e.user} />
              </>
            )}
            {e.paidFrom === 'cassa' && ' · dalla cassa'}
          </span>
          <span className="player-sub">
            {when(e.createdAt)}
            {e.match && (
              <>
                {' · '}
                <Link to={`/partite/${e.match.id}`}>{e.match.fieldName || 'partita'}</Link>
              </>
            )}
            {e.note && ` · ${e.note}`}
          </span>
        </span>
        <span className="num tabular" style={e.status === 'annullato' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
          {formatEuro(e.amountCents)}
        </span>
        <span className={`chip ${TONE[e.status]}`}>{STATUS[e.status]}</span>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {e.status === 'dichiarato' && canManage && (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => run(`/groups/${e.groupId}/ledger/${e.id}/verify`)}>
            <Icon name="check" /> Conferma
          </button>
        )}
        {e.status !== 'annullato' && (canManage || mineDeclared) && (
          <button type="button" className="btn btn-sm" onClick={cancel}>
            {e.status === 'dichiarato' && !canManage ? 'Ritira' : 'Annulla'}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="history" /> Storico
        </button>
      </div>
      {asking && (
        <CancelDialog
          onClose={() => setAsking(false)}
          onConfirm={async (reason) => {
            setAsking(false);
            await run(`/groups/${e.groupId}/ledger/${e.id}/cancel`, { reason });
          }}
        />
      )}
      {open && (
        <ol className="ledger-history">
          {e.history.map((h, i) => (
            <li key={i}>
              {when(h.at)} · <PlayerName user={h.by} /> · {h.action}
              {h.note && ` (${h.note})`}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function History({ group, canManage, meId, reloadKey, onChange }) {
  const [type, setType] = useState('');
  const [extra, setExtra] = useState([]);
  const { data, error, loading, reload } = useResource(() => api(`/groups/${group.id}/ledger?limit=20${type ? `&type=${type}` : ''}`).then((r) => ({ ...r, items: r.items.map((i) => ({ ...i, groupId: group.id })) })), [group.id, type, reloadKey]);
  const more = async () => {
    const last = [...(data?.items || []), ...extra].at(-1);
    const r = await api(`/groups/${group.id}/ledger?limit=20&before=${last.id}${type ? `&type=${type}` : ''}`);
    setExtra([...extra, ...r.items.map((i) => ({ ...i, groupId: group.id }))]);
    setHasMore(r.hasMore);
  };
  const [hasMore, setHasMore] = useState(null);
  const items = [...(data?.items || []), ...extra];
  const showMore = hasMore === null ? data?.hasMore : hasMore;
  const changed = () => {
    setExtra([]);
    setHasMore(null);
    reload();
    onChange();
  };

  return (
    <Card aria-labelledby="ledger-title">
      <CardHeader id="ledger-title" icon="receipt" title="Storico" eyebrow="Registro" />
      <div className="field">
        <label className="label" htmlFor="ledger-type">
          Mostra
        </label>
        <select
          id="ledger-type"
          className="select"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setExtra([]);
            setHasMore(null);
          }}
        >
          <option value="">Tutte le voci</option>
          {Object.entries(TYPE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {loading && !data && <CardSkeleton lines={3} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && items.length === 0 && <p className="muted">Ancora nessuna voce.</p>}
      <ul className="list ledger">
        {items.map((e) => (
          <EntryRow key={e.id} e={e} canManage={canManage} meId={meId} onChange={changed} />
        ))}
      </ul>
      {showMore && (
        <button type="button" className="btn btn-ghost" onClick={more}>
          Carica altre voci
        </button>
      )}
    </Card>
  );
}

export default function Cashbox() {
  const { group } = useOutletContext();
  const toast = useToast();
  const { data, error, loading, reload } = useResource(() => api(`/groups/${group.id}/cashbox`).then((r) => r.cashbox), [group.id, group.settings.cashbox]);
  const [form, setForm] = useState(false);
  const [tick, setTick] = useState(0);
  useRealtimeEvent('cashbox:updated', (e) => e.groupId === group.id && (reload(), setTick((t) => t + 1)));
  useOnReconnect(reload);

  const refresh = () => {
    reload();
    setTick((t) => t + 1);
  };
  const verify = async (e) => {
    try {
      await api(`/groups/${group.id}/ledger/${e.id}/verify`, { method: 'POST' });
      toast.success('Pagamento confermato.');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

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
  const c = data;
  const me = c.me;
  const balance = me?.balanceCents || 0;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h2>Cassa</h2>
          <p>Un registro interno di quote, versamenti e spese. Nessun pagamento reale passa da qui: un pagamento dichiarato vale solo quando chi riceve il denaro lo conferma.</p>
        </div>
        {(c.isAdmin || c.enabled) && (
          <button type="button" className="btn btn-primary" onClick={() => setForm(true)}>
            <Icon name="plus" /> {c.isAdmin ? 'Registra una voce' : 'Dichiara un versamento'}
          </button>
        )}
      </div>

      <section className="grid stats-grid" aria-label="Riepilogo">
        <StatCard label="Il tuo saldo" value={me ? Math.round(balance / 100) : null} suffix=" €" tone={balance < 0 ? 'warning' : 'default'} hint={me ? `${signed(balance)} · ${balance < 0 ? 'devi versare' : balance > 0 ? 'sei in credito' : 'in pari'}` : 'Nessun dato'} />
        <StatCard label="Quote confermate" value={Math.round(c.totals.verifiedCents / 100)} suffix=" €" hint={`${formatEuro(c.totals.declaredCents)} in attesa di conferma`} />
        <StatCard label="Spese del gruppo" value={Math.round(c.totals.expensesCents / 100)} suffix=" €" />
        {c.fund && <StatCard label="Cassa comune" value={Math.round(c.fund.balanceCents / 100)} suffix=" €" hint={`Versamenti ${formatEuro(c.fund.inCents)} · uscite ${formatEuro(c.fund.outCents)}${c.fund.pendingCents ? ` · ${formatEuro(c.fund.pendingCents)} da confermare` : ''}`} />}
      </section>

      <div className="grid-main-side">
        <div className="stack">
          {c.pending.length > 0 && (
            <Card aria-labelledby="pending-title">
              <CardHeader id="pending-title" icon="clock" title="Da confermare" eyebrow="Dichiarati ma non ricevuti" />
              <ul className="list">
                {c.pending.map((e) => (
                  <li key={e.id} className="list-item">
                    <Avatar user={e.user} size={32} />
                    <span className="grow">
                      <span className="player-name">
                        <PlayerName user={e.user} />
                      </span>
                      <span className="player-sub">
                        {TYPE[e.type]}
                        {e.match ? ` · ${e.match.fieldName}` : ''} · {when(e.createdAt)}
                      </span>
                    </span>
                    <span className="num tabular">{formatEuro(e.amountCents)}</span>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => verify(e)} aria-label={`Conferma ${formatEuro(e.amountCents)} di ${e.user.name}`}>
                      <Icon name="check" /> Conferma
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card aria-labelledby="matches-title">
            <CardHeader id="matches-title" icon="calendar" title="Partite" eyebrow="Riepilogo per partita" />
            {c.matches.length === 0 ? (
              <p className="muted">Nessuna partita con un costo registrato.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="visually-hidden">Costo, quota e stato dei pagamenti per partita</caption>
                  <thead>
                    <tr>
                      <th scope="col">Partita</th>
                      <th scope="col">Costo</th>
                      <th scope="col">Quota</th>
                      <th scope="col">Confermato</th>
                      <th scope="col">Dichiarato</th>
                      <th scope="col">Mancante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.matches.map((m) => (
                      <tr key={m.id}>
                        <th scope="row">
                          <Link to={`/partite/${m.id}`}>
                            {new Date(m.startsAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })} · {m.fieldName}
                          </Link>
                        </th>
                        <td className="tabular">{formatEuro(m.costCents)}</td>
                        <td className="tabular">{formatEuro(m.quotaCents)}</td>
                        <td className="tabular">
                          {formatEuro(m.verifiedCents)} <small>({m.paidCount}/{m.confirmed})</small>
                        </td>
                        <td className="tabular">{formatEuro(m.declaredCents)}</td>
                        <td className="tabular">{formatEuro(m.missingCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <History group={group} canManage={c.isAdmin} meId={me?.userId} reloadKey={tick} onChange={reload} />
        </div>

        <div className="stack">
          {c.members ? (
            <Card aria-labelledby="balances-title">
              <CardHeader id="balances-title" icon="users" title="Saldi dei membri" eyebrow="Solo admin" />
              <ul className="list">
                {c.members.map((m) => (
                  <li key={m.userId} className="list-item">
                    <Avatar user={m.user} size={32} />
                    <span className="grow">
                      <span className="player-name">
                        <PlayerName user={m.user} />
                      </span>
                      <span className="player-sub">
                        dovuto {formatEuro(m.dueCents)} · pagato {formatEuro(m.paidCents)}
                        {m.declaredCents > 0 && ` · dichiarato ${formatEuro(m.declaredCents)}`}
                      </span>
                    </span>
                    <span className={`num tabular ${m.balanceCents < 0 ? 'is-debt' : ''}`} aria-label={`Saldo ${signed(m.balanceCents)}`}>
                      {signed(m.balanceCents)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="player-sub">Il saldo conta solo le voci confermate: pagato e versato, più le spese anticipate, meno il dovuto e i rimborsi.</p>
            </Card>
          ) : (
            <EmptyState title="I saldi sono privati">Vedi il tuo saldo e la cassa comune; i saldi degli altri membri li vedono solo gli admin.</EmptyState>
          )}
        </div>
      </div>

      {form && (
        <EntryForm
          group={group}
          admin={c.isAdmin}
          onClose={() => setForm(false)}
          onSaved={() => {
            setForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
