'use strict';

/*
 * Achievement assegnati solo dal backend, dai dati reali. L'indice unico
 * (utente, gruppo, chiave) rende l'assegnazione idempotente: ricalcolare
 * mille volte o con richieste simultanee non crea mai due traguardi uguali
 * né due notifiche.
 */
const { Achievement, Group } = require('../models');
const statsEngine = require('./statsEngine');
const notificationService = require('./notificationService');
const activityService = require('./activityService');
const { forbidden } = require('../utils/AppError');

const DAY = 86_400_000;
const LIVE_WINDOW_DAYS = 3; // oltre questo limite un traguardo "arretrato" si registra senza notifiche

/** Riga in cui il totale cumulato raggiunge `target`, o null. */
function nth(rows, target, count) {
  let n = 0;
  for (const r of rows) {
    n += count(r);
    if (n >= target) return r;
  }
  return null;
}

function streakRow(rows, target) {
  let cur = 0;
  for (const r of rows) {
    cur = r.result === 'V' ? cur + 1 : 0;
    if (cur >= target) return r;
  }
  return null;
}

const bestStreak = (rows) => {
  let cur = 0;
  let best = 0;
  for (const r of rows) {
    cur = r.result === 'V' ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
};

const played = (rows) => rows.length;
const goals = (rows) => rows.reduce((a, r) => a + r.goals, 0);
const mvps = (rows) => rows.filter((r) => r.mvp).length;

const DEFINITIONS = [
  { key: 'prima_partita', label: 'Prima partita', icon: 'whistle', description: 'Giocare la prima partita nel gruppo.', target: 1, current: played, reached: (rows) => rows[0] || null },
  { key: 'presenze_10', label: '10 presenze', icon: 'calendar', description: 'Giocare 10 partite nel gruppo.', target: 10, current: played, reached: (rows) => rows[9] || null },
  { key: 'presenze_25', label: '25 presenze', icon: 'calendar', description: 'Giocare 25 partite nel gruppo.', target: 25, current: played, reached: (rows) => rows[24] || null },
  { key: 'presenze_50', label: '50 presenze', icon: 'calendar', description: 'Giocare 50 partite nel gruppo.', target: 50, current: played, reached: (rows) => rows[49] || null },
  { key: 'primo_gol', label: 'Primo gol', icon: 'ball', description: 'Segnare il primo gol (conta solo dove sono inseriti i marcatori).', target: 1, current: goals, reached: (rows) => nth(rows, 1, (r) => r.goals) },
  { key: 'gol_10', label: '10 gol', icon: 'target', description: 'Segnare 10 gol nel gruppo.', target: 10, current: goals, reached: (rows) => nth(rows, 10, (r) => r.goals) },
  { key: 'gol_25', label: '25 gol', icon: 'target', description: 'Segnare 25 gol nel gruppo.', target: 25, current: goals, reached: (rows) => nth(rows, 25, (r) => r.goals) },
  { key: 'primo_mvp', label: 'Primo MVP', icon: 'star', description: 'Essere eletto MVP per la prima volta.', target: 1, current: mvps, reached: (rows) => nth(rows, 1, (r) => (r.mvp ? 1 : 0)) },
  { key: 'mvp_5', label: '5 MVP', icon: 'crown', description: 'Essere eletto MVP 5 volte.', target: 5, current: mvps, reached: (rows) => nth(rows, 5, (r) => (r.mvp ? 1 : 0)) },
  { key: 'serie_3', label: 'Tris di vittorie', icon: 'flame', description: 'Vincere 3 partite di fila.', target: 3, current: bestStreak, reached: (rows) => streakRow(rows, 3) },
  { key: 'serie_5', label: 'Serie da 5', icon: 'flame', description: 'Vincere 5 partite di fila.', target: 5, current: bestStreak, reached: (rows) => streakRow(rows, 5) },
];

/** Fedeltà: almeno 180 giorni nel gruppo e 10 presenze. Dipende dalla data di ingresso, quindi a parte. */
const LOYALTY = { key: 'fedelta', label: 'Fedeltà al gruppo', icon: 'shield', description: 'Almeno 6 mesi nel gruppo con 10 presenze.', target: 10 };

function loyaltyAt(rows, joinedAt, now) {
  if (rows.length < 10 || !joinedAt) return null;
  const at = Math.max(new Date(rows[9].startsAt).getTime(), new Date(joinedAt).getTime() + 180 * DAY);
  return at <= now.getTime() ? { at: new Date(at), match: rows[9].match } : null;
}

const ALL = [...DEFINITIONS, LOYALTY];
const metaOf = (key) => ALL.find((d) => d.key === key);

/** Calcola i traguardi raggiunti da ogni membro dai dati reali (senza scrivere nulla). */
function compute(group, rows, now = new Date()) {
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user)) byUser.set(r.user, []);
    byUser.get(r.user).push(r);
  }
  const out = [];
  for (const m of group.members) {
    const uid = String(m.user);
    const mine = byUser.get(uid) || [];
    for (const def of DEFINITIONS) {
      const row = def.reached(mine);
      if (row) out.push({ user: uid, key: def.key, match: row.match, unlockedAt: new Date(row.startsAt) });
    }
    const loyal = loyaltyAt(mine, m.joinedAt, now);
    if (loyal) out.push({ user: uid, key: LOYALTY.key, match: loyal.match, unlockedAt: loyal.at });
  }
  return out;
}

