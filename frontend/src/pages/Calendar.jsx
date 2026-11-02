import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import SeriesPanel from '../components/calendar/SeriesPanel';
import { Card, CardHeader, CardSkeleton, EmptyState, ErrorState, Segmented } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { MONTHS, WEEKDAYS_SHORT, addDays, addMonths, dayLabel, monthGrid, startOfWeek, timeIn, todayIn, weekDays } from '../utils/calendar';

const VIEWS = [
  { value: 'mese', label: 'Mese' },
  { value: 'settimana', label: 'Settimana' },
  { value: 'prossime', label: 'Prossime' },
  { value: 'passate', label: 'Passate' },
];
const AVAILABILITY = [
  { value: 'disponibile', label: 'Ci sono' },
  { value: 'forse', label: 'Forse' },
  { value: 'non_disponibile', label: 'Non ci sono' },
];
const STATUS = { aperta: 'Aperta', chiusa: 'Chiusa', giocata: 'Giocata', archiviata: 'Giocata', annullata: 'Annullata' };

function rangeFor(view, cursor, today) {
  if (view === 'mese') {
    const grid = monthGrid(cursor);
    return { from: grid[0], to: grid[41] };
  }
  if (view === 'settimana') return { from: startOfWeek(cursor), to: addDays(startOfWeek(cursor), 6) };
  if (view === 'prossime') return { from: today, to: addDays(today, 90) };
  return { from: addDays(today, -90), to: addDays(today, -1) };
}

function titleFor(view, cursor) {
  if (view === 'mese') return `${MONTHS[Number(cursor.slice(5, 7)) - 1]} ${cursor.slice(0, 4)}`;
  if (view === 'settimana') {
    const w = weekDays(cursor);
    return `${dayLabel(w[0])} – ${dayLabel(w[6])}`;
  }
  return view === 'prossime' ? 'Prossimi 90 giorni' : 'Ultimi 90 giorni';
}

function ItemLine({ item, showGroup }) {
  const cancelled = item.status === 'annullata';
  return (
    <Link to={item.link} className={`cal-item ${item.type === 'convocazione' ? 'is-poll' : ''} ${cancelled ? 'is-cancelled' : ''}`} style={{ '--group-color': item.groupColor }}>
      <span className="cal-time tabular">{timeIn(item.startsAt, item.timezone)}</span>
      <span className="grow">
        <span className="player-name">
          {item.type === 'convocazione' ? 'BONCALL · ' : ''}
          {item.fieldName}
          {item.recurring && <Icon name="repeat" />}
          {item.recurring && <span className="visually-hidden"> (ricorrente)</span>}
        </span>
        <span className="player-sub">
          {showGroup && `${item.groupName} · `}
          {item.type === 'partita' ? `${STATUS[item.status]} · ${item.confirmed}/${item.slots}` : `${item.confirmed}/${item.playersNeeded} confermati`}
          {item.myResponse === 'ci_sono' && ' · ci sei'}
          {item.myResponse === 'forse' && ' · forse'}
        </span>
      </span>
    </Link>
  );
}

