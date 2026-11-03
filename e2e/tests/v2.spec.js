// Le funzioni della V2 con due utenti reali: cassa, premi, calendario, club, riepiloghi.
const path = require('path');
const { test, expect } = require('@playwright/test');
const api = require('../support/api');

test.describe.configure({ mode: 'serial' });

let marco;
let luca;
let andrea;
let paolo;
let g;

test.beforeAll(async () => {
  marco = await api.user('Marco Rossi', { preferredRole: 'centrocampista' });
  luca = await api.user('Luca Bianchi', { preferredRole: 'attaccante' });
  andrea = await api.user('Andrea Ferrero', { preferredRole: 'portiere' });
  paolo = await api.user('Paolo Ghigo', { preferredRole: 'difensore' });
  g = await api.group(marco, [luca, andrea, paolo], { name: 'Calcetto del giovedì' });
});

async function twoBrowsers(browser) {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await api.loginAs(ctxA, marco);
  await api.loginAs(ctxB, luca);
  return { a: await ctxA.newPage(), b: await ctxB.newPage(), close: () => Promise.all([ctxA.close(), ctxB.close()]) };
}

test('cassa: Luca dichiara di aver pagato, Marco conferma, il pagamento conta solo dopo', async ({ browser }) => {
  const m = await api.match(marco, g, { slots: 4, costCents: 4000 });
  for (const u of [marco, luca, andrea, paolo]) await api.respond(u, m);
  const { a, b, close } = await twoBrowsers(browser);
  await a.goto(`/partite/${m.id}`);
  await b.goto(`/partite/${m.id}`);

  const lucaRowB = b.locator('.people li', { hasText: 'Luca Bianchi' });
  await expect(lucaRowB.getByText('Da pagare')).toBeVisible();
  await lucaRowB.getByRole('button', { name: /Ho pagato/ }).click();
  await expect(lucaRowB.getByText('Dichiarato')).toBeVisible();
  // Luca non può confermarsi da solo: non esiste il pulsante.
  await expect(lucaRowB.getByRole('button', { name: /Conferma/ })).toHaveCount(0);

  // Marco, che riceve il denaro, lo vede arrivare e lo conferma.
  await a.reload();
  const lucaRowA = a.locator('.people li', { hasText: 'Luca Bianchi' });
  await expect(lucaRowA.getByText('Dichiarato')).toBeVisible();
  await expect(a.getByText('1 in attesa di conferma')).toBeVisible();
  await lucaRowA.getByRole('button', { name: /Conferma/ }).click();
  await expect(lucaRowA.getByText('Pagato')).toBeVisible();
  await expect(a.getByText(/pagato \(confermato\) da 1 su 4/)).toBeVisible();

  // Nella pagina Cassa il saldo di Luca è in pari solo dopo la conferma, e lo storico ha i due passaggi.
  await a.goto(`/gruppi/${g.id}/cassa`);
  await expect(a.getByRole('heading', { name: 'Cassa', level: 2 })).toBeVisible();
  await a.getByRole('button', { name: /Storico/ }).first().click();
  await expect(a.getByText(/dichiarato/).first()).toBeVisible();
  await expect(a.getByText(/verificato/).first()).toBeVisible();
  await close();
});

test('premi: il bomber della serata esce dai marcatori e compare nella partita', async ({ browser }) => {
  await api.call('PATCH', `/groups/${g.id}`, { token: marco.token, body: { settings: { awards: { bomber: true, ironico: { enabled: true, label: 'Il Rimpianto' } } } } });
  const m = await api.match(marco, g, { slots: 4 });
  const players = [marco, luca, andrea, paolo];
  for (const u of players) await api.respond(u, m);
  await api.call('POST', `/matches/${m.id}/status`, { token: marco.token, body: { status: 'chiusa' } });
  await api.call('PUT', `/matches/${m.id}/teams`, { token: marco.token, body: { a: { players: [marco.user.id, luca.user.id] }, b: { players: [andrea.user.id, paolo.user.id] } } });
  await api.call('PUT', `/matches/${m.id}/result`, { token: marco.token, body: { scoreA: 5, scoreB: 2, scorers: [{ userId: luca.user.id, goals: 3 }, { userId: marco.user.id, goals: 2 }] } });

  const ctx = await browser.newContext();
  await api.loginAs(ctx, andrea);
  const page = await ctx.newPage();
  await page.goto(`/partite/${m.id}`);
  const awards = page.getByRole('region', { name: 'Premi della serata' });
  await expect(awards).toBeVisible();
  const bomber = awards.getByRole('article', { name: 'Bomber della serata' });
  await expect(bomber.getByText('Luca Bianchi')).toBeVisible();
  await expect(awards.getByRole('article', { name: 'Il Rimpianto' })).toBeVisible();
  // Voto del premio ironico: un solo voto a testa.
  await awards.getByLabel(/Chi voti per Il Rimpianto/).selectOption({ label: 'Paolo Ghigo' });
  await awards.getByRole('article', { name: 'Il Rimpianto' }).getByRole('button', { name: 'Vota' }).click();
  await expect(awards.getByText(/Hai votato/)).toBeVisible();
  await ctx.close();
});

