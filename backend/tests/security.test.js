'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { api, useTestDatabase, groupWithMembers, createUser } = require('./helpers');
const { hasOperatorKeys } = require('../src/middleware/sanitize');

useTestDatabase();

describe('Chiavi di operatore nei corpi, nelle query e nei parametri', () => {
  test('hasOperatorKeys riconosce $, punti, __proto__ e annidamenti, anche negli array', () => {
    expect(hasOperatorKeys({ email: { $gt: '' } })).toBe(true);
    expect(hasOperatorKeys({ a: [{ 'b.c': 1 }] })).toBe(true);
    expect(hasOperatorKeys(JSON.parse('{"__proto__":{"x":1}}'))).toBe(true);
    expect(hasOperatorKeys({ name: 'Marco', settings: { organizers: 'tutti' } })).toBe(false);
    expect(hasOperatorKeys('testo')).toBe(false);
    let deep = {};
    const root = deep;
    for (let i = 0; i < 30; i++) deep = deep.a = {};
    expect(hasOperatorKeys(root)).toBe(true);
  });

  test('login con operatori: 400, nessun accesso', async () => {
    await createUser('Vittima');
    const res = await api().post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body).not.toHaveProperty('token');
  });

  test('registrazione, gruppo, partita e query con chiavi $ o con punti: 400', async () => {
    const ctx = await groupWithMembers(2);
    expect((await api().post('/api/auth/register').send({ name: 'x', email: 'a@b.it', password: 'calcetto2026', $where: '1' })).status).toBe(400);
    expect((await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ settings: { 'season.mode': 'mensile' } })).status).toBe(400);
    expect((await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ name: { $gt: '' } })).status).toBe(400);
    expect((await api().get(`/api/groups/${ctx.group.id}/rankings?period[$ne]=x`).set(ctx.admin.auth)).status).toBe(400);
    expect((await api().get(`/api/groups/${ctx.group.id}/ledger?userId[$gt]=`).set(ctx.admin.auth)).status).toBe(400);
    // Il gruppo non è stato toccato.
    expect((await api().get(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth)).body.group.settings.season.mode).toBe('annuale');
  });

  test('richieste normali non sono toccate', async () => {
    const ctx = await groupWithMembers(2);
    const ok = await api().patch(`/api/groups/${ctx.group.id}`).set(ctx.admin.auth).send({ name: 'Nuovo nome', settings: { season: { mode: 'mensile' } } });
    expect(ok.status).toBe(200);
  });
});

describe('Limiti di frequenza', () => {
  const limited = (rateLimit) => request(createApp({ rateLimit: { enabled: true, windowMs: 60_000, authWindowMs: 60_000, apiMax: 1000, loginMax: 1000, registerMax: 1000, ...rateLimit } }));

  test('generale: oltre il limite 429 con messaggio in italiano; /health esclusa', async () => {
    const app = limited({ apiMax: 3 });
    for (let i = 0; i < 3; i++) expect((await app.get('/api/config')).status).toBe(200);
    const blocked = await app.get('/api/config');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatchObject({ code: 'RATE_LIMITED' });
    expect(blocked.body.error.message).toMatch(/Troppe richieste/);
    expect(blocked.headers).toHaveProperty('ratelimit');
    expect((await app.get('/api/health')).status).toBe(200);
  });

  test('accesso: contano solo i tentativi falliti (forza bruta), non quelli riusciti', async () => {
    const app = limited({ loginMax: 3 });
    const ok = await app.post('/api/auth/register').send({ name: 'Limite', email: 'limite@calcetto.test', password: 'calcetto2026' });
    expect(ok.status).toBe(201);
    for (let i = 0; i < 5; i++) expect((await app.post('/api/auth/login').send({ email: 'limite@calcetto.test', password: 'calcetto2026' })).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await app.post('/api/auth/login').send({ email: 'limite@calcetto.test', password: 'sbagliata123' })).status).toBe(401);
    const blocked = await app.post('/api/auth/login').send({ email: 'limite@calcetto.test', password: 'calcetto2026' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toMatch(/tentativi di accesso/);
  });

  test('registrazioni: limite per IP', async () => {
    const app = limited({ registerMax: 2 });
    for (let i = 0; i < 2; i++) expect((await app.post('/api/auth/register').send({ name: 'Utente', email: `reg${i}@calcetto.test`, password: 'calcetto2026' })).status).toBe(201);
    expect((await app.post('/api/auth/register').send({ name: 'Utente', email: 'reg9@calcetto.test', password: 'calcetto2026' })).status).toBe(429);
  });

  test('disattivato per impostazione nei test: nessun 429 anche con molte richieste', async () => {
    for (let i = 0; i < 40; i++) expect((await api().get('/api/config')).status).toBe(200);
  });
});

describe('Intestazioni di sicurezza e CORS', () => {
  test('helmet attivo, nessun X-Powered-By, CORS solo per l\'origine configurata', async () => {
    const res = await api().get('/api/config').set('Origin', 'http://localhost:5173');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await api().get('/api/config').set('Origin', 'https://sito-malevolo.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('gli endpoint autenticati rifiutano token assenti, malformati o altrui', async () => {
    expect((await api().get('/api/groups')).status).toBe(401);
    expect((await api().get('/api/groups').set('Authorization', 'Bearer abc')).status).toBe(401);
    expect((await api().get('/api/calendar/export.ics')).status).toBe(401);
    expect((await api().get('/api/matches/0123456789abcdef01234567')).status).toBe(401);
  });
});
