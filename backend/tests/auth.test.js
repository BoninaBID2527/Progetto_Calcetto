'use strict';

const { api, useTestDatabase, createUser } = require('./helpers');

useTestDatabase();

describe('Autenticazione', () => {
  test('registrazione: 201 con token e utente senza password', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Marco', email: 'Marco@Calcetto.test', password: 'calcetto2026' });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: 'Marco', email: 'marco@calcetto.test' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('registrazione con email già usata: 409 con errore sul campo', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Marco Bis', email: 'marco@calcetto.test', password: 'calcetto2026' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.email).toMatch(/già registrata/);
  });

  test('registrazione con dati non validi: 422 con un messaggio per campo', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'M', email: 'non-una-email', password: 'corta' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name', 'password']);
  });

  test('password senza numeri: 422', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Luca', email: 'luca@calcetto.test', password: 'solamentelettere' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.password).toMatch(/numero/);
  });

  test('JSON malformato: 400', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
  });

  test('login corretto: 200; password errata: 401', async () => {
    const ok = await api().post('/api/auth/login').send({ email: 'marco@calcetto.test', password: 'calcetto2026' });
    expect(ok.status).toBe(200);
    const ko = await api().post('/api/auth/login').send({ email: 'marco@calcetto.test', password: 'sbagliata1' });
    expect(ko.status).toBe(401);
    const nobody = await api().post('/api/auth/login').send({ email: 'nessuno@calcetto.test', password: 'calcetto2026' });
    expect(nobody.status).toBe(401);
  });

  test('rotte protette: 401 senza token o con token non valido', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
    expect((await api().get('/api/groups').set('Authorization', 'Token xyz')).status).toBe(401);
  });

  test('logout reale: dopo il logout lo stesso token viene rifiutato', async () => {
    const u = await createUser('Paolo');
    expect((await api().get('/api/auth/me').set(u.auth)).status).toBe(200);
    expect((await api().post('/api/auth/logout').set(u.auth)).status).toBe(204);
    const after = await api().get('/api/auth/me').set(u.auth);
    expect(after.status).toBe(401);
    // Un nuovo login funziona di nuovo.
    const again = await api().post('/api/auth/login').send({ email: u.email, password: 'calcetto2026' });
    expect(again.status).toBe(200);
  });

  test('profilo: aggiorna ruolo, piede e preferenza soprannomi; rifiuta valori non ammessi', async () => {
    const u = await createUser('Davide');
    const res = await api()
      .patch('/api/users/me')
      .set(u.auth)
      .send({ preferredRole: 'portiere', foot: 'sinistro', settings: { nicknameMode: 'sostituisci' } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ preferredRole: 'portiere', foot: 'sinistro', settings: { nicknameMode: 'sostituisci' } });
    const bad = await api().patch('/api/users/me').set(u.auth).send({ preferredRole: 'libero', avatarUrl: 'javascript:alert(1)' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toHaveProperty('preferredRole');
    expect(bad.body.error.fields).toHaveProperty('avatarUrl');
  });

  test('rotta inesistente: 404', async () => {
    expect((await api().get('/api/niente')).status).toBe(404);
  });
});
