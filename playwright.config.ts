import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: 'pnpm start:demo',
      url: 'http://127.0.0.1:4312',
      reuseExistingServer: true,
      env: { DEMO_TARGET_PORT: '4312' }
    },
    {
      command: 'pnpm start:api',
      url: 'http://127.0.0.1:4310/health',
      reuseExistingServer: true,
      env: {
        NODE_ENV: 'development',
        ALLOW_DEMO_TARGET: 'true',
        DEMO_ORIGIN: 'http://127.0.0.1:4312'
      }
    },
    { command: 'pnpm dev:web', url: 'http://127.0.0.1:4173', reuseExistingServer: true }
  ],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } }
  ]
});
