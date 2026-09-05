import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./test/setup-test-db-global.ts'],
    fileParallelism: false, // Prevents concurrent database truncation/collisions in integration tests
  },
});
