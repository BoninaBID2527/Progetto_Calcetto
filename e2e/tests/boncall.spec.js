// BONCALL con due utenti contemporanei: convocazione, notifica dal vivo, risposta, completamento, partita.
const { test, expect } = require('@playwright/test');
const api = require('../support/api');

test('convocazione da interfaccia fino alla partita confermata', async ({ browser }) => {
  const marco = await api.user('Marco Rossi');
  const luca = await api.user('Luca Bianchi');
  const g = await api.group(marco, [luca]);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await api.loginAs(ctxA, marco);
  await api.loginAs(ctxB, luca);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await b.goto(`/gruppi/${g.id}`);
  await expect(b.getByText('In diretta').first()).toBeVisible();

  await a.goto(`/gruppi/${g.id}/boncall/nuova`);
  await a.getByLabel('Giocatori necessari').fill('2');
  await a.getByRole('button', { name: 'Apri la convocazione' }).click();
  await expect(a.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(a.getByText('Mancano 1').first()).toBeVisible();

  // Luca riceve la notifica in-app senza ricaricare e la convocazione compare in home.
  await expect(b.locator('.toast', { hasText: 'Si cerca gente' })).toBeVisible();
  await expect(b.getByRole('link', { name: /Notifiche, 1 non lette/ }).first()).toBeVisible();
  await b.locator('.poll-card').first().click();
  await b.getByRole('button', { name: 'Ci sono', exact: true }).click();
  await expect(b.getByText('Ci sei! Risposta registrata.')).toBeVisible();

  // Marco vede la convocazione completarsi dal vivo e la trasforma in partita.
  await expect(a.getByText('Ci sono tutti').first()).toBeVisible();
  await a.getByRole('button', { name: 'Trasforma in partita' }).click();
  await expect(a).toHaveURL(/\/partite\//);
  await expect(a.getByLabel('2 presenti su 2 posti')).toBeVisible();
  await expect(b.locator('.toast', { hasText: 'Si gioca' })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
