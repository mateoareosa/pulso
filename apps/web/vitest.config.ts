import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    forbidOnly: process.env.CI === 'true',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
