import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../components/Icon';
import FieldBadge from '../components/FieldBadge';
import { AvatarStack, Player, PlayerName } from '../components/Avatar';
import { POLL_STATUS, myPollResponse } from '../components/boncall/PollCard';
import { Button, Card, CardHeader, CardSkeleton, Countdown, EmptyState, ProgressBar, StatusPill, useConfirm } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { getField } from '../config';
import { formatDateTime, formatDay, formatEuro, formatTime } from '../utils/format';

const LABEL = { ci_sono: 'Confermati', attesa: "Lista d'attesa", forse: 'Forse', non_ci_sono: 'Non ci sono' };

function People({ poll, meId }) {
  const groups = ['ci_sono', 'attesa', 'forse', 'non_ci_sono'].map((r) => [r, poll.responses.filter((x) => x.response === r)]);
  return (
    <div className="stack">
      {groups.map(([r, list]) =>
        list.length || r === 'ci_sono' ? (
          <div key={r} className="stack" style={{ gap: 'var(--space-2)' }}>
            <h3 className="overline">
              {LABEL[r]} ({list.length})
            </h3>
            {list.length ? (
              <ul className="people">
                {list.map((x, i) => (
                  <li key={x.user.id} className={`people-enter ${x.user.id === meId ? 'is-me' : ''}`}>
                    {(r === 'ci_sono' || r === 'attesa') && <span className="pos">{r === 'attesa' ? `${i + 1}°` : i + 1}</span>}
                    <span className="grow">
                      <Player user={x.user} size={34} showRole sub={x.promotedAt ? "Entrato dalla lista d'attesa" : null} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Ancora nessuno.</p>
            )}
          </div>
        ) : null
      )}
    </div>
  );
}

export default function PollDetail() {
  const { pollId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);
  const { data, error, loading, reload, setData } = useResource(() => api(`/polls/${pollId}`), [pollId]);
  useRealtimeEvent('poll:updated', (p) => p.id === pollId && setData((d) => (d ? { ...d, poll: p } : d)));
  useOnReconnect(reload);

  if (loading) {
    return (
      <div className="page">
        <CardSkeleton lines={5} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <EmptyState title={error.status === 403 ? 'Convocazione riservata' : 'Convocazione non trovata'} action={<Button to="/" variant="primary">Torna alla home</Button>}>
          {error.status === 403 ? 'È di un gruppo di cui non fai parte.' : error.message}
        </EmptyState>
      </div>
    );
  }

  const { poll, canManage } = data;
  const mine = myPollResponse(poll, user.id);
  const open = ['aperta', 'completa'].includes(poll.status) && new Date(poll.deadline) > new Date();
  const field = poll.mode === 'fissa' ? getField(poll.field) : null;
  const chosenOptions = picked ?? (mine?.response === 'ci_sono' ? mine.options : []);
  const confirmed = poll.responses.filter((r) => r.response === 'ci_sono');
  const progress = poll.mode === 'fissa' ? poll.playersNeeded - poll.freeSlots : poll.playersNeeded - poll.missing;

  const answer = async (response) => {
    setBusy(true);
    try {
      const body = poll.mode === 'opzioni' && response === 'ci_sono' ? { response, options: chosenOptions } : { response };
      const res = await api(`/polls/${poll.id}/response`, { method: 'PUT', body });
      setData((d) => ({ ...d, poll: res.poll }));
      setPicked(null);
      if (res.outcome === 'ci_sono') toast.success('Ci sei! Risposta registrata.');
      else if (res.outcome === 'attesa') toast.info("Posti finiti: sei in lista d'attesa. Se qualcuno si ritira entri da solo.");
      else toast.info('Risposta registrata.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const convert = async (option) => {
    setBusy(true);
    try {
      const res = await api(`/polls/${poll.id}/convert`, { method: 'POST', body: option ? { option } : {} });
      toast.success('Partita creata: si gioca!');
      navigate(`/partite/${res.match.id}`);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  const cancel = async () => {
    const ok = await confirm({ title: 'Annullare la convocazione?', message: 'Chi ha risposto riceverà un avviso.', confirmLabel: 'Annulla convocazione', danger: true });
    if (!ok) return;
    try {
      const res = await api(`/polls/${poll.id}/cancel`, { method: 'POST' });
      setData((d) => ({ ...d, poll: res.poll }));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleOption = (key) => {
    const set = new Set(chosenOptions);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    setPicked([...set]);
  };

  return (
    <div className="page">
      <Button variant="ghost" size="sm" icon="chevron-left" to={`/gruppi/${poll.groupId}/boncall`} style={{ justifySelf: 'start' }}>
        Convocazioni
      </Button>

      <motion.section
        className="boncall-hero"
        style={{ '--field-color': field?.color || 'var(--c-orange)' }}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        aria-labelledby="poll-title"
      >
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="overline">
              <Icon name="boncall" /> BONCALL di <PlayerName user={poll.author} />
            </span>
            <StatusPill status={poll.status === 'aperta' ? 'aperta' : poll.status === 'completa' ? 'chiusa' : 'archiviata'} label={POLL_STATUS[poll.status]} />
          </div>
          <h1 id="poll-title" className="hero-day" style={{ fontSize: 'var(--fs-3xl)' }}>
            {poll.mode === 'fissa' ? (
              <>
                {formatDay(poll.startsAt, { short: false })}
                <span className="hero-time">{formatTime(poll.startsAt)}</span>
              </>
            ) : (
              'Quando giochiamo?'
            )}
          </h1>
          {field && (
            <p className="hero-field">
              <FieldBadge fieldKey={poll.field} size={28} /> {field.name} <span className="muted">· {field.town}</span>
            </p>
          )}
          {poll.costCents > 0 && (
            <p className="kv">
              <Icon name="euro" /> Campo {formatEuro(poll.costCents)} in totale
            </p>
          )}
          {poll.notes && (
            <p className="kv" style={{ alignItems: 'flex-start' }}>
              <Icon name="info" /> <span>{poll.notes}</span>
            </p>
          )}
        </div>
        <div className="hero-side">
          {open ? <Countdown to={poll.deadline} label="Risposte entro" /> : <span className="overline">Risposte chiuse {formatDateTime(poll.deadline).toLowerCase()}</span>}
          <div className="hero-slots">
            <div className="spread">
              <span className="slots-count">
                {progress}
                <small>/{poll.playersNeeded}</small>
              </span>
              <span className={`chip ${poll.missing ? 'chip-orange' : 'chip-primary'}`}>{poll.missing ? `Mancano ${poll.missing}` : 'Ci sono tutti'}</span>
            </div>
            <ProgressBar value={progress} max={poll.playersNeeded} label="Giocatori trovati" tone="orange" />
            {confirmed.length > 0 && <AvatarStack users={confirmed.map((r) => r.user)} max={8} label={`Confermati: ${confirmed.map((r) => r.user.name).join(', ')}`} />}
          </div>
        </div>
      </motion.section>

      {poll.status === 'convertita' && poll.matchId && (
        <Link to={`/partite/${poll.matchId}`} className="todo-card">
          <span className="todo-icon">
            <Icon name="calendar" />
          </span>
          <span className="stack" style={{ gap: 2 }}>
            <strong>Convocazione confermata: la partita è in calendario</strong>
            <span className="muted">Apri la partita per squadre, quote e risultato.</span>
          </span>
          <Icon name="chevron-right" />
        </Link>
      )}

      <div className="grid-main-side">
        <div className="stack">
          {poll.mode === 'opzioni' && (
            <Card aria-labelledby="options-title">
              <CardHeader id="options-title" eyebrow="Scegli quando ci sei" title="Le alternative" icon="vote" />
              <ul className="option-list">
                {poll.options.map((o) => {
                  const f = getField(o.field);
                  const checked = chosenOptions.includes(o.key);
                  return (
                    <li key={o.key} className={`option-item ${poll.bestOption === o.key ? 'is-best' : ''}`}>
                      <label className="option-label">
                        <input type="checkbox" checked={checked} disabled={!open || busy} onChange={() => toggleOption(o.key)} />
                        <FieldBadge fieldKey={o.field} size={34} />
                        <span className="grow">
                          <span className="player-name">
                            {formatDay(o.startsAt)} · {formatTime(o.startsAt)}
                          </span>
                          <span className="player-sub">
                            {f.name} · {o.available} disponibili su {poll.playersNeeded}
                          </span>
                        </span>
                        {poll.bestOption === o.key && <span className="chip chip-primary">In testa</span>}
                      </label>
                      <ProgressBar value={Math.min(o.available, poll.playersNeeded)} max={poll.playersNeeded} label={`Disponibili per l'alternativa ${o.key}`} />
                      {o.users.length > 0 && <AvatarStack users={o.users} max={8} size={26} label={`Disponibili: ${o.users.map((u) => u.name).join(', ')}`} />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {open && (
            <Card className="stack" aria-labelledby="answer-title">
              <CardHeader id="answer-title" eyebrow={mine ? `Hai risposto: ${LABEL[mine.response].toLowerCase()}` : 'Non hai ancora risposto'} title="La tua risposta" icon="check-circle" />
              <div className="response-bar">
                <button
                  type="button"
                  className={`btn btn-in ${mine?.response === 'ci_sono' && !picked ? 'is-in' : ''}`}
                  onClick={() => answer('ci_sono')}
                  disabled={busy || (poll.mode === 'fissa' && ['ci_sono', 'attesa'].includes(mine?.response)) || (poll.mode === 'opzioni' && !chosenOptions.length)}
                >
                  <Icon name="check" />
                  {poll.mode === 'opzioni' ? (mine?.response === 'ci_sono' ? 'Aggiorna le date' : 'Ci sono') : mine?.response === 'ci_sono' ? 'Ci sei' : mine?.response === 'attesa' ? 'In attesa' : 'Ci sono'}
                </button>
                <Button size="lg" icon="help" onClick={() => answer('forse')} disabled={busy || mine?.response === 'forse'}>
                  Forse
                </Button>
                <Button size="lg" icon="x" onClick={() => answer('non_ci_sono')} disabled={busy || mine?.response === 'non_ci_sono'}>
                  Non ci sono
                </Button>
              </div>
              {poll.mode === 'opzioni' && !chosenOptions.length && <p className="muted">Spunta almeno una delle alternative qui sopra per dire "Ci sono".</p>}
            </Card>
          )}

          <Card aria-labelledby="people-title">
            <CardHeader id="people-title" eyebrow="Si aggiorna in tempo reale" title="Chi ha risposto" icon="users" />
            <People poll={poll} meId={user.id} />
          </Card>
        </div>

        {canManage && ['aperta', 'completa'].includes(poll.status) && (
          <Card variant="feature" accent="var(--c-orange)" className="stack" aria-labelledby="manage-title">
            <CardHeader id="manage-title" eyebrow="Organizzatore" title="Chiudi la convocazione" icon="whistle" />
            <p className="muted">
              {poll.missing ? `Mancano ancora ${poll.missing} giocatori, ma puoi già creare la partita con chi c'è.` : 'Ci sono tutti: crea la partita e chi ha risposto viene iscritto automaticamente.'}
            </p>
            {poll.mode === 'opzioni' ? (
              poll.options.map((o) => (
                <Button key={o.key} variant={poll.bestOption === o.key ? 'primary' : 'secondary'} icon="calendar" onClick={() => convert(o.key)} disabled={busy || o.available < 2}>
                  Gioca {formatDay(o.startsAt).toLowerCase()} · {formatTime(o.startsAt)} ({o.available})
                </Button>
              ))
            ) : (
              <Button variant="primary" icon="calendar" onClick={() => convert()} disabled={busy || confirmed.length < 2} loading={busy}>
                Trasforma in partita
              </Button>
            )}
            <Button variant="danger" icon="ban" onClick={cancel}>
              Annulla convocazione
            </Button>
          </Card>
        )}
      </div>
      <span className="visually-hidden" aria-live="polite">
        {poll.missing ? `Mancano ${poll.missing} giocatori` : 'Convocazione completa'}
      </span>
    </div>
  );
}
