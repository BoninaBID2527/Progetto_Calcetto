'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, createGroup, createUser, joinGroup, respond } = require('./helpers');
const { Match, MatchSeries, Group } = require('../src/models');
const zone = require('../src/utils/zone');
const seriesService = require('../src/services/seriesService');
const calendarService = require('../src/services/calendarService');

useTestDatabase();

describe('Fusi orari e ora legale', () => {
  test('Europe/Rome: +60 in inverno, +120 in estate', () => {
    expect(zone.offsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Europe/Rome')).toBe(60);
    expect(zone.offsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Europe/Rome')).toBe(120);
  });

  test('le 21:00 locali cambiano istante UTC a cavallo dell\'ora legale', () => {
    expect(zone.zonedToUtc('2026-03-26', '21:00').toISOString()).toBe('2026-03-26T20:00:00.000Z'); // giovedì prima del cambio
    expect(zone.zonedToUtc('2026-04-02', '21:00').toISOString()).toBe('2026-04-02T19:00:00.000Z'); // giovedì dopo
    expect(zone.zonedToUtc('2026-10-22', '21:00').toISOString()).toBe('2026-10-22T19:00:00.000Z');
    expect(zone.zonedToUtc('2026-10-29', '21:00').toISOString()).toBe('2026-10-29T20:00:00.000Z');
    expect(zone.zonedToUtc('2026-07-01', '21:00', 'America/New_York').toISOString()).toBe('2026-07-02T01:00:00.000Z');
  });

  test('calendario puro: giorno della settimana ISO, somma di giorni, validazione', () => {
    expect(zone.isoWeekday('2026-11-05')).toBe(4); // giovedì
    expect(zone.isoWeekday('2026-11-08')).toBe(7); // domenica
    expect(zone.addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(zone.isYmd('2026-02-30')).toBe(false);
    expect(zone.isYmd('2026-02-28')).toBe(true);
    expect(zone.isValidZone('Europe/Rome')).toBe(true);
    expect(zone.isValidZone('Marte/Olympus')).toBe(false);
    expect(zone.ymdIn(new Date('2026-06-30T22:30:00Z'), 'Europe/Rome')).toBe('2026-07-01'); // dopo mezzanotte locale
  });
});

describe('Partite ricorrenti', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });
  const body = (extra = {}) => ({ field: 'santena', weekday: 4, time: '21:00', startsOn: zone.ymdIn(new Date()), slots: 10, costCents: 6000, ...extra });
  const create = (who = ctx.admin, extra = {}) => api().post(`/api/groups/${ctx.group.id}/series`).set(who.auth).send(body(extra));

  test('creazione: genera le prossime 4 settimane, notifica una volta, orario locale corretto', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.series).toMatchObject({ weekday: 4, weekdayLabel: 'giovedì', time: '21:00', timezone: 'Europe/Rome' });
    expect(res.body.created).toBeGreaterThanOrEqual(4);
    expect(res.body.created).toBeLessThanOrEqual(5);
    const matches = await Match.find({ series: res.body.series.id }).sort({ startsAt: 1 }).lean();
    for (const m of matches) {
      expect(zone.isoWeekday(m.occurrenceKey)).toBe(4);
      expect(zone.zonedToUtc(m.occurrenceKey, '21:00').toISOString()).toBe(new Date(m.startsAt).toISOString());
      expect(m.freeSlots).toBe(10);
    }
    const notes = await api().get('/api/notifications').set(ctx.members[0].auth);
    expect(notes.body.notifications.filter((n) => /ricorrente/i.test(n.title))).toHaveLength(1);
  });

  test('rigenerare è idempotente (anche in parallelo) e non ricrea occorrenze annullate', async () => {
    const group = await Group.findById(ctx.group.id);
    const series = await MatchSeries.findOne({ group: ctx.group.id });
    const before = await Match.countDocuments({ series: series._id });
    await Promise.all(Array.from({ length: 4 }, () => seriesService.materialize(series, group)));
    expect(await Match.countDocuments({ series: series._id })).toBe(before);
    const first = await Match.findOne({ series: series._id }).sort({ startsAt: 1 });
    expect((await api().post(`/api/matches/${first._id}/status`).set(ctx.admin.auth).send({ status: 'annullata' })).status).toBe(200);
    await seriesService.materialize(series, group);
    expect(await Match.countDocuments({ series: series._id })).toBe(before);
    expect((await Match.findById(first._id)).status).toBe('annullata');
  });

  test("avanzando nel tempo l'orizzonte si riempie, con l'ora legale giusta", async () => {
    const group = await Group.findById(ctx.group.id);
    const series = await MatchSeries.findOne({ group: ctx.group.id });
    await MatchSeries.updateOne({ _id: series._id }, { $set: { startsOn: '2027-03-01' } });
    const fresh = await MatchSeries.findById(series._id);
    const created = await seriesService.materialize(fresh, group, { now: new Date('2027-03-10T10:00:00Z'), horizonDays: 35 });
    const keys = created.map((m) => m.occurrenceKey);
    expect(keys).toEqual(['2027-03-11', '2027-03-18', '2027-03-25', '2027-04-01', '2027-04-08']);
    // 2027: l'ora legale inizia il 28 marzo, quindi le 21:00 passano da 20:00Z a 19:00Z.
    expect(created.map((m) => m.startsAt.toISOString().slice(11, 16))).toEqual(['20:00', '20:00', '20:00', '19:00', '19:00']);
  });

  test('modifica singola: la serie non la tocca più; la modifica della serie arriva alle altre', async () => {
    const series = await MatchSeries.findOne({ group: ctx.group.id });
    const open = await Match.find({ series: series._id, status: 'aperta', startsAt: { $gt: new Date() } }).sort({ startsAt: 1 });
    const [one, two, three] = open;
    const edited = await api().patch(`/api/matches/${one._id}`).set(ctx.admin.auth).send({ slots: 8 });
    expect(edited.status).toBe(200);
    expect((await Match.findById(one._id)).detached).toBe(true);
    await respond(ctx.members[0], { id: String(two._id) }); // ha già un iscritto: non va spiazzato
    const res = await api().patch(`/api/series/${series._id}`).set(ctx.admin.auth).send({ time: '20:30', slots: 12, costCents: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.series.time).toBe('20:30');
    expect((await Match.findById(one._id)).slots).toBe(8);
    expect((await Match.findById(two._id)).slots).toBe(10);
    const t = await Match.findById(three._id);
    expect(t.slots).toBe(12);
    expect(t.freeSlots).toBe(12);
    expect(zone.zonedToUtc(t.occurrenceKey, '20:30').toISOString()).toBe(t.startsAt.toISOString());
  });

  test('permessi: solo chi l\'ha creata o un admin; con organizzatori solo admin creare è vietato ai membri', async () => {
    const series = await MatchSeries.findOne({ group: ctx.group.id });
    expect((await api().patch(`/api/series/${series._id}`).set(ctx.members[0].auth).send({ slots: 6 })).status).toBe(403);
    expect((await api().delete(`/api/series/${series._id}`).set(ctx.members[0].auth)).status).toBe(403);
    const outsider = (await groupWithMembers(2)).admin;
    expect((await api().get(`/api/groups/${ctx.group.id}/series`).set(outsider.auth)).status).toBe(403);
    expect((await api().patch(`/api/series/${series._id}`).set(outsider.auth).send({ slots: 6 })).status).toBe(403);
    await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { organizers: 'admin' } });
    expect((await create(ctx.members[1])).status).toBe(403);
    await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { organizers: 'tutti' } });
    const own = await create(ctx.members[1], { weekday: 2, time: '19:00' });
    expect(own.status).toBe(201);
    expect((await api().patch(`/api/series/${own.body.series.id}`).set(ctx.members[1].auth).send({ slots: 6 })).status).toBe(200);
  });

  test('validazione dei dati', async () => {
    for (const bad of [{ weekday: 8 }, { time: '25:00' }, { startsOn: '2026-02-30' }, { field: 'luna' }, { endsOn: '2020-01-01' }, { slots: 1 }]) {
      expect((await create(ctx.admin, bad)).status).toBe(422);
    }
  });

  test('fine della serie: si ferma e, se richiesto, annulla le occorrenze future', async () => {
    const mk = await create(ctx.admin, { weekday: 6, time: '10:00' });
    const id = mk.body.series.id;
    const stop = await api().delete(`/api/series/${id}?cancelFuture=true`).set(ctx.admin.auth);
    expect(stop.status).toBe(200);
    expect(stop.body.cancelled).toBe(mk.body.created);
    expect(await Match.countDocuments({ series: id, status: 'annullata' })).toBe(mk.body.created);
    const group = await Group.findById(ctx.group.id);
    expect(await seriesService.materialize(await MatchSeries.findById(id), group)).toEqual([]);
    const list = await api().get(`/api/groups/${ctx.group.id}/series`).set(ctx.members[0].auth);
    expect(list.body.series.find((s) => s.id === id)).toMatchObject({ active: false, upcoming: 0 });
  });

  test('fuso configurabile del gruppo', async () => {
    const other = await groupWithMembers(2);
    expect((await api().patch(`/api/groups/${other.group.id}`).set(other.admin.auth).send({ settings: { timezone: 'Marte/Olympus' } })).status).toBe(422);
    const ok = await api().patch(`/api/groups/${other.group.id}`).set(other.admin.auth).send({ settings: { timezone: 'Europe/London' } });
    expect(ok.body.group.settings.timezone).toBe('Europe/London');
    const res = await api().post(`/api/groups/${other.group.id}/series`).set(other.admin.auth).send(body({ weekday: 3, time: '20:00' }));
    const m = await Match.findOne({ series: res.body.series.id });
    expect(m.startsAt.toISOString()).toBe(zone.zonedToUtc(m.occurrenceKey, '20:00', 'Europe/London').toISOString());
  });
});

