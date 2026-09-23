import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests: a real browser against the real app, API and Postgres.
 *
 * They start their own backend and frontend on separate ports (so a dev server you
 * already have running is left alone) and use their own database, rebuilt from
 * backend/core/sql/ before every run. See README "End-to-end tests".
 */
const API_PORT = 8100
const WEB_PORT = 3100
export const E2E_DATABASE = process.env.E2E_POSTGRES_NAME ?? 'codingworkshop_e2e'

export default defineConfig({
  testDir: './e2e',
  // One shared database, so run tests one at a time for predictable data.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // Uses the installed Google Chrome. Set E2E_BROWSER_CHANNEL=chromium after
    // `npx playwright install chromium` to use Playwright's own browser instead.
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `../.venv/bin/uvicorn function:app --port ${API_PORT}`,
      cwd: '../backend/core',
      env: { ...process.env, IS_LOCAL: 'true', POSTGRES_NAME: E2E_DATABASE },
      url: `http://localhost:${API_PORT}/api/core/health/db`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // --force bundles every dependency at startup. Otherwise a newly added import is
      // found mid-run, and Vite re-bundles and reloads the page under test. Its own
      // cache dir keeps that from disturbing a running `npm run dev`.
      command: `npx vite --port ${WEB_PORT} --strictPort --force`,
      env: {
        ...process.env,
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
        E2E_VITE_CACHE_DIR: 'node_modules/.vite-e2e',
      },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
