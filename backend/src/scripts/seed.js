'use strict';

/*
 * Dati di esempio NON distruttivi: crea utenti, gruppi, partite, voti e chat
 * solo se mancano. Non cancella mai nulla. Rifiuta di partire in produzione.
 *
 *   npm run seed
 */

// Controllo prima di tutto il resto: il seed non deve mai toccare la produzione.
if (process.env.NODE_ENV === 'production') {
  console.error('Il seed è solo per sviluppo: con NODE_ENV=production non parte.');
  process.exit(1);
}

const config = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../db');
const { User, Group, Nickname, Match, Message, Notification, MvpVote, Rating, PrizeVote } = require('../models');
const { hashPassword } = require('../services/authService');
const { balance } = require('../services/teamService');
const { appConfig, DEFAULTS } = require('../config/appConfig');
const { generateInviteCode } = require('../utils/helpers');

const PASSWORD = 'calcetto2026';
const DAY = 86_400_000;
const HOUR = 3_600_000;

const USERS = [
  { key: 'marco', name: 'Marco Rossi', role: 'centrocampista', foot: 'destro', nickname: 'Il Sindaco' },
  { key: 'luca', name: 'Luca Bianchi', role: 'attaccante', foot: 'destro', nickname: 'Cesarini' },
  { key: 'andrea', name: 'Andrea Ferrero', role: 'portiere', foot: 'destro', nickname: 'La Saracinesca' },
  { key: 'davide', name: 'Davide Gallo', role: 'difensore', foot: 'sinistro', nickname: 'Il Muro' },
  { key: 'simone', name: 'Simone Rinaldi', role: 'attaccante', foot: 'sinistro', nickname: 'Turbo' },
  { key: 'matteo', name: 'Matteo Bruno', role: 'centrocampista', foot: 'ambidestro', nickname: 'Piedi Buoni' },
  { key: 'stefano', name: 'Stefano Costa', role: 'difensore', foot: 'destro', nickname: 'Il Professore' },
  { key: 'paolo', name: 'Paolo Ghigo', role: 'portiere', foot: 'destro', nickname: 'Gattone' },
  { key: 'federico', name: 'Federico Marino', role: 'attaccante', foot: 'destro', nickname: 'Bomber' },
  { key: 'alessandro', name: 'Alessandro Greco', role: 'centrocampista', foot: 'sinistro', nickname: null },
];

// Forza "di base" usata solo per generare risultati e voti credibili.
const SKILL = { marco: 7, luca: 8, andrea: 7.5, davide: 6.5, simone: 7.5, matteo: 8, stefano: 6, paolo: 6.5, federico: 7, alessandro: 5.5 };

function rng(seed) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(2026);
const pick = (list) => list[Math.floor(random() * list.length)];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Data alle `hour`:`minute` ora italiana (fuso della configurazione) a `days` giorni da oggi. */
function at(days, hour = 21, minute = 0) {
  const base = new Date(Date.now() + days * DAY);
  const tz = appConfig.timeZone;
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  // L'Italia è a +01:00 (ora solare) o +02:00 (ora legale): provo entrambe.
  for (const offset of ['+01:00', '+02:00']) {
    const d = new Date(`${ymd}T${hh}:${mm}:00${offset}`);
    const shown = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    if (shown === `${hh}:${mm}`) return d;
  }
  return new Date(`${ymd}T${hh}:${mm}:00+01:00`);
}

async function ensureUsers() {
  const passwordHash = await hashPassword(PASSWORD);
  const byKey = {};
  let created = 0;
  for (const u of USERS) {
    const email = `${u.key}@calcetto.test`;
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name: u.name, email, passwordHash, preferredRole: u.role, foot: u.foot });
      created += 1;
    }
    byKey[u.key] = user;
  }
  return { byKey, created };
}

const member = (user, role = 'member', joinedDaysAgo = 90) => ({
  user: user._id,
  role,
  joinedAt: new Date(Date.now() - joinedDaysAgo * DAY),
  lastReadAt: new Date(Date.now() - 2 * DAY),
});

async function ensureGroup(name, data) {
  const existing = await Group.findOne({ name, createdBy: data.createdBy });
  if (existing) return { group: existing, created: false };
  let inviteCode = generateInviteCode();
  while (await Group.exists({ inviteCode })) inviteCode = generateInviteCode();
  const group = await Group.create({ name, inviteCode, ...data });
  return { group, created: true };
}

