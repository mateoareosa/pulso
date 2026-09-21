import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'on',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command:
        'node ../../scripts/prepare-test-db.js && node ../../node_modules/.pnpm/node_modules/tsx/dist/cli.mjs ../api/src/main.ts',
      url: 'http://localhost:4100/api/health',
      reuseExistingServer: true,
      timeout: 60000,
      env: {
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ||
          'postgresql://pulso:pulso_test_password@localhost:5433/pulso_test?schema=public',
        NODE_ENV: 'test',
        PORT: '4100',
        TSX_TSCONFIG_PATH: '../api/tsconfig.json',
      },
    },
    {
      command:
        'node ../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit && node ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.2_a1dcf09cab93b77044d030c2ef0f7a7b/node_modules/vite/bin/vite.js build && node ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.2_a1dcf09cab93b77044d030c2ef0f7a7b/node_modules/vite/bin/vite.js preview --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 60000,
      env: {
        API_URL: 'http://localhost:4100',
      },
    },
  ],
});
