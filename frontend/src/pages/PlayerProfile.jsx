import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import PlayerCard from '../components/player/PlayerCard';
import { exportCardPng, shareOrDownload } from '../components/player/exportCard';
import Achievements from '../components/player/Achievements';
import LineChart from '../components/charts/LineChart';
import FieldBadge from '../components/FieldBadge';
import { Button, Card, CardHeader, CardSkeleton, ErrorState, SegmentedControl, StatCard } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getField, TIME_ZONE } from '../config';
import { formatDay } from '../utils/format';

const shortDate = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: TIME_ZONE });
const pct = (v) => `${Math.round(v)}%`;
const one = (v) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(v);
const RESULT = { V: 'Vittoria', P: 'Pareggio', S: 'Sconfitta' };

function Breakdown({ card, self }) {
  const o = card.overall;
  return (
    <Card aria-labelledby="ovr-title">
      <CardHeader id="ovr-title" eyebrow="Trasparenza" title={self ? 'Come nasce il tuo overall' : "Come nasce l'overall"} icon="info" />
      <ul className="breakdown">
        <li>
          <span>Voto generale</span>
          <b className="tabular">{String(o.general).replace('.', ',')}</b>
          <small>media dei {o.samples.ratings} voti ricevuti, con 4 voti "neutri" da 5 che smorzano gli estremi</small>
        </li>
        <li>
          <span>Overall tecnico</span>
          <b className="tabular">{o.technical ?? '—'}</b>
          <small>{o.technical === null ? 'servono valutazioni su almeno 3 abilità' : `attributi pesati per ruolo (${card.weights})`}</small>
        </li>
        <li>
          <span>Forma recente</span>
          <b className="tabular">{o.form > 0 ? '+' : ''}{String(o.form).replace('.', ',')}</b>
          <small>scarto delle ultime {o.samples.recentRated} partite valutate dalla media, limitato a ±1</small>
        </li>
      </ul>
      <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
        Overall = 10 × (voto generale{o.technical !== null ? ' × 0,6 + tecnico × 0,4' : ''} + forma × 0,5), tra 40 e 99.
        {o.provisional && ' È provvisorio finché non ci sono almeno 3 partite e 5 voti.'}
      </p>
    </Card>
  );
}

