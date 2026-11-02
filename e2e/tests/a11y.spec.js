// Accessibilità (axe-core, WCAG 2.1 AA) su tutte le schermate principali, in tema scuro e chiaro,
// e controllo a 390 px che non ci sia scorrimento orizzontale.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const api = require('../support/api');

let scenario;

test.beforeAll(async () => {
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
  scenario = { marco, g, upcoming, played };
});

const pages = () => [
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
];

for (const theme of ['dark', 'light']) {
  test(`axe-core senza violazioni WCAG AA, tema ${theme === 'dark' ? 'scuro' : 'chiaro'}`, async ({ browser }) => {
    const failures = [];
    for (const p of pages()) {
      const context = await browser.newContext();
      if (p.auth === false) await context.addInitScript((t) => localStorage.setItem('bonmatch.theme', t), theme);
      else await api.loginAs(context, scenario.marco, theme);
      const page = await context.newPage();
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of results.violations) {
        failures.push(`${p.name}: ${v.id} (${v.impact}) – ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }
      await context.close();
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
}

test('a 390 px nessuna pagina scorre in orizzontale', async ({ browser }) => {
  const problems = [];
  for (const p of pages()) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    if (p.auth !== false) await api.loginAs(context, scenario.marco);
    const page = await context.newPage();
    await page.goto(p.path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${p.name}: ${overflow}px`);
    await context.close();
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