/**
 * Registra i traguardi mancanti di un gruppo. `notify` avvisa solo per quelli
 * davvero recenti, così un gruppo con storico non riceve cento notifiche.
 * @returns {Promise<number>} traguardi nuovi
 */
async function evaluateGroup(groupId, { notify = true, now = new Date() } = {}) {
  const group = await Group.findById(groupId).lean();
  if (!group) return 0;
  const { matches, ratings } = await statsEngine.loadPlayed(groupId);
  const reached = compute(group, statsEngine.playerRows(matches, ratings), now);
  const existing = new Set((await Achievement.find({ group: groupId }).select('user key').lean()).map((a) => `${a.user}:${a.key}`));
  let created = 0;
  for (const a of reached) {
    if (existing.has(`${a.user}:${a.key}`)) continue;
    let doc;
    try {
      doc = await Achievement.create({ user: a.user, group: groupId, key: a.key, match: a.match, unlockedAt: a.unlockedAt });
    } catch (err) {
      if (err.code === 11000) continue; // un altro processo l'ha già assegnato
      throw err;
    }
    created += 1;
    if (notify && now.getTime() - a.unlockedAt.getTime() <= LIVE_WINDOW_DAYS * DAY) {
      const meta = metaOf(a.key);
      const dedupe = `achievement:${groupId}:${a.user}:${a.key}`;
      await notificationService.notify([a.user], {
        type: 'achievement',
        title: `Traguardo sbloccato: ${meta.label}`,
        body: meta.description,
        link: `/gruppi/${groupId}/giocatori/${a.user}`,
        group: groupId,
        dedupeKey: dedupe,
      });
      await activityService.record(groupId, 'achievement', { target: a.user, data: { key: a.key, label: meta.label }, key: dedupe });
    }
    void doc;
  }
  return created;
}

/** Non deve mai far fallire l'azione che lo ha causato (risultato, chiusura voto). */
async function evaluateSafely(groupId) {
  try {
    return await evaluateGroup(groupId);
  } catch (err) {
    console.error('Calcolo degli achievement non riuscito:', err.message);
    return 0;
  }
}

/** Elenco completo dei traguardi di un giocatore, con avanzamento. */
async function listFor(group, userId) {
  const member = group.members.find((m) => String(m.user) === String(userId));
  if (!member) throw forbidden('Questo giocatore non fa parte del gruppo.');
  const uid = String(userId);
  const { matches, ratings } = await statsEngine.loadPlayed(group._id);
  const rows = statsEngine.playerRows(matches, ratings).filter((r) => r.user === uid);
  const unlocked = new Map((await Achievement.find({ group: group._id, user: uid }).lean()).map((a) => [a.key, a]));
  const daysIn = Math.floor((Date.now() - new Date(member.joinedAt).getTime()) / DAY);
  const items = ALL.map((def) => {
    const got = unlocked.get(def.key);
    const current = def.key === 'fedelta' ? Math.min(rows.length, def.target) : def.current(rows);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      icon: def.icon,
      unlocked: Boolean(got),
      unlockedAt: got ? got.unlockedAt : null,
      matchId: got?.match ? String(got.match) : null,
      progress: { current: Math.min(current, def.target), target: def.target },
      ...(def.key === 'fedelta' ? { daysInGroup: daysIn, daysTarget: 180 } : {}),
    };
  });
  return { achievements: items, unlockedCount: items.filter((i) => i.unlocked).length, total: items.length };
}

module.exports = { DEFINITIONS: ALL, compute, evaluateGroup, evaluateSafely, listFor };
