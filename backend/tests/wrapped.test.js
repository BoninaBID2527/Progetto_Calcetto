'use strict';

const mongoose = require('mongoose');
const { api, useTestDatabase, groupWithMembers } = require('./helpers');
const { Match, Rating, Group } = require('../src/models');
const achievementService = require('../src/services/achievementService');

useTestDatabase();

const day = 86_400_000;
const wrapped = async (who, ctx, q = '') => api().get(`/api/groups/${ctx.group.id}/wrapped${q}`).set(who.auth);

/** Partite giocate già salvate: squadre [a,b] vs [c,d], punteggio, marcatori, MVP. */
async function seed(ctx, specs) {
  const group = await Group.findById(ctx.group.id);
  group.members.forEach((m) => (m.joinedAt = new Date(Date.now() - 400 * day)));
  group.settings.minMatchesForRanking = 1;
  await group.save();
  const ids = ctx.all.map((u) => new mongoose.Types.ObjectId(u.user.id));
  const [a, b, c, d] = ids;
  const docs = await Match.insertMany(
    specs.map((s) => ({
      group: group._id,
      organizer: a,
      field: 'santena',
      startsAt: new Date(Date.now() - s.daysAgo * day),
      slots: 4,
      freeSlots: 0,
      status: 'giocata',
      participants: ids.map((user) => ({ user, response: 'ci_sono' })),
      teams: { a: { name: 'Chiare', players: [a, b] }, b: { name: 'Scure', players: [c, d] }, method: 'manuale' },
      result: { scoreA: s.a, scoreB: s.b, scorers: (s.scorers || []).map(([i, goals]) => ({ user: ids[i], goals })) },
      voting: { opensAt: new Date(), closesAt: new Date(), closed: true, mvp: (s.mvp || []).map((i) => ids[i]) },
      awards: s.awardKey ? [{ key: s.awardKey, label: 'x', mode: 'voto' }] : [],
      awardWinners: s.awardKey ? [{ key: s.awardKey, users: [ids[0]] }] : [],
    }))
  );
  return { docs, ids };
}

