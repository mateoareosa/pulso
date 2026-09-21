import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    forbidOnly: process.env.CI === 'true',
    globals: true,
    environment: 'node',
    globalSetup: ['./test/setup-test-db-global.ts'],
    include: [
      'test/**/*.test.ts',
      'test/**/*.spec.ts',
      'integration/**/*.{test,spec}.ts',
      'src/**/*.{test,spec}.ts',
    ],
    fileParallelism: false, // Prevents concurrent database truncation/collisions in integration tests
    maxWorkers: 1,
    minWorkers: 1,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        maxForks: 1,
      },
    },
  },
});
