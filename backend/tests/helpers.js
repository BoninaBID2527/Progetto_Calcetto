'use strict';

const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../src/app');
const { connectDatabase } = require('../src/db');
require('../src/models');

const app = createApp();
const api = () => request(app);

/** Collega il database di prova e lo svuota prima e dopo ogni file di test. */
function useTestDatabase() {
  beforeAll(async () => {
    const base = process.env.MONGODB_URI_TEST;
    if (!base || !/test/i.test(base)) throw new Error('Database di prova non configurato.');
    // Un database per ogni worker di Jest, così i file in parallelo non si disturbano.
    const url = new URL(base);
    url.pathname = `${url.pathname.replace(/\/$/, '')}_${process.env.JEST_WORKER_ID || 1}`;
    await connectDatabase(url.toString());
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

let counter = 0;

/** Registra un utente via API e restituisce token, utente e header pronto. */
async function createUser(name = 'Giocatore') {
  counter += 1;
  const email = `${name.toLowerCase().replace(/\W+/g, '')}${counter}@calcetto.test`;
  const res = await api().post('/api/auth/register').send({ name, email, password: 'calcetto2026' });
  if (res.status !== 201) throw new Error(`Registrazione fallita: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body, email, auth: { Authorization: `Bearer ${res.body.token}` } };
}

async function createGroup(owner, data = {}) {
  const res = await api().post('/api/groups').set(owner.auth).send({ name: 'Calcetto del giovedì', ...data });
  if (res.status !== 201) throw new Error(`Creazione gruppo fallita: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.group;
}

async function joinGroup(user, group) {
  const res = await api().post('/api/groups/join').set(user.auth).send({ code: group.inviteCode });
  if (res.status !== 201) throw new Error(`Ingresso nel gruppo fallito: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.group;
}

/** Gruppo con un admin e `size - 1` membri già dentro. */
async function groupWithMembers(size = 4) {
  const admin = await createUser('Admin');
  const group = await createGroup(admin);
  const members = [];
  for (let i = 1; i < size; i++) {
    const u = await createUser(`Membro${i}`);
    await joinGroup(u, group);
    members.push(u);
  }
  return { admin, group, members, all: [admin, ...members] };
}

const inDays = (days, hour = 21) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function createMatch(user, group, data = {}) {
  const res = await api()
    .post(`/api/groups/${group.id}/matches`)
    .set(user.auth)
    .send({ field: 'santena', startsAt: inDays(3), slots: 10, costCents: 6000, ...data });
  if (res.status !== 201) throw new Error(`Creazione partita fallita: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.match;
}

const respond = (user, match, response = 'ci_sono') =>
  api().put(`/api/matches/${match.id}/response`).set(user.auth).send({ response });

module.exports = { app, api, useTestDatabase, createUser, createGroup, joinGroup, groupWithMembers, createMatch, respond, inDays };
