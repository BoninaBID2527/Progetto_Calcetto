'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond } = require('./helpers');
const scheduler = require('../src/jobs/scheduler');
const { Match, Notification } = require('../src/models');

useTestDatabase();

describe('Programma periodico', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });

  test('promemoria il giorno prima solo a chi non ha risposto, una volta sola', async () => {
    const match = await createMatch(ctx.admin, ctx.group, { startsAt: new Date(Date.now() + 5 * 3_600_000).toISOString() });
    await respond(ctx.members[0], match, 'ci_sono');
    await respond(ctx.members[1], match, 'non_ci_sono');
    await scheduler.tick();
    const reminded = await Notification.find({ type: 'promemoria' }).lean();
    expect(reminded.map((n) => String(n.user)).sort()).toEqual([ctx.admin.user.id, ctx.members[2].user.id].sort());
    await scheduler.tick();
    expect(await Notification.countDocuments({ type: 'promemoria' })).toBe(2);
  });

  test('le partite lontane non ricevono promemoria', async () => {
    await createMatch(ctx.admin, ctx.group, { startsAt: new Date(Date.now() + 4 * 86_400_000).toISOString() });
    const before = await Notification.countDocuments({ type: 'promemoria' });
    await scheduler.tick();
    expect(await Notification.countDocuments({ type: 'promemoria' })).toBe(before);
  });

  test('all\'orario d\'inizio le iscrizioni si chiudono da sole', async () => {
    const match = await createMatch(ctx.admin, ctx.group);
    await Match.updateOne({ _id: match.id }, { $set: { startsAt: new Date(Date.now() - 60_000) } });
    const { closed } = await scheduler.tick();
    expect(closed).toBeGreaterThanOrEqual(1);
    expect((await Match.findById(match.id)).status).toBe('chiusa');
  });

  test('le votazioni scadute vengono chiuse', async () => {
    const match = await createMatch(ctx.admin, ctx.group, { slots: 4 });
    for (const u of ctx.all) await respond(u, match);
    await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
    await api().post(`/api/matches/${match.id}/teams/balance`).set(ctx.admin.auth).send({});
    await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ scoreA: 1, scoreB: 0 });
    await Match.updateOne({ _id: match.id }, { $set: { 'voting.closesAt': new Date(Date.now() - 1000) } });
    const { finalized } = await scheduler.tick();
    expect(finalized).toBe(1);
    const stored = await Match.findById(match.id).lean();
    expect(stored.voting.closed).toBe(true);
    expect(stored.prizePoll.closed).toBe(true);
  });
});
