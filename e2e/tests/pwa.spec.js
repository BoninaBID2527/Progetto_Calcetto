// PWA: installabilità, service worker, pagina offline, niente API in cache, push solo su richiesta.
const { test, expect } = require('@playwright/test');
const api = require('../support/api');

test('manifest e icone sono serviti', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ short_name: 'BONMATCH', display: 'standalone', start_url: '/' });
  expect(manifest.icons.map((i) => i.purpose)).toEqual(expect.arrayContaining(['any', 'maskable']));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test('service worker attivo, pagina offline senza rete e API mai in cache', async ({ page, context }) => {
  const u = await api.user('Offline');
  await api.loginAs(context, u);
  // Conta le richieste di permesso: al caricamento non deve partirne nessuna.
  await context.addInitScript(() => {
    window.__permissionRequests = 0;
    if (window.Notification) {
      const original = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = (...args) => {
        window.__permissionRequests += 1;
        return original(...args);
      };
    }
  });
  await page.goto('/gruppi');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Ricarico perché il service worker controlli la pagina.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Il permesso delle notifiche non viene mai chiesto al caricamento.
  expect(await page.evaluate(() => window.__permissionRequests)).toBe(0);

  await context.setOffline(true);
  await page.goto('/notifiche').catch(() => {});
  await expect(page.getByRole('heading', { name: 'Sei fuori dal campo' })).toBeVisible();
  await context.setOffline(false);
  // Tornata la rete, la pagina offline si ricarica da sola e mostra la pagina richiesta.
  await expect(page.getByRole('heading', { name: 'Notifiche', level: 1 })).toBeVisible();

  const cachedApi = await page.evaluate(async () => {
    const urls = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) urls.push(new URL(req.url).pathname);
    }
    return urls.filter((p) => p.startsWith('/api') || p.startsWith('/socket.io'));
  });
  expect(cachedApi).toEqual([]);
});

test('le push si attivano solo con un clic; senza chiavi VAPID il motivo è spiegato', async ({ page, context }) => {
  const u = await api.user('Push');
  await api.loginAs(context, u);
  await context.grantPermissions(['notifications']);
  await page.goto('/profilo');
  await page.getByRole('button', { name: 'Attiva le notifiche push' }).click();
  await expect(page.getByRole('alert')).toContainText('non sono configurate sul server');
});
