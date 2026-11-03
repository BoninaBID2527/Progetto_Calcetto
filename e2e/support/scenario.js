// Scenario condiviso dei test: un gruppo con utenti, partite giocate, premi, cassa, ricorrenza e convocazione.
const api = require('./api');

async function buildScenario() {
  const marco = await api.user('Marco Rossi', { preferredRole: 'centrocampista', foot: 'destro' });
  const others = [];
  for (const [name, role] of [['Luca Bianchi', 'attaccante'], ['Andrea Ferrero', 'portiere'], ['Davide Gallo', 'difensore']]) {
    others.push(await api.user(name, { preferredRole: role }));
  }
  const g = await api.group(marco, others, { name: 'Calcetto del giovedì', description: 'Ogni giovedì alle 21.' });
  await api.call('POST', `/groups/${g.id}/nicknames`, { token: others[0].token, body: { targetUserId: marco.user.id, text: 'Il Sindaco' } });
  const upcoming = await api.match(marco, g, { slots: 3 });
  for (const u of [marco, ...others]) await api.respond(u, upcoming);
  const played = await api.played(marco, g, [marco, ...others], { scoreA: 4, scoreB: 3 });
  await api.call('POST', `/matches/${played.id}/mvp-vote`, { token: others[0].token, body: { mvpUserId: marco.user.id } });
  await api.call('POST', `/groups/${g.id}/messages`, { token: others[1].token, body: { text: 'Stasera para tutto' } });
  // Dati per le schermate della V2: premi, ricorrenza, quota dichiarata, convocazione aperta, altre partite giocate.
  await api.call('PATCH', `/groups/${g.id}`, { token: marco.token, body: { settings: { cashbox: true, awards: { bomber: true, portiere: true } } } });
  const withAwards = await api.played(marco, g, [marco, ...others], { scoreA: 5, scoreB: 2, scorers: [{ userId: others[0].user.id, goals: 3 }] });
  await api.call('POST', `/matches/${withAwards.id}/awards/portiere/vote`, { token: others[0].token, body: { nominee: others[1].user.id } });
  for (let i = 0; i < 2; i++) await api.played(marco, g, [marco, ...others], { scoreA: 3 + i, scoreB: 1 });
  await api.call('PATCH', `/matches/${played.id}/participants/${others[0].user.id}/payment`, { token: others[0].token, body: { payment: 'dichiarato' } });
  await api.call('POST', `/groups/${g.id}/ledger`, { token: marco.token, body: { type: 'spesa', paidFrom: 'cassa', amountCents: 1500, note: 'Palloni' } });
  await api.call('POST', `/groups/${g.id}/series`, { token: marco.token, body: { field: 'santena', weekday: 4, time: '21:00', startsOn: new Date().toISOString().slice(0, 10), slots: 10 } });
  await api.call('POST', `/groups/${g.id}/polls`, { token: marco.token, body: { mode: 'fissa', field: 'cambiano', startsAt: api.inDays(4), playersNeeded: 4, deadline: api.inDays(3) } });
  return { marco, g, upcoming, played, withAwards };
}

function pagesFor(scenario) {
  return [
  { name: 'landing', path: '/', auth: false },
  { name: 'accesso', path: '/accedi', auth: false },
  { name: 'registrazione', path: '/registrati', auth: false },
  { name: 'gruppi', path: '/gruppi' },
  { name: 'partite', path: `/gruppi/${scenario.g.id}/partite` },
  { name: 'nuova partita', path: `/gruppi/${scenario.g.id}/nuova-partita` },
  { name: "partita con lista d'attesa", path: `/partite/${scenario.upcoming.id}` },
  { name: 'partita giocata', path: `/partite/${scenario.played.id}` },
  { name: 'classifiche', path: `/gruppi/${scenario.g.id}/classifiche` },
  { name: 'chat', path: `/gruppi/${scenario.g.id}/chat` },
  { name: 'membri', path: `/gruppi/${scenario.g.id}/membri` },
  { name: 'notifiche', path: '/notifiche' },
  { name: 'profilo', path: '/profilo' },
  { name: 'spogliatoio', path: `/gruppi/${scenario.g.id}` },
  { name: 'convocazioni', path: `/gruppi/${scenario.g.id}/boncall` },
  { name: 'nuova convocazione', path: `/gruppi/${scenario.g.id}/boncall/nuova` },
  { name: 'BONCARD', path: `/gruppi/${scenario.g.id}/giocatori/${scenario.marco.user.id}` },
  { name: 'MATCHDAY', path: `/partite/${scenario.upcoming.id}/matchday` },
  { name: 'partita con premi', path: `/partite/${scenario.withAwards.id}` },
  { name: 'rivalità', path: `/gruppi/${scenario.g.id}/rivalita` },
  { name: 'Hall of Fame', path: `/gruppi/${scenario.g.id}/hall-of-fame` },
  { name: 'calendario', path: '/calendario' },
  { name: 'club', path: `/gruppi/${scenario.g.id}/club` },
  { name: 'cassa', path: `/gruppi/${scenario.g.id}/cassa` },
  { name: 'terzo tempo', path: `/gruppi/${scenario.g.id}/terzo-tempo` },
  { name: 'BONWRAPPED', path: `/gruppi/${scenario.g.id}/wrapped` },
];
}

module.exports = { buildScenario, pagesFor };