/** Partita giocata completa: squadre, risultato, marcatori, voti, MVP e premio. */
async function playedMatch(group, organizer, players, { daysAgo, field, votingOpen = false, archived = true }) {
  const startsAt = at(-daysAgo);
  const ids = players.map((p) => p.user._id);
  const { a, b } = balance(
    players.map((p) => ({ id: String(p.user._id), rating: SKILL[p.key], role: p.user.preferredRole })),
    { random, tolerance: 1.2 }
  );
  const strength = (team) => team.reduce((s, id) => s + SKILL[players.find((p) => String(p.user._id) === id).key], 0);
  const goals = (own, other) => clamp(Math.round(3 + random() * 5 + (own - other) * 0.6), 0, 12);
  const scoreA = goals(strength(a), strength(b));
  const scoreB = goals(strength(b), strength(a));

  const scorers = [];
  const assignGoals = (team, total) => {
    const tally = new Map();
    for (let g = 0; g < total; g++) {
      const weights = team.map((id) => {
        const p = players.find((x) => String(x.user._id) === id);
        return { id, w: (p.user.preferredRole === 'attaccante' ? 3 : p.user.preferredRole === 'portiere' ? 0.1 : 1.2) * SKILL[p.key] };
      });
      let r = random() * weights.reduce((s, x) => s + x.w, 0);
      const chosen = weights.find((x) => (r -= x.w) <= 0) || weights[0];
      tally.set(chosen.id, (tally.get(chosen.id) || 0) + 1);
    }
    for (const [user, n] of tally) scorers.push({ user, goals: n });
  };
  assignGoals(a, scoreA);
  assignGoals(b, scoreB);

  const resultAt = new Date(startsAt.getTime() + 2 * HOUR);
  const closesAt = votingOpen ? new Date(Date.now() + 30 * HOUR) : new Date(resultAt.getTime() + 48 * HOUR);
  const prizeOptions = [...appConfig.prizeOptions, ...group.settings.extraPrizeOptions.map((o) => ({ key: o.key, label: o.label, emoji: o.emoji }))];

  const match = await Match.create({
    group: group._id,
    organizer: organizer._id,
    field,
    startsAt,
    durationMinutes: 60,
    costCents: 6000,
    slots: 10,
    freeSlots: Math.max(0, 10 - players.length),
    status: archived && !votingOpen ? 'archiviata' : 'giocata',
    participants: players.map((p) => ({ user: p.user._id, response: 'ci_sono', respondedAt: new Date(startsAt.getTime() - 3 * DAY), paid: random() > 0.15 })),
    teams: { a: { name: DEFAULTS.teamNames[0], players: a }, b: { name: DEFAULTS.teamNames[1], players: b }, method: 'bilancia', updatedAt: startsAt },
    result: { scoreA, scoreB, scorers, recordedBy: organizer._id, recordedAt: resultAt },
    voting: { opensAt: resultAt, closesAt, closed: false, mvp: [] },
    prizePoll: { options: prizeOptions, closed: false, winners: [] },
  });

  // Voti 1-10: ognuno vota 4 compagni, intorno alla forza reale.
  const ratingDocs = [];
  for (const rater of players) {
    const others = players.filter((p) => p !== rater).sort(() => random() - 0.5).slice(0, 4);
    for (const ratee of others) {
      ratingDocs.push({ match: match._id, group: group._id, rater: rater.user._id, ratee: ratee.user._id, score: clamp(Math.round(SKILL[ratee.key] + (random() - 0.5) * 2.5), 1, 10) });
    }
  }
  await Rating.insertMany(ratingDocs);

  // MVP: si vota soprattutto tra i più in forma della serata.
  const form = players.map((p) => {
    const g = scorers.filter((s) => s.user === String(p.user._id)).reduce((s, x) => s + x.goals, 0);
    return { p, score: SKILL[p.key] + g * 1.5 + random() * 2 };
  });
  form.sort((x, y) => y.score - x.score);
  const voters = votingOpen ? players.filter((p) => p.key !== 'marco').slice(0, 5) : players;
  const mvpDocs = voters.map((v) => {
    const candidates = form.filter((f) => f.p !== v).slice(0, 3);
    return { match: match._id, voter: v.user._id, mvp: pick(candidates).p.user._id };
  });
  await MvpVote.insertMany(mvpDocs);
  const prizeDocs = voters.map((v) => ({ match: match._id, voter: v.user._id, option: pick(['birra', 'birra', 'pizza', 'pizza', 'panino', ...prizeOptions.slice(3).map((o) => o.key)]) }));
  await PrizeVote.insertMany(prizeDocs);

  if (!votingOpen) {
    const winnersOf = (docs, keyOf) => {
      const tally = new Map();
      for (const d of docs) tally.set(keyOf(d), (tally.get(keyOf(d)) || 0) + 1);
      const max = Math.max(...tally.values());
      return [...tally].filter(([, v]) => v === max).map(([k]) => k);
    };
    match.voting.closed = true;
    match.voting.closedAt = closesAt;
    match.voting.mvp = winnersOf(mvpDocs, (d) => String(d.mvp));
    match.prizePoll.closed = true;
    match.prizePoll.closedAt = closesAt;
    match.prizePoll.winners = winnersOf(prizeDocs, (d) => d.option);
    await match.save();
  }
  return match;
}

