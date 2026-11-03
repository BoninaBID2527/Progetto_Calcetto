// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const DB_PORT = Number(process.env.E2E_DB_PORT || 27117);
const API_PORT = Number(process.env.E2E_API_PORT || 4100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5174);
const MONGODB_URI = process.env.E2E_MONGODB_URI || `mongodb://127.0.0.1:${DB_PORT}/bonmatch_e2e_test`;

if (!/test/i.test(MONGODB_URI)) throw new Error('E2E_MONGODB_URI deve puntare a un database di prova (nome con "test").');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node support/db.js',
      port: DB_PORT,
      reuseExistingServer: false,
    },
    {
      command: 'node ../backend/src/server.js',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        MONGODB_URI,
        JWT_SECRET: 'segreto-dei-test-e2e',
        CLIENT_ORIGIN: `http://localhost:${WEB_PORT}`,
        SCHEDULER_ENABLED: 'false',
        RATE_LIMIT_ENABLED: 'false', // i test accedono con molti utenti dallo stesso IP
      },
    },
    {
      command: `npm run dev --prefix ../frontend -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { VITE_BACKEND_URL: `http://localhost:${API_PORT}` },
    },
  ],
});

module.exports.API_URL = `http://localhost:${API_PORT}/api`;
