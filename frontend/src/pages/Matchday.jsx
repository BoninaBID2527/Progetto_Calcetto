import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../components/Icon';
import Pitch from '../components/Pitch';
import { FieldSymbol } from '../components/FieldBadge';
import { Avatar, PlayerName } from '../components/Avatar';
import { ROLE_SHORT } from '../components/player/PlayerCard';
import { shareOrDownload } from '../components/player/exportCard';
import { exportPosterPng } from '../components/match/exportPoster';
import { Button, Card, CardHeader, CardSkeleton, Countdown, EmptyState, StatusPill } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { formatDay, formatEuro, formatTime } from '../utils/format';

export default function Matchday() {
  const { matchId } = useParams();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [drawKey, setDrawKey] = useState(0);
  const { data, error, loading, reload } = useResource(async () => {
    const [md, detail] = await Promise.all([api(`/matches/${matchId}/matchday`), api(`/matches/${matchId}`)]);
    return { ...md.matchday, canManage: detail.canManage };
  }, [matchId]);
  useRealtimeEvent('match:updated', (m) => m.id === matchId && reload());
  useOnReconnect(reload);

  if (loading) {
    return (
      <div className="page">
        <CardSkeleton lines={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <EmptyState title="Matchday non disponibile" action={<Button to="/" variant="primary">Torna alla home</Button>}>
          {error.message}
        </EmptyState>
      </div>
    );
  }

  const { match, field, players, teams, inForm, rivalries, canManage } = data;
  const overallById = Object.fromEntries(players.map((p) => [p.user.id, `${p.overall}${p.provisional ? '*' : ''}`]));

  const rebalance = async () => {
    setBusy(true);
    try {
      await api(`/matches/${match.id}/teams/balance`, { method: 'POST', body: {} });
      setDrawKey((k) => k + 1);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const exportPoster = async (format) => {
    try {
      const blob = await exportPosterPng(data, format);
      const how = await shareOrDownload(blob, `matchday-${field.key}-${format}.png`, 'Matchday');
      if (how === 'downloaded') toast.success(`Locandina ${format} scaricata.`);
    } catch (err) {
      if (err.name !== 'AbortError') toast.error("Non sono riuscito a creare la locandina.");
    }
  };

  return (
    <div className="page matchday">
      <Button variant="ghost" size="sm" icon="chevron-left" to={`/partite/${match.id}`} style={{ justifySelf: 'start' }}>
        Scheda della partita
      </Button>

      <motion.section
        className="poster"
        style={{ '--field-color': field.color }}
        initial={reduce ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        aria-labelledby="md-title"
      >
        <span className="poster-symbol" aria-hidden="true">
          <FieldSymbol symbol={field.symbol} />
        </span>
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="overline">Matchday</span>
            <StatusPill status={match.status} />
          </div>
          <h1 id="md-title" className="poster-title">
            {field.name}
          </h1>
          <p className="poster-when">
            {formatDay(match.startsAt, { short: false })} · <span className="tabular">{formatTime(match.startsAt)}</span>
          </p>
          <p className="muted">
            {field.town} · {match.durationMinutes} minuti{match.quotaCents ? ` · ${formatEuro(match.quotaCents)} a testa` : ''}
          </p>
        </div>
        <div className="poster-side">
          <Countdown to={match.startsAt} />
          <div className="btn-row">
            <Button icon="download" onClick={() => exportPoster('verticale')}>
              Locandina verticale
            </Button>
            <Button variant="ghost" icon="image" onClick={() => exportPoster('quadrato')}>
              Quadrata
            </Button>
          </div>
        </div>
      </motion.section>

      <div className="grid-main-side">
        <Card aria-labelledby="formations-title">
          <CardHeader
            id="formations-title"
            eyebrow={teams ? 'Formazioni' : 'In attesa delle squadre'}
            title={teams ? `${teams.a.name} contro ${teams.b.name}` : 'Le squadre'}
            icon="shield"
            action={
              canManage &&
              ['aperta', 'chiusa'].includes(match.status) && (
                <Button variant="accent" size="sm" icon="scale" onClick={rebalance} loading={busy}>
                  {teams ? 'Rigenera' : 'Bilancia'}
                </Button>
              )
            }
          />
          {match.teams ? (
            <>
              <div className="versus" aria-label={`Media overall: ${teams.a.name} ${teams.a.avgOverall ?? 'n.d.'}, ${teams.b.name} ${teams.b.avgOverall ?? 'n.d.'}`}>
                <span>
                  <small>{teams.a.name}</small>
                  <b className="tabular">{teams.a.avgOverall ?? '—'}</b>
                </span>
                <i aria-hidden="true">VS</i>
                <span>
                  <small>{teams.b.name}</small>
                  <b className="tabular">{teams.b.avgOverall ?? '—'}</b>
                </span>
              </div>
              <Pitch key={drawKey} teams={match.teams} badges={overallById} drawing={drawKey > 0} />
              <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                Il numero accanto a ogni nome è l'overall della BONCARD; l'asterisco indica un valore ancora provvisorio. Le squadre si possono ritoccare a mano dalla scheda della partita.
              </p>
            </>
          ) : (
            <p className="muted">{canManage ? 'Premi «Bilancia» per dividere i convocati in base all\'overall, al ruolo e ai portieri.' : "L'organizzatore non ha ancora fatto le squadre."}</p>
          )}
        </Card>

        <div className="stack">
          <Card aria-labelledby="form-title">
            <CardHeader id="form-title" eyebrow="Ultime 3 partite" title="In forma" icon="flame" />
            {inForm.length ? (
              <ul className="list">
                {inForm.map((p) => (
                  <li key={p.user.id} className="list-item">
                    <Avatar user={p.user} size={34} />
                    <span className="grow player-name">
                      <PlayerName user={p.user} />
                    </span>
                    <span className="chip chip-primary">voto {String(p.formAvg).replace('.', ',')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nessuno sopra la propria media nelle ultime 3 partite valutate.</p>
            )}
          </Card>
          <Card aria-labelledby="riv-title">
            <CardHeader id="riv-title" eyebrow="Almeno 3 scontri diretti" title="Rivalità in campo" icon="rivalry" />
            {rivalries.length ? (
              <ul className="list">
                {rivalries.map((r) => (
                  <li key={`${r.a.id}-${r.b.id}`} className="list-item">
                    <span className="grow">
                      <span className="player-name">
                        <PlayerName user={r.a} /> <span className="muted">vs</span> <PlayerName user={r.b} />
                      </span>
                      <span className="player-sub">
                        {r.opposed.winsA}-{r.opposed.draws}-{r.opposed.winsB} in {r.opposed.played} scontri
                        {r.streak ? ` · serie di ${r.streak.length} per ${r.streak.user === r.a.id ? r.a.name : r.b.name}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nessuna coppia di convocati si è ancora affrontata abbastanza volte.</p>
            )}
          </Card>
        </div>
      </div>

      <Card aria-labelledby="squad-title">
        <CardHeader id="squad-title" eyebrow={`${players.length} confermati`} title="I convocati" icon="users" />
        <ul className="squad">
          {players.map((p) => (
            <li key={p.user.id}>
              <Link to={`/gruppi/${match.groupId}/giocatori/${p.user.id}`} className="squad-item">
                <span className="squad-ovr tabular">
                  {p.overall}
                  {p.provisional && <span className="visually-hidden"> (provvisorio)</span>}
                </span>
                <Avatar user={p.user} size={40} />
                <span className="grow">
                  <span className="player-name">
                    <PlayerName user={p.user} />
                  </span>
                  <span className="player-sub">
                    {ROLE_SHORT[p.user.preferredRole] || 'Ruolo libero'} · {p.played} partite · {p.goals} gol
                  </span>
                </span>
                {p.inForm && <Icon name="flame" title="In forma" />}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
