// End-to-end tests against the real production build (`pnpm build` first).
// Boots `node server.js` on a throwaway database so every run starts at first-run setup.

import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 4399);
const dataDir = process.env.E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'cb-e2e-'));

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    storageState: 'e2e/.auth/state.json',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      COMPANYBRAIN_PORT: String(PORT),
      COMPANYBRAIN_HOST: '127.0.0.1',
      COMPANYBRAIN_DB_PATH: join(dataDir, 'companybrain.sqlite'),
      COMPANYBRAIN_LOG_LEVEL: 'warn',
      NODE_ENV: 'production',
    },
  },
});