function Availability({ group, date, info, onChange }) {
  const toast = useToast();
  const set = async (status) => {
    try {
      if (info?.mine === status) await api(`/groups/${group.id}/availability/${date}`, { method: 'DELETE' });
      else await api(`/groups/${group.id}/availability/${date}`, { method: 'PUT', body: { status } });
      onChange();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="overline">La tua disponibilità · {group.name}</span>
      <Segmented label={`Disponibilità per ${dayLabel(date)}`} options={AVAILABILITY} value={info?.mine || ''} onChange={set} />
      <p className="player-sub">
        {info ? `${info.disponibile} disponibili, ${info.forse} forse, ${info.non_disponibile} no` : 'Nessuno ha ancora risposto per questo giorno.'}
        {info?.available?.length > 0 && ` · ${info.available.map((u) => u.nickname || u.name).join(', ')}`}
      </p>
    </div>
  );
}

export default function Calendar() {
  const { groups } = useAppData();
  const toast = useToast();
  const [view, setView] = useState('mese');
  const [groupId, setGroupId] = useState('');
  const today = todayIn();
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);
  const range = useMemo(() => rangeFor(view, cursor, today), [view, cursor, today]);
  const group = groups?.find((g) => g.id === groupId) || null;

  const { data, error, loading, reload } = useResource(async () => {
    const q = `from=${range.from}&to=${range.to}${groupId ? `&group=${groupId}` : ''}`;
    const [cal, av] = await Promise.all([api(`/calendar?${q}`), groupId ? api(`/groups/${groupId}/availability?from=${range.from}&to=${range.to}`) : null]);
    return { ...cal, availability: av?.days || {} };
  }, [range.from, range.to, groupId]);

  useRealtimeEvent('match:updated', reload);
  useRealtimeEvent('match:created', reload);
  useOnReconnect(reload);

  const byDay = useMemo(() => {
    const map = {};
    for (const i of data?.items || []) (map[i.date] ||= []).push(i);
    return map;
  }, [data]);

  const move = (dir) => {
    if (view === 'mese') setCursor(addMonths(cursor, dir));
    else if (view === 'settimana') setCursor(addDays(cursor, 7 * dir));
  };
  const goToday = () => {
    setCursor(today);
    setSelected(today);
  };

  const download = async () => {
    try {
      const res = await fetch(`/api/calendar/export.ics${groupId ? `?group=${groupId}` : ''}`, { headers: { Authorization: `Bearer ${(await import('../api/client')).getToken()}` } });
      if (!res.ok) throw new Error('Esportazione non riuscita.');
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: 'bonmatch.ics' });
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Calendario scaricato: importalo in Google Calendar, Apple Calendar o Outlook.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const showGroup = !groupId && (groups?.length || 0) > 1;
  const days = view === 'mese' ? monthGrid(cursor) : view === 'settimana' ? weekDays(cursor) : [];
  const listDays = Object.keys(byDay).sort((a, b) => (view === 'passate' ? b.localeCompare(a) : a.localeCompare(b)));
  const selectedItems = byDay[selected] || [];

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h2>Calendario</h2>
          <p>Partite, convocazioni aperte e disponibilità. Gli orari sono quelli del fuso del gruppo, con ora legale.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={download}>
          <Icon name="download" /> Esporta .ics
        </button>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Segmented label="Vista del calendario" options={VIEWS} value={view} onChange={setView} />
        <div className="field" style={{ minWidth: 200 }}>
          <label className="label" htmlFor="cal-group">
            Gruppo
          </label>
          <select id="cal-group" className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Tutti i gruppi</option>
            {(groups || []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji} {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <h3 className="cal-title" aria-live="polite">
          {titleFor(view, cursor)}
        </h3>
        {(view === 'mese' || view === 'settimana') && (
          <div className="row">
            <button type="button" className="btn btn-icon" onClick={() => move(-1)} aria-label={view === 'mese' ? 'Mese precedente' : 'Settimana precedente'}>
              <Icon name="chevron-left" />
            </button>
            <button type="button" className="btn btn-ghost" onClick={goToday}>
              Oggi
            </button>
            <button type="button" className="btn btn-icon" onClick={() => move(1)} aria-label={view === 'mese' ? 'Mese successivo' : 'Settimana successiva'}>
              <Icon name="chevron-right" />
            </button>
          </div>
        )}
      </div>

      {loading && !data && <CardSkeleton lines={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && (view === 'mese' || view === 'settimana') && (
        <div className="grid-main-side">
          <div className="stack">
            <div className={`cal-grid ${view === 'settimana' ? 'is-week' : ''}`} role="grid" aria-label={titleFor(view, cursor)}>
              {WEEKDAYS_SHORT.map((w) => (
                <div key={w} className="cal-head" role="columnheader">
                  {w}
                </div>
              ))}
              {days.map((d) => {
                const items = byDay[d] || [];
                const outside = view === 'mese' && d.slice(0, 7) !== cursor.slice(0, 7);
                const av = data.availability[d];
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    className={`cal-cell ${d === today ? 'is-today' : ''} ${d === selected ? 'is-selected' : ''} ${outside ? 'is-outside' : ''}`}
                    aria-selected={d === selected}
                    aria-label={`${dayLabel(d)}: ${items.length} ${items.length === 1 ? 'evento' : 'eventi'}${av?.mine ? `, tu: ${av.mine.replace('_', ' ')}` : ''}`}
                    onClick={() => setSelected(d)}
                  >
                    <span className="cal-num tabular">{Number(d.slice(8))}</span>
                    <span className="cal-dots" aria-hidden="true">
                      {items.slice(0, view === 'settimana' ? 6 : 3).map((i) => (
                        <i key={`${i.type}${i.id}${i.optionKey}`} className={i.type === 'convocazione' ? 'is-poll' : ''} style={{ '--group-color': i.groupColor }}>
                          {view === 'settimana' ? `${timeIn(i.startsAt, i.timezone)} ${i.fieldName}` : ''}
                        </i>
                      ))}
                    </span>
                    {av?.mine && <span className={`cal-av av-${av.mine}`} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="stack">
            <Card aria-labelledby="day-title">
              <CardHeader id="day-title" eyebrow="Giorno" title={dayLabel(selected)} icon="calendar" />
              {selectedItems.length === 0 ? <p className="muted">Nessuna partita o convocazione in questo giorno.</p> : <ul className="list">{selectedItems.map((i) => <li key={`${i.type}${i.id}${i.optionKey}`}><ItemLine item={i} showGroup={showGroup} /></li>)}</ul>}
              {group && selected >= today && <Availability group={group} date={selected} info={data.availability[selected]} onChange={reload} />}
              {!group && <p className="player-sub">Scegli un gruppo per indicare la tua disponibilità.</p>}
            </Card>
            {group && <SeriesPanel group={group} onChanged={reload} />}
          </div>
        </div>
      )}

      {data && (view === 'prossime' || view === 'passate') &&
        (listDays.length === 0 ? (
          <EmptyState title={view === 'prossime' ? 'Niente in programma' : 'Nessuna partita passata'}>
            {view === 'prossime' ? 'Crea una partita o una BONCALL per riempire il calendario.' : 'Qui compariranno le partite giocate.'}
          </EmptyState>
        ) : (
          <div className="stack">
            {listDays.map((d) => (
              <Card key={d} aria-label={dayLabel(d)}>
                <h4 className="overline">{dayLabel(d)}</h4>
                <ul className="list">
                  {byDay[d].map((i) => (
                    <li key={`${i.type}${i.id}${i.optionKey}`}>
                      <ItemLine item={i} showGroup={showGroup} />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}