describe('BONWRAPPED', () => {
  test('troppo pochi dati: lo dichiara, senza numeri inventati', async () => {
    const ctx = await groupWithMembers(4);
    await seed(ctx, [{ daysAgo: 5, a: 3, b: 1 }, { daysAgo: 3, a: 2, b: 2 }]);
    const res = await wrapped(ctx.admin, ctx, '?season=sempre');
    expect(res.status).toBe(200);
    expect(res.body.wrapped).toMatchObject({ enough: false, played: 2, minMatches: 3 });
    expect(res.body.wrapped.reason).toMatch(/almeno 3 partite/);
    expect(res.body.wrapped).not.toHaveProperty('summary');
    expect(res.body.wrapped).not.toHaveProperty('moments');
  });

  test('nessuna stagione in corso (personalizzata): riepilogo non disponibile, senza errori', async () => {
    const ctx = await groupWithMembers(4);
    await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { season: { mode: 'personalizzata' } } });
    const res = await wrapped(ctx.admin, ctx);
    expect(res.status).toBe(200);
    expect(res.body.wrapped).toMatchObject({ enough: false, season: { label: 'Fuori stagione' } });
  });

  describe('con dati reali', () => {
    let ctx;
    let res;
    beforeAll(async () => {
      ctx = await groupWithMembers(4);
      const { docs } = await seed(ctx, [
        { daysAgo: 40, a: 5, b: 1, scorers: [[0, 3], [1, 1], [2, 1]], mvp: [0], awardKey: 'bomber' },
        { daysAgo: 30, a: 6, b: 1, scorers: [[0, 1], [1, 5]], mvp: [1] },
        { daysAgo: 20, a: 2, b: 2 },
        { daysAgo: 10, a: 3, b: 0, mvp: [0] },
        { daysAgo: 5, a: 4, b: 1 },
      ]);
      // Voti: il giocatore 0 migliora nel tempo.
      const [a, b] = ctx.all.map((u) => new mongoose.Types.ObjectId(u.user.id));
      const group = new mongoose.Types.ObjectId(ctx.group.id);
      const scores = [5, 6, 8, 9];
      for (let i = 0; i < 4; i++) await Rating.create({ match: docs[i]._id, group, rater: b, ratee: a, score: scores[i] });
      await achievementService.evaluateGroup(ctx.group.id, { notify: false });
      res = await wrapped(ctx.admin, ctx, '?season=sempre');
    });

    test('riepilogo: partite, esiti, gol (solo dove inseriti), MVP, voto medio', () => {
      const w = res.body.wrapped;
      expect(w.enough).toBe(true);
      expect(w.summary).toMatchObject({ played: 5, wins: 4, draws: 1, losses: 0, goals: 3 + 1, goalsMatches: 2, mvp: 2, ratingsCount: 4 });
      expect(w.summary.avgRating).toBe(7);
      expect(w.summary.winRate).toBeCloseTo(0.8);
      expect(w.user.id).toBe(ctx.admin.user.id);
      expect(JSON.stringify(w)).not.toMatch(/@calcetto\.test/);
    });

    test('migliore partita, record e momenti sono quelli veri', () => {
      const w = res.body.wrapped;
      expect(w.bestMatch).toMatchObject({ rating: 9, score: '3-0', result: 'V' });
      expect(w.records.mostGoals.goals).toBe(3);
      expect(w.records.winStreak.length).toBe(2); // 5-1, 6-1, poi il pari: due vittorie di fila al massimo
      const keys = w.moments.map((m) => m.key);
      expect(keys).toEqual(expect.arrayContaining(['primo_gol', 'tripletta', 'goleada', 'mvp']));
      expect(keys).not.toContain('serie'); // la serie non arriva a 3: nessun momento inventato
      expect(w.moments.find((m) => m.key === 'tripletta')).toMatchObject({ title: 'Una tripletta', score: '5-1' });
      expect(w.moments.find((m) => m.key === 'goleada').text).toMatch(/5 gol/);
      expect(w.moments.filter((m) => m.key === 'mvp')).toHaveLength(2);
    });

    test('rivalità e intesa solo con almeno 3 partite insieme; premi e traguardi del periodo', () => {
      const w = res.body.wrapped;
      expect(w.rivalry).toMatchObject({ played: 5, wins: 4, draws: 1, losses: 0 });
      expect(w.partner).toMatchObject({ played: 5, wins: 4 });
      expect(w.partner.user.name).toBe('Membro1');
      expect(w.awards.mvp).toBe(2);
      expect(w.awards.matchAwards).toEqual([{ key: 'bomber', label: 'Bomber della serata', count: 1 }]);
      expect(w.achievements.map((a) => a.key)).toEqual(expect.arrayContaining(['prima_partita', 'primo_gol', 'primo_mvp']));
      expect(w.achievements.map((a) => a.key)).not.toContain('serie_3');
    });

    test('progressione: seconda metà contro prima metà delle partite valutate', () => {
      const p = res.body.wrapped.progression;
      expect(p.points).toHaveLength(4);
      expect(p).toMatchObject({ first: 5.5, second: 8.5, delta: 3 });
    });

    test('posizioni nelle classifiche del periodo', () => {
      const st = Object.fromEntries(res.body.wrapped.standings.map((s) => [s.key, s]));
      expect(st.vincenti.position).toBe(1);
      expect(st.mvp).toMatchObject({ position: 1, of: 2 });
      expect(st.forti.of).toBe(4);
    });

    test('un altro membro può vedere il riepilogo di un compagno; chi è fuori dal gruppo no; id sbagliati 422/404', async () => {
      const other = ctx.all[1];
      const asOther = await wrapped(ctx.members[1], ctx, `?season=sempre&user=${ctx.admin.user.id}`);
      expect(asOther.body.wrapped.user.id).toBe(ctx.admin.user.id);
      const outsider = (await groupWithMembers(2)).admin;
      expect((await wrapped(outsider, ctx, '?season=sempre')).status).toBe(403);
      expect((await wrapped(ctx.admin, ctx, `?season=sempre&user=${outsider.user.id}`)).status).toBe(404);
      expect((await wrapped(ctx.admin, ctx, '?season=sempre&user=zzz')).status).toBe(422);
      expect((await wrapped(ctx.admin, ctx, '?season=nonesiste')).status).toBe(404);
      void other;
    });

    test('rivalità assente se gli scontri sono meno di 3; progressione assente con meno di 4 voti', async () => {
      const small = await groupWithMembers(4);
      const { docs } = await seed(small, [{ daysAgo: 6, a: 1, b: 0 }, { daysAgo: 4, a: 2, b: 0 }, { daysAgo: 2, a: 1, b: 1 }]);
      const [a, b] = small.all.map((u) => new mongoose.Types.ObjectId(u.user.id));
      await Rating.create({ match: docs[0]._id, group: new mongoose.Types.ObjectId(small.group.id), rater: b, ratee: a, score: 7 });
      const w = (await wrapped(small.admin, small, '?season=sempre')).body.wrapped;
      expect(w.enough).toBe(true);
      expect(w.progression).toBeNull();
      expect(w.summary.goals).toBeNull(); // nessun marcatore inserito
      expect(w.moments.map((m) => m.key)).not.toContain('tripletta');
      expect(w.records.mostGoals).toBeNull();
    });
  });
});
