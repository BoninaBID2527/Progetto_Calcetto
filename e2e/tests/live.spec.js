// Due utenti contemporanei: ciò che fa uno compare dal vivo nel browser dell'altro.
const { test, expect } = require('@playwright/test');
const api = require('../support/api');

test.describe('Tempo reale con due utenti', () => {
  let marco;
  let luca;
  let paolo;
  let g;

  test.beforeAll(async () => {
    marco = await api.user('Marco Rossi', { preferredRole: 'centrocampista' });
    luca = await api.user('Luca Bianchi', { preferredRole: 'attaccante' });
    paolo = await api.user('Paolo Ghigo', { preferredRole: 'portiere' });
    g = await api.group(marco, [luca, paolo]);
  });

  async function twoBrowsers(browser) {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    await api.loginAs(ctxA, marco);
    await api.loginAs(ctxB, luca);
    return { a: await ctxA.newPage(), b: await ctxB.newPage(), close: () => Promise.all([ctxA.close(), ctxB.close()]) };
  }

  test('iscrizione dal vivo: Marco vede Luca entrare senza ricaricare', async ({ browser }) => {
    const m = await api.match(marco, g, { slots: 4 });
    const { a, b, close } = await twoBrowsers(browser);
    await a.goto(`/partite/${m.id}`);
    await b.goto(`/partite/${m.id}`);
    await expect(a.getByText('In diretta')).toBeVisible();
    await expect(a.getByLabel('0 presenti su 4 posti')).toBeVisible();

    await b.getByRole('button', { name: 'Ci sono', exact: true }).click();
    await expect(b.getByText('Ci sei! Posto preso.')).toBeVisible();
    await expect(a.getByLabel('1 presenti su 4 posti')).toBeVisible();
    await expect(a.locator('.people li', { hasText: 'Luca Bianchi' })).toBeVisible();
    await close();
  });

  test("lista d'attesa che scorre: Luca entra da solo quando Marco si ritira", async ({ browser }) => {
    const m = await api.match(marco, g, { slots: 2 });
    await api.respond(marco, m);
    await api.respond(paolo, m);
    const { a, b, close } = await twoBrowsers(browser);
    await a.goto(`/partite/${m.id}`);
    await b.goto(`/partite/${m.id}`);

    await b.getByRole('button', { name: 'Ci sono', exact: true }).click();
    await expect(b.getByText("sei in lista d'attesa", { exact: false }).first()).toBeVisible();
    await expect(b.getByText("In lista d'attesa · 1°")).toBeVisible();

    await a.getByRole('button', { name: 'Non ci sono' }).click();
    // Luca riceve la notifica e la sua scheda si aggiorna da sola.
    await expect(b.getByText(/Sei dentro/).first()).toBeVisible();
    await expect(b.locator('.chip', { hasText: 'Ci sei' })).toBeVisible();
    await expect(a.locator('.people li', { hasText: 'Luca Bianchi' }).first()).toBeVisible();
    await close();
  });

  test('chat: il messaggio arriva subito e la reazione si vede dall\'altra parte', async ({ browser }) => {
    const { a, b, close } = await twoBrowsers(browser);
    await a.goto(`/gruppi/${g.id}/chat`);
    await b.goto(`/gruppi/${g.id}/chat`);
    await expect(a.getByText('In diretta')).toBeVisible();
    await expect(b.getByText('In diretta')).toBeVisible();

    await a.getByLabel('Scrivi un messaggio').fill('Chi porta il pallone giovedì?');
    await a.getByRole('button', { name: 'Invia' }).click();
    const bubble = b.locator('.msg', { hasText: 'Chi porta il pallone giovedì?' });
    await expect(bubble).toBeVisible();

    await bubble.getByRole('button', { name: 'Aggiungi una reazione' }).click();
    await bubble.getByRole('button', { name: 'Reagisci con ⚽' }).click();
    await expect(a.locator('.msg', { hasText: 'Chi porta il pallone giovedì?' }).getByRole('button', { name: /⚽ 1/ })).toBeVisible();
    await close();
  });

  test('voto MVP e premio del terzo tempo con premiazione finale', async ({ browser }) => {
    // Partita a due giocatori: Marco contro Luca.
    const m = await api.played(marco, g, [marco, luca], { scoreA: 2, scoreB: 1 });
    const { a, b, close } = await twoBrowsers(browser);
    await a.goto(`/partite/${m.id}`);
    await b.goto(`/partite/${m.id}`);

    await a.getByRole('radio', { name: /Luca Bianchi/ }).click();
    await a.getByRole('button', { name: 'Vota MVP' }).click();
    await expect(a.getByText('Hai votato. Il tuo voto resta anonimo.')).toBeVisible();
    // Il contatore dei voti si aggiorna dal vivo anche da Luca.
    await expect(b.locator('#votazioni').getByText('1/2')).toBeVisible();

    await b.getByRole('radio', { name: /Marco Rossi/ }).click();
    await b.getByRole('button', { name: 'Vota MVP' }).click();
    // Hanno votato tutti: MVP condiviso, visibile a entrambi.
    await expect(a.getByText('MVP condiviso').first()).toBeVisible();
    await expect(b.getByText('MVP condiviso').first()).toBeVisible();

    await a.getByRole('radio', { name: /Pizza/ }).click();
    await expect(b.getByText('1/2 hanno scelto')).toBeVisible();
    await b.getByRole('radio', { name: /Pizza/ }).click();
    await expect(a.getByText('Premiazione')).toBeVisible();
    await expect(b.getByRole('heading', { name: /Pizza/ })).toBeVisible();
    await expect(a.getByText('Pagella della serata')).toBeVisible();
    await close();
  });
});
