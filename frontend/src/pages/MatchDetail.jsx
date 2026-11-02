import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import FieldBadge from '../components/FieldBadge';
import { AvatarStack, PlayerName } from '../components/Avatar';
import { CardSkeleton, EmptyState, SlotsBar, StatusPill } from '../components/ui';
import { myParticipation } from '../components/MatchCard';
import ParticipantsPanel from '../components/match/ParticipantsPanel';
import TeamsPanel from '../components/match/TeamsPanel';
import ResultPanel from '../components/match/ResultPanel';
import VotingPanel from '../components/match/VotingPanel';
import PrizePanel from '../components/match/PrizePanel';
import ReportPanel from '../components/match/ReportPanel';
import ManagePanel from '../components/match/ManagePanel';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { getField } from '../config';
import { formatDay, formatEuro, formatTime, formatDateLong } from '../utils/format';
import { responseToast } from './GroupMatches';

function MyStatus({ mine }) {
  if (mine.response === 'ci_sono')
    return (
      <span className="chip chip-primary">
        <Icon name="check" /> Ci sei
      </span>
    );
  if (mine.response === 'attesa') return <span className="chip chip-orange">In lista d'attesa · {mine.queuePosition}°</span>;
  if (mine.response === 'forse') return <span className="chip chip-yellow">Hai detto forse</span>;
  if (mine.response === 'non_ci_sono') return <span className="chip">Hai detto che non ci sei</span>;
  return <span className="chip">Non hai ancora risposto</span>;
}