describe('Calendario, disponibilità ed esportazione', () => {
  let a;
  let b;
  let day;
  beforeAll(async () => {
    a = await groupWithMembers(3);
    b = await groupWithMembers(2);
    await joinGroup(a.admin, b.group); // l'admin di A entra anche in B
    await createMatch(a.admin, a.group, { startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    await createMatch(b.admin, b.group, { startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    await api().post(`/api/groups/${a.group.id}/polls`).set(a.admin.auth).send({ mode: 'fissa', field: 'cambiano', startsAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), playersNeeded: 4, deadline: new Date(Date.now() + 4 * 86_400_000).toISOString() });
    day = zone.ymdIn(new Date(Date.now() + 2 * 86_400_000));
  });
  const range = (who, q = '') => {
    const from = zone.ymdIn(new Date());
    const to = zone.addDays(from, 14);
    return api().get(`/api/calendar?from=${from}&to=${to}${q}`).set(who.auth);
  };

  test('unisce partite e convocazioni dei gruppi dell\'utente, con filtro per gruppo', async () => {
    const all = await range(a.admin);
    expect(all.status).toBe(200);
    expect(all.body.items.map((i) => i.type).sort()).toEqual(['convocazione', 'partita', 'partita']);
    expect(all.body.groups).toHaveLength(2);
    const onlyA = await range(a.admin, `&group=${a.group.id}`);
    expect(onlyA.body.items).toHaveLength(2);
    expect(onlyA.body.items.every((i) => i.groupId === a.group.id)).toBe(true);
    expect((await range(a.members[0])).body.items).toHaveLength(2); // vede solo il suo gruppo
    expect((await range(a.members[0], `&group=${b.group.id}`)).status).toBe(403);
    const sorted = all.body.items.map((i) => i.startsAt);
    expect([...sorted].sort()).toEqual(sorted);
  });

  test('intervalli non validi o troppo lunghi: 422; senza accesso: 401', async () => {
    expect((await api().get('/api/calendar?from=2026-13-01&to=2026-12-01').set(a.admin.auth)).status).toBe(422);
    expect((await api().get('/api/calendar?from=2026-12-10&to=2026-12-01').set(a.admin.auth)).status).toBe(422);
    expect((await api().get('/api/calendar?from=2026-01-01&to=2027-01-01').set(a.admin.auth)).status).toBe(422);
    expect((await api().get('/api/calendar?from=2026-01-01&to=2026-01-10')).status).toBe(401);
  });

  test('disponibilità: una per giorno, modificabile, cancellabile, non nel passato, visibile al gruppo', async () => {
    const url = (d) => `/api/groups/${a.group.id}/availability/${d}`;
    expect((await api().put(url(day)).set(a.members[0].auth).send({ status: 'disponibile' })).status).toBe(200);
    expect((await api().put(url(day)).set(a.members[1].auth).send({ status: 'forse' })).status).toBe(200);
    await api().put(url(day)).set(a.members[1].auth).send({ status: 'disponibile' });
    const q = `/api/groups/${a.group.id}/availability?from=${day}&to=${day}`;
    const mine = (await api().get(q).set(a.members[0].auth)).body.days[day];
    expect(mine).toMatchObject({ disponibile: 2, forse: 0, mine: 'disponibile' });
    expect(mine.available.map((u) => u.name).sort()).toEqual(['Membro1', 'Membro2']);
    expect(JSON.stringify(mine)).not.toMatch(/@calcetto\.test/);
    await api().delete(url(day)).set(a.members[1].auth);
    expect((await api().get(q).set(a.members[0].auth)).body.days[day].disponibile).toBe(1);
    expect((await api().put(url('2020-01-01')).set(a.members[0].auth).send({ status: 'disponibile' })).status).toBe(422);
    expect((await api().put(url(day)).set(a.members[0].auth).send({ status: 'boh' })).status).toBe(422);
    const outsider = (await groupWithMembers(2)).admin;
    expect((await api().get(q).set(outsider.auth)).status).toBe(403);
    expect((await api().put(url(day)).set(outsider.auth).send({ status: 'disponibile' })).status).toBe(403);
  });

  test('.ics: formato valido, UTC, righe piegate a 75 byte, testo con caratteri speciali, solo i miei gruppi', async () => {
    await createMatch(a.admin, a.group, { startsAt: new Date(Date.now() + 8 * 86_400_000).toISOString(), notes: 'Porta le pettorine; ci sono "regole", molte: ' + 'x'.repeat(120) + '\nSeconda riga' });
    const res = await api().get('/api/calendar/export.ics').set(a.members[0].auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const text = res.text;
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect((text.match(/BEGIN:VEVENT/g) || []).length).toBe(2);
    expect(text).toMatch(/DTSTART:\d{8}T\d{6}Z\r\n/);
    expect(text).toMatch(/UID:match-[a-f0-9]{24}@bonmatch/);
    expect(text).toContain('\;');
    expect(text).toContain('\\n');
    for (const line of text.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect((await api().get(`/api/calendar/export.ics?group=${b.group.id}`).set(a.members[0].auth)).status).toBe(403);
    expect((await api().get('/api/calendar/export.ics')).status).toBe(401);
  });

  test('esportazione senza partite: calendario vuoto ma valido', async () => {
    const empty = await groupWithMembers(2);
    const res = await api().get('/api/calendar/export.ics').set(empty.admin.auth);
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).not.toContain('BEGIN:VEVENT');
  });

  test('piegatura RFC 5545: nessuna riga oltre 75 byte, anche con caratteri multibyte', () => {
    const folded = calendarService.fold(`SUMMARY:${'è'.repeat(80)}`);
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'è'.repeat(80)}`);
    void createUser;
    void createGroup;
  });
});
