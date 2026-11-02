'use strict';

const { api, useTestDatabase, createUser, createGroup, joinGroup, createMatch } = require('./helpers');

useTestDatabase();

describe('Gruppi e permessi', () => {
  let admin;
  let member;
  let outsider;
  let group;

  beforeAll(async () => {
    admin = await createUser('Marco');
    member = await createUser('Luca');
    outsider = await createUser('Estraneo');
    group = await createGroup(admin, { name: 'Calcetto del giovedì', emoji: '⚽', color: '#2EE59D' });
  });

  test('chi crea il gruppo ne diventa admin e riceve un codice di 6 caratteri', () => {
    expect(group.myRole).toBe('admin');
    expect(group.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  test('anteprima del codice senza email e ingresso con il codice', async () => {
    const preview = await api().get(`/api/groups/invite/${group.inviteCode.toLowerCase()}`).set(member.auth);
    expect(preview.status).toBe(200);
    expect(preview.body.invite).toMatchObject({ name: 'Calcetto del giovedì', memberCount: 1, alreadyMember: false });
    expect(JSON.stringify(preview.body)).not.toMatch(/@calcetto\.test/);

    const joined = await joinGroup(member, group);
    expect(joined.myRole).toBe('member');
    expect(joined.memberCount).toBe(2);
  });

  test('codice inesistente: 404; già membro: 409; codice malformato: 422', async () => {
    expect((await api().post('/api/groups/join').set(outsider.auth).send({ code: 'ZZZZZZ' })).status).toBe(404);
    expect((await api().post('/api/groups/join').set(member.auth).send({ code: group.inviteCode })).status).toBe(409);
    expect((await api().post('/api/groups/join').set(outsider.auth).send({ code: '12' })).status).toBe(422);
  });

  test('chi non è nel gruppo riceve 403 su tutto e non vede le email', async () => {
    const match = await createMatch(admin, group);
    const paths = [
      ['get', `/api/groups/${group.id}`],
      ['get', `/api/groups/${group.id}/members`],
      ['get', `/api/groups/${group.id}/matches`],
      ['get', `/api/groups/${group.id}/messages`],
      ['get', `/api/groups/${group.id}/nicknames`],
      ['get', `/api/matches/${match.id}`],
      ['put', `/api/matches/${match.id}/response`],
      ['post', `/api/groups/${group.id}/messages`],
    ];
    for (const [method, path] of paths) {
      const res = await api()[method](path).set(outsider.auth).send({ response: 'ci_sono', text: 'ciao' });
      expect([path, res.status]).toEqual([path, 403]);
      expect(JSON.stringify(res.body)).not.toMatch(/@calcetto\.test/);
    }
  });

  test('id malformato: 400; gruppo inesistente: 404', async () => {
    expect((await api().get('/api/groups/123').set(admin.auth)).status).toBe(400);
    expect((await api().get('/api/groups/0123456789abcdef01234567').set(admin.auth)).status).toBe(404);
  });

  test('i membri vedono la lista con le email; le partite non espongono email', async () => {
    const res = await api().get(`/api/groups/${group.id}/members`).set(member.auth);
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members.map((m) => m.user.email)).toContain(admin.email);
    const matches = await api().get(`/api/groups/${group.id}/matches`).set(member.auth);
    expect(JSON.stringify(matches.body)).not.toMatch(/@calcetto\.test/);
  });

  test('solo l\'admin rigenera il codice, modifica il gruppo e promuove', async () => {
    expect((await api().post(`/api/groups/${group.id}/invite-code`).set(member.auth)).status).toBe(403);
    expect((await api().patch(`/api/groups/${group.id}`).set(member.auth).send({ name: 'Nuovo' })).status).toBe(403);
    const regen = await api().post(`/api/groups/${group.id}/invite-code`).set(admin.auth);
    expect(regen.status).toBe(200);
    expect(regen.body.group.inviteCode).not.toBe(group.inviteCode);
    // Il vecchio codice non funziona più.
    expect((await api().post('/api/groups/join').set(outsider.auth).send({ code: group.inviteCode })).status).toBe(404);
    group = regen.body.group;

    const promote = await api().patch(`/api/groups/${group.id}/members/${member.user.id}`).set(admin.auth).send({ role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.members.find((m) => m.user.id === member.user.id).role).toBe('admin');
  });

  test('impostazioni del gruppo validate (422) e opzioni extra del premio', async () => {
    const bad = await api().patch(`/api/groups/${group.id}`).set(admin.auth).send({ settings: { minMatchesForRanking: 0 } });
    expect(bad.status).toBe(422);
    const ok = await api()
      .patch(`/api/groups/${group.id}`)
      .set(admin.auth)
      .send({ settings: { minMatchesForRanking: 2, loserPaysFirstRound: true, extraPrizeOptions: [{ label: 'Gelato', emoji: '🍦' }] } });
    expect(ok.status).toBe(200);
    expect(ok.body.group.settings).toMatchObject({ minMatchesForRanking: 2, loserPaysFirstRound: true });
    expect(ok.body.group.settings.extraPrizeOptions[0]).toMatchObject({ key: 'extra-gelato', label: 'Gelato' });
  });

  test('rimozione membri: un membro non rimuove altri (403), l\'admin sì; si può uscire da soli', async () => {
    const third = await createUser('Terzo');
    await joinGroup(third, group);
    const plain = await createUser('Quarto');
    await joinGroup(plain, group);
    expect((await api().delete(`/api/groups/${group.id}/members/${third.user.id}`).set(plain.auth)).status).toBe(403);
    expect((await api().delete(`/api/groups/${group.id}/members/${third.user.id}`).set(admin.auth)).status).toBe(204);
    expect((await api().get(`/api/groups/${group.id}`).set(third.auth)).status).toBe(403);
    expect((await api().delete(`/api/groups/${group.id}/members/${plain.user.id}`).set(plain.auth)).status).toBe(204);
  });

  test('l\'ultimo admin non può uscire né essere declassato se ci sono altri membri', async () => {
    const solo = await createUser('Solo');
    const g = await createGroup(solo, { name: 'Gruppo piccolo' });
    const friend = await createUser('Amico');
    await joinGroup(friend, g);
    expect((await api().delete(`/api/groups/${g.id}/members/${solo.user.id}`).set(solo.auth)).status).toBe(409);
    expect((await api().patch(`/api/groups/${g.id}/members/${solo.user.id}`).set(solo.auth).send({ role: 'member' })).status).toBe(409);
  });

  test('un utente può stare in più gruppi', async () => {
    const other = await createGroup(admin, { name: 'Amici del lunedì' });
    await joinGroup(member, other);
    const res = await api().get('/api/groups').set(member.auth);
    expect(res.body.groups.map((g) => g.name).sort()).toEqual(['Amici del lunedì', 'Calcetto del giovedì']);
  });
});