function Editions({ list }) {
  if (!list.length) return null;
  return (
    <Card aria-labelledby="ed-title">
      <CardHeader id="ed-title" eyebrow="Edizioni speciali" title="Le carte da sbloccare" icon="sparkles" />
      <ul className="editions">
        {list.map((e) => (
          <li key={e.key} className={e.unlocked ? 'is-unlocked' : ''}>
            <span className={`edition-dot edition-${e.key}`} aria-hidden="true" />
            <span className="grow">
              <span className="player-name">
                {e.label} {e.unlocked && <span className="chip chip-primary">Sbloccata</span>}
              </span>
              <span className="player-sub">{e.unlocked ? e.reason : e.requirement}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function PlayerProfile() {
  const { group } = useOutletContext();
  const { userId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const self = userId === user.id;
  const [scope, setScope] = useState('gruppo');
  const [exporting, setExporting] = useState(false);
  const card = useResource(() => api(`/groups/${group.id}/players/${userId}/card?scope=${scope}`).then((r) => r.card), [group.id, userId, scope]);
  const ach = useResource(() => api(`/groups/${group.id}/players/${userId}/achievements`), [group.id, userId]);
  const prog = useResource(() => api(`/groups/${group.id}/players/${userId}/progression`).then((r) => r.progression), [group.id, userId]);

  const exportPng = async () => {
    setExporting(true);
    try {
      const blob = await exportCardPng(card.data);
      const how = await shareOrDownload(blob, `boncard-${card.data.user.name.toLowerCase().replace(/\W+/g, '-')}.png`, 'La mia BONCARD');
      if (how === 'downloaded') toast.success('BONCARD scaricata in formato verticale.');
    } catch (err) {
      if (err.name !== 'AbortError') toast.error("Non sono riuscito a creare l'immagine.");
    } finally {
      setExporting(false);
    }
  };

  if (card.loading && !card.data) {
    return (
      <div className="page">
        <CardSkeleton lines={6} />
      </div>
    );
  }
  if (card.error) {
    return (
      <div className="page">
        <ErrorState error={card.error} onRetry={card.reload} />
      </div>
    );
  }
  const c = card.data;
  const p = prog.data;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <span className="overline">BONCARD · {c.context}</span>
          <h2>{self ? 'La tua carta' : `La carta di ${c.user.name}`}</h2>
          <p>Ogni numero viene dalle partite registrate e dai voti dei compagni. Con pochi dati lo diciamo chiaramente.</p>
        </div>
        {self && (
          <SegmentedControl
            label="Contesto delle statistiche"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'gruppo', label: 'Questo gruppo' },
              { value: 'carriera', label: 'Carriera' },
            ]}
          />
        )}
      </div>

      <div className="player-layout">
        <div className="player-card-col">
          <PlayerCard key={`${c.user.id}-${scope}`} card={c} />
          <Button variant="primary" icon="download" onClick={exportPng} loading={exporting}>
            Esporta in PNG
          </Button>
          <Link to={`/gruppi/${group.id}/wrapped${self ? '' : `?utente=${userId}`}`} className="btn btn-secondary">
            <Icon name="sparkles" /> BONWRAPPED
          </Link>
        </div>
        <div className="stack">
          <Breakdown card={c} self={self} />
          <Editions list={c.editions} />
          {scope === 'gruppo' && <Achievements data={ach.data} />}
        </div>
      </div>

      <section className="stack" aria-labelledby="bonrating-title">
        <div className="page-head-text">
          <span className="overline">BONRATING</span>
          <h2 id="bonrating-title">Progressione</h2>
        </div>
        {prog.loading && <CardSkeleton lines={4} />}
        {p && (
          <>
            <div className="stat-grid">
              <StatCard label="Presenze" value={p.presences.rate === null ? null : p.presences.rate * 100} format={pct} icon="calendar" tone="primary" hint={`${p.presences.played} su ${p.presences.available} partite del gruppo`} />
              <StatCard
                label="Vittorie"
                value={p.winRate.value === null ? null : p.winRate.value * 100}
                format={pct}
                icon="trophy"
                samples={p.winRate.played}
                minSamples={p.minSamples}
              />
              <StatCard label="Gol a partita" value={p.goalsPerMatch.value} format={one} icon="ball" hint={p.goalsPerMatch.matches ? `su ${p.goalsPerMatch.matches} partite con marcatori` : 'nessuna partita con marcatori'} />
              <StatCard label="MVP" value={p.mvp} icon="star" tone="gold" />
              <StatCard label="Forma" value={p.form.avgRating} format={one} icon="trend" hint={p.form.rated ? `voto medio nelle ultime ${p.form.rated} valutate` : 'nessun voto recente'} />
            </div>

            {p.timeline.length ? (
              <Card>
                <LineChart
                  title="Andamento dei voti"
                  description={`${p.timeline.length} partite`}
                  series={[
                    { key: 'match', label: 'Voto della partita', color: 'var(--c-primary)', points: p.timeline.map((t) => ({ y: t.rating })) },
                    { key: 'cum', label: 'Voto generale', color: 'var(--c-gold)', dashed: true, points: p.timeline.map((t) => ({ y: t.cumulative })) },
                  ]}
                  xLabels={p.timeline.map((t, i) => (p.timeline.length <= 8 || i % Math.ceil(p.timeline.length / 8) === 0 ? shortDate.format(new Date(t.date)) : ''))}
                  format={(v) => String(v).replace('.', ',')}
                />
              </Card>
            ) : (
              <p className="muted">Nessuna partita giocata nel gruppo: il grafico comparirà dopo la prima.</p>
            )}

            <div className="dash-grid">
              <Card aria-labelledby="best-title">
                <CardHeader id="best-title" eyebrow="Le serate migliori" title="Migliori prestazioni" icon="flame" />
                {p.best.length ? (
                  <ul className="list">
                    {p.best.map((b) => (
                      <li key={b.matchId}>
                        <Link to={`/partite/${b.matchId}`} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                          <FieldBadge fieldKey={b.field} size={34} />
                          <span className="grow">
                            <span className="player-name">
                              {formatDay(b.date)} · {RESULT[b.result]} {b.score}
                            </span>
                            <span className="player-sub">
                              {b.rating !== null ? `voto ${String(b.rating).replace('.', ',')}` : 'nessun voto'} · {b.goals} gol{b.mvp ? ' · MVP' : ''} · {getField(b.field).name}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Ancora nessuna prestazione da ricordare.</p>
                )}
              </Card>
              <Card aria-labelledby="rec-title">
                <CardHeader id="rec-title" eyebrow="Record personali" title="Nel tuo palmarès" icon="medal" />
                <ul className="breakdown">
                  <li>
                    <span>Più gol in una partita</span>
                    <b className="tabular">{p.records.mostGoals?.goals ?? 0}</b>
                  </li>
                  <li>
                    <span>Voto più alto</span>
                    <b className="tabular">{p.records.bestRating ? String(p.records.bestRating.rating).replace('.', ',') : '—'}</b>
                  </li>
                  <li>
                    <span>Vittorie di fila</span>
                    <b className="tabular">{p.records.winStreak.length}</b>
                  </li>
                  <li>
                    <span>Partite senza sconfitte</span>
                    <b className="tabular">{p.records.unbeaten.length}</b>
                  </li>
                </ul>
              </Card>
            </div>

            {p.seasons.length > 0 && (
              <Card aria-labelledby="seasons-title">
                <CardHeader id="seasons-title" eyebrow="Confronto" title="Stagione per stagione" icon="chart" />
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Stagione</th>
                        <th scope="col">Partite</th>
                        <th scope="col">Vittorie</th>
                        <th scope="col">Gol</th>
                        <th scope="col">MVP</th>
                        <th scope="col">Voto medio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.seasons.map((s) => (
                        <tr key={s.key}>
                          <th scope="row">{s.label}</th>
                          <td>{s.played}</td>
                          <td>{s.played >= p.minSamples ? pct(s.winRate * 100) : `${s.wins} su ${s.played}`}</td>
                          <td>{s.goals}</td>
                          <td>{s.mvp}</td>
                          <td>{s.avgRating === null ? '—' : String(s.avgRating).replace('.', ',')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                  Con meno di {p.minSamples} partite mostriamo le vittorie come numero, non come percentuale.
                </p>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}