export default function MatchDetail() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { match, canManage } = await api(`/matches/${matchId}`);
    const [votingRes, reportRes] = await Promise.all([
      match.voting ? api(`/matches/${matchId}/voting`) : null,
      match.result ? api(`/matches/${matchId}/report`) : null,
    ]);
    return { match, canManage, voting: votingRes?.voting || null, report: reportRes?.report || null };
  }, [matchId]);

  const { data, error, loading, reload, setData } = useResource(load, [matchId]);
  const setMatch = (match) => {
    setData((d) => ({ ...d, match }));
    // Risultato e votazioni dipendono dalla partita: li riallineo in silenzio.
    if (match.voting || match.result) reload();
  };

  useRealtimeEvent('match:updated', (m) => {
    if (m.id !== matchId) return;
    setData((d) => (d ? { ...d, match: m } : d));
    if (m.voting) reload();
  });
  useRealtimeEvent('voting:updated', (v) => v.matchId === matchId && reload());
  useOnReconnect(reload);

  if (loading) {
    return (
      <div className="page">
        <CardSkeleton lines={5} />
        <div className="grid-main-side">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <EmptyState
          title={error.status === 403 ? 'Partita riservata' : 'Partita non trovata'}
          action={
            <Link to="/" className="btn btn-primary">
              Torna alle partite
            </Link>
          }
        >
          {error.status === 403 ? 'Questa partita è di un gruppo di cui non fai parte.' : error.message}
        </EmptyState>
      </div>
    );
  }

  const { match, canManage, voting, report } = data;
  const field = getField(match.field);
  const mine = myParticipation(match, user.id);
  const confirmed = match.participants.filter((p) => p.response === 'ci_sono').map((p) => p.user);
  const open = match.status === 'aperta';

  const respond = async (response) => {
    setBusy(true);
    try {
      const res = await api(`/matches/${match.id}/response`, { method: 'PUT', body: { response } });
      setData((d) => ({ ...d, match: res.match }));
      responseToast(toast, res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setPayment = async (userId, paid) => {
    setBusy(true);
    try {
      const res = await api(`/matches/${match.id}/participants/${userId}/payment`, { method: 'PATCH', body: { paid } });
      setData((d) => ({ ...d, match: res.match }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setVoting = (v) => {
    setData((d) => ({ ...d, voting: v }));
    reload();
  };

  return (
    <div className="page">
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <Link to={`/gruppi/${match.groupId}/partite`} className="btn btn-ghost btn-sm">
          <Icon name="chevron-left" /> Partite del gruppo
        </Link>
        {['aperta', 'chiusa'].includes(match.status) && (
          <Link to={`/partite/${match.id}/matchday`} className="btn btn-sm btn-primary">
            <Icon name="zap" /> Apri MATCHDAY
          </Link>
        )}
      </div>

      <section className="match-hero" style={{ '--field-color': field.color }} aria-labelledby="match-title">
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <FieldBadge fieldKey={match.field} size={60} />
          <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
            <StatusPill status={match.status} />
            <h1 id="match-title" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.4rem)' }}>
              {field.name}
            </h1>
            <span className="muted" style={{ fontSize: '0.92rem' }}>
              {field.town} · organizza <PlayerName user={match.organizer} />
            </span>
          </div>
        </div>
        <div className="match-hero-grid">
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            <div className="match-when">
              <span className="match-day">{formatDay(match.startsAt, { short: false })}</span>
              <span className="match-time">{formatTime(match.startsAt)}</span>
            </div>
            <div className="row">
              {['Oggi', 'Domani', 'Ieri'].includes(formatDay(match.startsAt)) && (
                <span className="kv">
                  <Icon name="calendar" /> {formatDateLong(match.startsAt)}
                </span>
              )}
              <span className="kv">
                <Icon name="clock" /> {match.durationMinutes} minuti
              </span>
              {match.costCents > 0 && (
                <span className="kv">
                  <Icon name="euro" /> <strong>{match.quotaCents ? formatEuro(match.quotaCents) : formatEuro(match.costCents)}</strong>
                  {match.quotaCents ? ' a testa' : ' in totale'}
                </span>
              )}
            </div>
            {match.notes && (
              <p className="kv" style={{ alignItems: 'flex-start' }}>
                <Icon name="info" /> <span>{match.notes}</span>
              </p>
            )}
          </div>
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            <SlotsBar taken={match.counts.ci_sono} slots={match.slots} waiting={match.counts.attesa} />
            <div className="spread">
              {confirmed.length > 0 ? <AvatarStack users={confirmed} max={7} label={`Presenti: ${confirmed.map((u) => u.name).join(', ')}`} /> : <span className="muted">Nessun iscritto</span>}
              <MyStatus mine={mine} />
            </div>
          </div>
        </div>
        {open && (
          <div className="response-bar sticky-cta">
            <button
              type="button"
              className={`btn btn-in ${mine.response === 'ci_sono' ? 'is-in' : ''}`}
              onClick={() => respond('ci_sono')}
              disabled={busy || mine.response === 'ci_sono' || mine.response === 'attesa'}
            >
              <Icon name="check" />
              {mine.response === 'ci_sono' ? 'Ci sei' : mine.response === 'attesa' ? 'In attesa' : 'Ci sono'}
            </button>
            <button type="button" className="btn btn-lg" aria-pressed={mine.response === 'forse'} onClick={() => respond('forse')} disabled={busy || mine.response === 'forse'}>
              <Icon name="help" /> Forse
            </button>
            <button type="button" className="btn btn-lg" aria-pressed={mine.response === 'non_ci_sono'} onClick={() => respond('non_ci_sono')} disabled={busy || mine.response === 'non_ci_sono'}>
              <Icon name="x" /> Non ci sono
            </button>
          </div>
        )}
      </section>

      <div className="grid-main-side">
        <div className="stack">
          {report && <ReportPanel report={report} />}
          <ResultPanel match={match} canManage={canManage} onUpdated={setMatch} hasReport={Boolean(report)} />
          {voting && <VotingPanel match={match} voting={voting} meId={user.id} onChange={setVoting} />}
          {voting && <PrizePanel match={match} voting={voting} report={report} onChange={setVoting} />}
          {match.status !== 'annullata' && <TeamsPanel match={match} canManage={canManage} onUpdated={setMatch} />}
        </div>
        <div className="stack">
          <ParticipantsPanel match={match} meId={user.id} canManage={canManage} onPayment={setPayment} busy={busy} />
          {canManage && <ManagePanel match={match} voting={voting} onUpdated={setMatch} />}
        </div>
      </div>
    </div>
  );
}
