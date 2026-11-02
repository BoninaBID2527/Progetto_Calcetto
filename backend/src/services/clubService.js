'use strict';

/*
 * Identità e statistiche del club (il gruppo). Le immagini si salvano come
 * data URL solo dopo aver verificato il tipo reale dai primi byte; il
 * gruppo resta privato: tutto si legge solo da chi ne fa parte.
 */
const { Group } = require('../models');
const { unprocessable } = require('../utils/AppError');
const { sniffImage, toDataUrl } = require('../utils/image');
const statsEngine = require('./statsEngine');
const seasonService = require('./seasonService');
const nicknameService = require('./nicknameService');
const groupService = require('./groupService');
const realtime = require('./realtime');
const { userResolver } = require('./dto');

const LIMITS = { crest: 128 * 1024, cover: 700 * 1024 };
const FIELD = { crest: 'crestUrl', cover: 'coverUrl' };

async function setImage(group, user, kind, file) {
  const mime = sniffImage(file.buffer);
  if (!mime) throw unprocessable('Formato non supportato: usa un\'immagine PNG, JPEG o WebP.', { file: 'Formato non valido.' });
  if (file.buffer.length > LIMITS[kind]) throw unprocessable(`Il file supera il limite di ${LIMITS[kind] / 1024} KB.`, { file: 'File troppo pesante.' });
  await Group.updateOne({ _id: group._id }, { $set: { [FIELD[kind]]: toDataUrl(file.buffer, mime) } });
  return refreshed(group, user, kind);
}

async function removeImage(group, user, kind) {
  await Group.updateOne({ _id: group._id }, { $set: { [FIELD[kind]]: null } });
  return refreshed(group, user, kind);
}

async function refreshed(group, user, part) {
  const fresh = await Group.findById(group._id);
  realtime.toGroup(group._id, 'group:updated', { groupId: String(group._id), part });
  return groupService.summary(fresh, user._id);
}

/** Pagina del club: identità completa (con copertina) e statistiche complessive reali. */
async function profile(group) {
  const { matches, ratings } = await statsEngine.loadPlayed(group._id);
  const rows = statsEngine.playerRows(matches, ratings);
  const perUser = new Map();
  for (const r of rows) {
    if (!perUser.has(r.user)) perUser.set(r.user, []);
    perUser.get(r.user).push(r);
  }
  const summaries = [...perUser].map(([user, list]) => ({ user, ...statsEngine.summarize(list) }));
  const top = (key) => {
    const max = Math.max(0, ...summaries.map((s) => s[key]));
    return max > 0 ? { value: max, users: summaries.filter((s) => s[key] === max).map((s) => s.user) } : null;
  };
  const scorer = top('goals');
  const present = top('played');
  const mvp = top('mvp');
  const allGoals = matches.reduce((a, m) => a + m.scoreA + m.scoreB, 0);
  const season = await seasonService.current(group);

  const holders = [...(scorer?.users || []), ...(present?.users || []), ...(mvp?.users || [])];
  const resolve = await userResolver(holders, await nicknameService.activeMap(group._id));
  const leader = (t) => (t ? { value: t.value, users: t.users.slice(0, 3).map((u) => resolve(u)), others: Math.max(0, t.users.length - 3) } : null);

  return {
    identity: { ...groupService.summary(group, null), coverUrl: group.coverUrl || null },
    stats: {
      matches: matches.length,
      goals: allGoals,
      goalsPerMatch: matches.length ? Math.round((allGoals / matches.length) * 10) / 10 : null,
      members: group.members.length,
      since: group.createdAt,
      firstMatchAt: matches[0]?.startsAt || null,
      mvpAwarded: matches.filter((m) => m.mvp.length).length,
      activeSeason: season ? { key: season.key, label: season.label } : null,
      topScorer: leader(scorer),
      mostPresent: leader(present),
      mostMvp: leader(mvp),
    },
  };
}

module.exports = { setImage, removeImage, profile, LIMITS };