test('calendario: ricorrenza creata dall\'interfaccia, giorno scelto, esportazione .ics', async ({ browser }) => {
  const ctx = await browser.newContext({ acceptDownloads: true });
  await api.loginAs(ctx, marco);
  const page = await ctx.newPage();
  await page.goto(`/gruppi/${g.id}/nuova-partita`);
  await page.getByLabel('Ripeti ogni settimana').check();
  await page.getByRole('button', { name: /Crea la partita/ }).click();
  await expect(page).toHaveURL(/\/calendario$/);
  await page.getByLabel('Gruppo', { exact: true }).selectOption(g.id);
  await expect(page.getByText(/Ogni .* alle \d\d:\d\d/)).toBeVisible();
  await expect(page.getByRole('grid').getByRole('gridcell')).toHaveCount(42);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Esporta \.ics/ }).click()]);
  expect(download.suggestedFilename()).toBe('bonmatch.ics');
  const text = require('fs').readFileSync(await download.path(), 'utf8');
  expect(text).toContain('BEGIN:VCALENDAR');
  expect(text).toContain('BEGIN:VEVENT');
  await ctx.close();
});

test('club: l\'admin carica lo stemma e tutti lo vedono; un SVG viene rifiutato', async ({ browser }) => {
  const { a, b, close } = await twoBrowsers(browser);
  await a.goto(`/gruppi/${g.id}/club`);
  await a.locator('#up-crest').setInputFiles(path.join(__dirname, '..', 'support', 'files', 'stemma.png'));
  await expect(a.getByText('Stemma aggiornato.')).toBeVisible();
  await a.getByLabel('Motto (facoltativo)').fill('Sempre un tempo in più');
  await a.getByRole('button', { name: 'Salva identità' }).click();
  await expect(a.getByText('Identità del club salvata.')).toBeVisible();

  await b.goto(`/gruppi/${g.id}/club`);
  await expect(b.getByText('«Sempre un tempo in più»')).toBeVisible();
  await expect(b.locator('.club-crest').first()).toBeVisible();
  await expect(b.getByText('Personalizza il club')).toHaveCount(0); // l'editor è solo per gli admin

  await a.locator('#up-crest').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') });
  await expect(a.getByText(/niente SVG/)).toBeVisible();
  await close();
});

test('classifiche, Hall of Fame, terzo tempo e BONWRAPPED si aprono con i dati reali', async ({ browser }) => {
  const players = [marco, luca, andrea, paolo];
  for (let i = 0; i < 3; i++) {
    const m = await api.played(marco, g, players, { scoreA: 4 + i, scoreB: 1 });
    await api.call('POST', `/matches/${m.id}/mvp-vote`, { token: luca.token, body: { mvpUserId: marco.user.id } });
  }
  const ctx = await browser.newContext();
  await api.loginAs(ctx, marco);
  const page = await ctx.newPage();

  await page.goto(`/gruppi/${g.id}/classifiche`);
  await expect(page.getByRole('tab')).toHaveCount(12);
  await page.getByRole('tab', { name: /Miglior difensore/ }).click();
  await expect(page.getByText('Classifica non disponibile')).toBeVisible();
  await expect(page.getByText(/almeno 3 valutazioni/)).toBeVisible();

  await page.goto(`/gruppi/${g.id}/hall-of-fame`);
  await expect(page.getByRole('heading', { name: 'Record assoluti' })).toBeVisible();
  await expect(page.getByText('Più presenze')).toBeVisible();

  await page.goto(`/gruppi/${g.id}/terzo-tempo`);
  await expect(page.getByRole('heading', { name: 'Terzo tempo', level: 2 })).toBeVisible();
  await expect(page.getByText('Votazioni in corso')).toBeVisible();

  await page.goto(`/gruppi/${g.id}/wrapped?`);
  await page.getByLabel('Periodo').selectOption('sempre');
  await expect(page.getByText('Il tuo BONWRAPPED')).toBeVisible();
  await page.getByRole('button', { name: 'Schermata successiva' }).click();
  await expect(page.getByText('partite giocate')).toBeVisible();
  await ctx.close();
});
