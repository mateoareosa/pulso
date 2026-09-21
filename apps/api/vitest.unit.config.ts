import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    forbidOnly: process.env.CI === 'true',
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.{test,spec}.ts'],
    exclude: ['test/**/*.integration.test.ts', 'integration/**'],
    fileParallelism: false,
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
