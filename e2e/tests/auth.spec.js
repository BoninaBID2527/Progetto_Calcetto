const { test, expect } = require('@playwright/test');
const api = require('../support/api');

test('registrazione, errori accanto ai campi, logout e nuovo accesso', async ({ page }) => {
  const email = `nuovo.${Date.now()}@calcetto.test`;
  await page.goto('/registrati');
  await page.getByLabel('Nome').fill('Nuovo Giocatore');
  await page.getByLabel('Email').fill('non-una-email');
  await page.getByLabel('Password').fill('corta');
  await page.getByRole('button', { name: /Crea account/ }).click();
  await expect(page.getByText('Inserisci un indirizzo email valido.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('calcetto2026');
  await page.getByRole('button', { name: /Crea account/ }).click();
  await expect(page.getByRole('heading', { name: 'I tuoi gruppi' })).toBeVisible();

  await page.goto('/profilo');
  await page.getByRole('button', { name: 'Esci da questo dispositivo' }).click();
  await expect(page.getByRole('heading', { name: /Chi c'è/ })).toBeVisible();

  await page.goto('/accedi');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('sbagliata1');
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page.getByRole('alert')).toContainText('Email o password non corretti');
  await page.getByLabel('Password').fill('calcetto2026');
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page.getByRole('heading', { name: 'I tuoi gruppi' })).toBeVisible();
});

test('ingresso nel gruppo con il link d\'invito', async ({ page, context }) => {
  const owner = await api.user('Organizzatore');
  const g = await api.group(owner, [], { name: 'Gruppo del link' });
  const guest = await api.user('Ospite');
  await api.loginAs(context, guest);
  await page.goto(`/entra/${g.inviteCode}`);
  await expect(page.getByRole('heading', { name: 'Gruppo del link' })).toBeVisible();
  await page.getByRole('button', { name: 'Entra nel gruppo' }).click();
  await expect(page.getByRole('heading', { name: 'Prossime partite' })).toBeVisible();
});
