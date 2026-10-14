import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end checks against the running dev stack (Vite on :3000, API behind :3001).
 * Start it first: ./bin/start-dev.sh (or uvicorn + proxy + vite). See e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  workers: 1, // flows build on each other (employee submits, then the manager reviews)
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