async function upcomingMatch(group, organizer, { days, field, confirmed, waiting = [], maybe = [], no = [], slots = 10, notes = '' }) {
  const startsAt = at(days);
  const t0 = Date.now() - 2 * DAY;
  return Match.create({
    group: group._id,
    organizer: organizer._id,
    field,
    startsAt,
    durationMinutes: 60,
    costCents: 7000,
    slots,
    freeSlots: slots - confirmed.length,
    notes,
    status: 'aperta',
    participants: [
      ...confirmed.map((u, i) => ({ user: u._id, response: 'ci_sono', respondedAt: new Date(t0 + i * 600_000), paid: i % 3 === 0 })),
      ...waiting.map((u, i) => ({ user: u._id, response: 'attesa', respondedAt: new Date(t0 + DAY + i * 600_000), waitlistedAt: new Date(t0 + DAY + i * 600_000) })),
      ...maybe.map((u) => ({ user: u._id, response: 'forse', respondedAt: new Date(t0 + DAY) })),
      ...no.map((u) => ({ user: u._id, response: 'non_ci_sono', respondedAt: new Date(t0 + DAY) })),
    ],
  });
}

async function seedGroupContent(u) {
  const all = USERS.map((x) => ({ key: x.key, user: u[x.key] }));
  const thursday = await ensureGroup('Calcetto del giovedì', {
    description: 'Ogni giovedì alle 21. Chi arriva tardi porta le pettorine.',
    emoji: '⚽',
    color: '#2EE59D',
    createdBy: u.marco._id,
    members: all.map((x, i) => member(x.user, x.key === 'marco' || x.key === 'luca' ? 'admin' : 'member', 90 - i)),
    settings: { organizers: 'tutti', minMatchesForRanking: 3, loserPaysFirstRound: true, extraPrizeOptions: [{ key: 'extra-gelato', label: 'Gelato', emoji: '🍦' }] },
  });
  const monday = await ensureGroup('Amici del lunedì', {
    description: 'Calcetto tra colleghi per smaltire il weekend.',
    emoji: '🔥',
    color: '#FF8A3D',
    createdBy: u.luca._id,
    members: ['luca', 'marco', 'simone', 'matteo', 'federico', 'alessandro'].map((k) => member(u[k], k === 'luca' ? 'admin' : 'member', 60)),
    settings: { organizers: 'tutti', minMatchesForRanking: 1, loserPaysFirstRound: false, extraPrizeOptions: [] },
  });

  const summary = { groups: 0, matches: 0, messages: 0 };
  if (thursday.created) {
    summary.groups += 1;
    const g = thursday.group;
    const fields = ['cambiano', 'santena', 'moncalieri', 'villastellone'];
    // 9 giovedì passati, l'ultimo con le votazioni ancora aperte.
    for (let w = 9; w >= 1; w--) {
      const absent = w % 3 === 0 ? ['alessandro'] : w % 4 === 0 ? ['stefano'] : [];
      const players = all.filter((p) => !absent.includes(p.key));
      await playedMatch(g, w % 2 ? u.marco : u.luca, players, { daysAgo: w * 7 - 3, field: fields[w % 4], votingOpen: w === 1, archived: w > 2 });
      summary.matches += 1;
    }
    // Prossime: una al completo con lista d'attesa, una ancora da riempire.
    const eight = ['marco', 'luca', 'andrea', 'davide', 'simone', 'matteo', 'stefano', 'federico'].map((k) => u[k]);
    await upcomingMatch(g, u.marco, {
      days: 2,
      field: 'santena',
      slots: 8,
      confirmed: eight,
      waiting: [u.paolo, u.alessandro],
      notes: 'Maglia chiara e maglia scura, ritrovo alle 20:45.',
    });
    await upcomingMatch(g, u.luca, { days: 6, field: 'moncalieri', confirmed: [u.luca, u.andrea, u.simone, u.matteo, u.federico], maybe: [u.davide], no: [u.stefano] });
    summary.matches += 2;

    const nick = async (target, text, proposer, extra = {}) => Nickname.create({ group: g._id, target: u[target]._id, proposer: u[proposer]._id, text, ...extra });
    await nick('luca', 'Il Lento', 'simone', { status: 'rifiutato', decidedBy: u.luca._id, decidedAt: new Date(Date.now() - 40 * DAY) });
    await nick('andrea', 'Mani di Burro', 'davide', { status: 'sostituito', decidedBy: u.andrea._id, decidedAt: new Date(Date.now() - 30 * DAY) });
    const proposers = { marco: 'luca', luca: 'marco', andrea: 'andrea', davide: 'stefano', simone: 'matteo', matteo: 'federico', stefano: 'davide', paolo: 'andrea', federico: 'luca' };
    for (const x of USERS.filter((y) => y.nickname)) await nick(x.key, x.nickname, proposers[x.key]);

    const chat = [
      [null, 'Finale a Cambiano: Maglie chiare 6 - 5 Maglie scure. Votazioni aperte per MVP e terzo tempo!', 70],
      ['luca', 'Gol al 59° minuto. Chiamatemi pure Cesarini 😎', 69],
      ['davide', 'Fortuna sfacciata, il palo l\'avevo preso io prima', 68],
      ['matteo', 'Giovedì prossimo si gioca a Santena, prenotato per le 21', 50],
      ['andrea', 'Ci sono! Porto io il pallone nuovo', 49],
      [null, 'Marco Rossi ha creato una partita a Santena. Iscrizioni aperte!', 48],
      ['simone', 'Io arrivo dieci minuti dopo, tenetemi il posto', 30],
      ['stefano', 'Ragazzi ricordatevi le pettorine, l\'ultima volta eravamo tutti in nero', 26],
      ['federico', 'Chi offre la birra stavolta? 🍺', 20],
      ['marco', 'Chi perde, come sempre. Regola della casa', 19],
      ['alessandro', 'Allora preparo il portafoglio 😂', 18],
      [null, 'Paolo Ghigo ci sarà alla partita di giovedì.', 6],
      ['paolo', 'Stavolta paro tutto, promesso', 5],
      ['luca', 'Lo dici ogni settimana 😂', 4],
    ];
    for (const [author, text, hoursAgo] of chat) {
      const createdAt = new Date(Date.now() - hoursAgo * HOUR);
      await Message.create({
        group: g._id,
        author: author ? u[author]._id : null,
        kind: author ? 'utente' : 'sistema',
        text,
        createdAt,
        updatedAt: createdAt,
        reactions: author === 'luca' && hoursAgo === 69 ? [{ emoji: '😂', users: [u.davide._id, u.marco._id] }, { emoji: '🔥', users: [u.simone._id] }] : author === 'marco' ? [{ emoji: '👍', users: [u.federico._id, u.stefano._id, u.paolo._id] }] : [],
      });
      summary.messages += 1;
    }

    await Notification.insertMany([
      { user: u.marco._id, group: g._id, type: 'votazione_aperta', title: "Vota l'MVP della serata", body: 'Si vota anche il terzo tempo!', link: `/gruppi/${g._id}/partite`, createdAt: new Date(Date.now() - 20 * HOUR) },
      { user: u.marco._id, group: g._id, type: 'soprannome', title: 'Hai un nuovo soprannome: «Il Sindaco»', body: "Te l'ha dato Luca Bianchi. Puoi tenerlo, sostituirlo o rifiutarlo.", link: `/gruppi/${g._id}/membri`, createdAt: new Date(Date.now() - 60 * HOUR) },
    ]);
  }

  if (monday.created) {
    summary.groups += 1;
    const g = monday.group;
    const players = ['luca', 'marco', 'simone', 'matteo', 'federico', 'alessandro'].map((k) => ({ key: k, user: u[k] }));
    await playedMatch(g, u.luca, players, { daysAgo: 15, field: 'villastellone' });
    await playedMatch(g, u.luca, players, { daysAgo: 8, field: 'cambiano' });
    // Partita al completo con due persone in lista d'attesa.
    await upcomingMatch(g, u.luca, {
      days: 4,
      field: 'villastellone',
      slots: 4,
      confirmed: [u.luca, u.simone, u.matteo, u.federico],
      waiting: [u.alessandro, u.marco],
      notes: 'Campo piccolo: si gioca 2 contro 2, cambi volanti.',
    });
    summary.matches += 3;
    await Message.create({ group: g._id, author: u.luca._id, text: 'Lunedì campo piccolo a Villastellone, siamo già al completo!' });
    summary.messages += 1;
  }
  return summary;
}

async function main() {
  await connectDatabase(config.mongoUri);
  const { byKey, created } = await ensureUsers();
  const summary = await seedGroupContent(byKey);
  console.log(`Seed completato su ${config.mongoUri}`);
  console.log(`  utenti creati: ${created} (già presenti: ${USERS.length - created})`);
  console.log(`  gruppi creati: ${summary.groups}, partite: ${summary.matches}, messaggi: ${summary.messages}`);
  console.log(`  password di tutti gli account: ${PASSWORD}`);
  console.log('  account admin: marco@calcetto.test');
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(`Seed non riuscito: ${err.message}`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
