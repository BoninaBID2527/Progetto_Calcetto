'use strict';

/* Scorciatoie sulle API per preparare gli scenari dei test end-to-end. */
const API = `http://localhost:${process.env.E2E_API_PORT || 4100}/api`;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const run = Date.now().toString(36);
let n = 0;

async function user(name, extra = {}) {
  n += 1;
  const email = `${name.toLowerCase().replace(/\W+/g, '')}.${run}.${n}@calcetto.test`;
  const res = await call('POST', '/auth/register', { body: { name, email, password: 'calcetto2026' } });
  if (Object.keys(extra).length) await call('PATCH', '/users/me', { token: res.token, body: extra });
  return { ...res, email, password: 'calcetto2026' };
}

async function group(owner, members, data = {}) {
  const { group: g } = await call('POST', '/groups', { token: owner.token, body: { name: `Calcetto ${run}`, ...data } });
  for (const m of members) await call('POST', '/groups/join', { token: m.token, body: { code: g.inviteCode } });
  return g;
}

const inDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

async function match(owner, g, data = {}) {
  const { match: m } = await call('POST', `/groups/${g.id}/matches`, {
    token: owner.token,
    body: { field: 'santena', startsAt: inDays(2), slots: 10, costCents: 6000, ...data },
  });
  return m;
}

const respond = (u, m, response = 'ci_sono') => call('PUT', `/matches/${m.id}/response`, { token: u.token, body: { response } });

/** Partita chiusa con squadre e risultato: votazioni aperte. */
async function played(owner, g, players, result = { scoreA: 3, scoreB: 2 }) {
  const m = await match(owner, g, { slots: Math.max(players.length, 2) });
  for (const p of players) await respond(p, m);
  await call('POST', `/matches/${m.id}/status`, { token: owner.token, body: { status: 'chiusa' } });
  const half = Math.ceil(players.length / 2);
  await call('PUT', `/matches/${m.id}/teams`, {
    token: owner.token,
    body: { a: { players: players.slice(0, half).map((p) => p.user.id) }, b: { players: players.slice(half).map((p) => p.user.id) } },
  });
  await call('PUT', `/matches/${m.id}/result`, { token: owner.token, body: result });
  return m;
}

/** Apre il browser già autenticato come `u`. */
async function loginAs(context, u, theme = 'dark') {
  await context.addInitScript(
    ([token, t]) => {
      localStorage.setItem('bonmatch.token', token);
      localStorage.setItem('bonmatch.theme', t);
    },
    [u.token, theme]
  );
}

module.exports = { call, user, group, match, respond, played, loginAs, inDays };
