'use strict';

/*
 * Ricostruisce le voci del feed dai dati già salvati (partite create,
 * risultati, MVP, premi). Idempotente: ogni voce ha una chiave unica, quindi
 * rilanciarlo non crea doppioni. Non modifica né cancella altri dati.
 */
const { Match, Group } = require('../models');
const activityService = require('../services/activityService');

async function backfillActivity(groupIds) {
  const groups = groupIds ? groupIds.map((id) => ({ _id: id })) : await Group.find().select('_id').lean();
  let created = 0;
  for (const g of groups) {
    const matches = await Match.find({ group: g._id }).lean();
    const events = [];
    for (const m of matches) {
      // Una partita non può essere stata creata dopo essere stata giocata (succede solo con dati importati).
      const createdAt = new Date(Math.min(new Date(m.createdAt).getTime(), new Date(m.startsAt).getTime() - 2 * 86_400_000));
      events.push({ at: createdAt, type: 'partita_creata', opts: { actor: m.organizer, data: { field: m.field }, key: `creata:${m._id}` }, m });
      if (m.result && m.teams) {
        events.push({
          at: m.result.recordedAt,
          type: 'risultato',
          opts: { actor: m.result.recordedBy, data: { scoreA: m.result.scoreA, scoreB: m.result.scoreB, teamA: m.teams.a.name, teamB: m.teams.b.name }, key: `risultato:${m._id}` },
          m,
        });
      }
      if (m.voting?.closed && m.voting.mvp?.length) {
        events.push({ at: m.voting.closedAt || m.voting.closesAt, type: 'mvp', opts: { target: m.voting.mvp[0], data: { winners: m.voting.mvp.map(String) }, key: `mvp:${m._id}` }, m });
      }
      if (m.prizePoll?.closed && m.prizePoll.winners?.length) {
        const labels = m.prizePoll.winners.map((k) => m.prizePoll.options.find((o) => o.key === k)).filter(Boolean).map((o) => `${o.label} ${o.emoji}`);
        events.push({ at: m.prizePoll.closedAt || m.voting?.closesAt, type: 'premio', opts: { data: { winners: m.prizePoll.winners, labels }, key: `premio:${m._id}` }, m });
      }
    }
    // In ordine cronologico, così il feed (ordinato per inserimento) rispetta le date.
    events.sort((x, y) => new Date(x.at) - new Date(y.at));
    for (const e of events) {
      if (await activityService.record(g._id, e.type, { match: e.m._id, createdAt: e.at, ...e.opts })) created += 1;
    }
  }
  return created;
}

module.exports = { backfillActivity };
