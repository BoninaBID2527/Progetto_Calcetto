// Accessibilità (axe-core, WCAG 2.1 AA) su tutte le schermate principali, in tema scuro e chiaro,
// e controllo a 390 px che non ci sia scorrimento orizzontale.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const api = require('../support/api');
const { buildScenario, pagesFor } = require('../support/scenario');

let scenario;

test.beforeAll(async () => {
  scenario = await buildScenario();
});

const pages = () => pagesFor(scenario);

for (const theme of ['dark', 'light']) {
  test(`axe-core senza violazioni WCAG AA, tema ${theme === 'dark' ? 'scuro' : 'chiaro'}`, async ({ browser }) => {
    test.setTimeout(400_000);
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
  test.setTimeout(300_000);
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
