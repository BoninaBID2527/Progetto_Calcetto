// Screenshot di ogni schermata principale a 390, 768, 1280 e 1920 px, nel tema scuro.
// Si lanciano a richiesta (servono alla documentazione, non a ogni esecuzione):
//   SCREENSHOTS=1 npx playwright test tests/screenshots.spec.js
// Le immagini finiscono in docs/screenshots/v2/.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const api = require('../support/api');
const { buildScenario, pagesFor } = require('../support/scenario');

const WIDTHS = [390, 768, 1280, 1920];
const OUT = path.join(__dirname, '..', '..', 'docs', 'screenshots', 'v2');
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

test('screenshot delle schermate principali a quattro larghezze, senza scorrimento orizzontale', async ({ browser }) => {
  test.skip(!process.env.SCREENSHOTS, 'Si esegue solo con SCREENSHOTS=1.');
  test.setTimeout(900_000);
  fs.mkdirSync(OUT, { recursive: true });
  const scenario = await buildScenario();
  const overflow = [];
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: Math.round(width * 1.8) > 2400 ? 1200 : 900 }, isMobile: width < 500, hasTouch: width < 500 });
    await api.loginAs(context, scenario.marco, 'dark');
    for (const p of pagesFor(scenario).filter((x) => x.auth !== false)) {
      const page = await context.newPage();
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (extra > 0) overflow.push(`${p.name} a ${width}px: ${extra}px`);
      await page.screenshot({ path: path.join(OUT, `${slug(p.name)}-${width}.jpg`), fullPage: true, type: 'jpeg', quality: 72 });
      await page.close();
    }
    await context.close();
  }
  expect(overflow, overflow.join('\n')).toEqual([]);
});
