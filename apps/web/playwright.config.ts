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
        'node ../../scripts/prepare-test-db.js && pnpm --filter @pulso/api exec tsx src/main.ts',
      url: 'http://localhost:4100/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ||
          'postgresql://pulso:pulso_test_password@localhost:5433/pulso_test?schema=public',
        NODE_ENV: 'test',
        PORT: '4100',
      },
    },
    {
      command: 'pnpm build && pnpm preview --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        API_URL: 'http://localhost:4100',
      },
    },
  ],
});
