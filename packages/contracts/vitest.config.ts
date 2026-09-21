import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    forbidOnly: process.env.CI === 'true',
    environment: 'node',
    include: ['test/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
  },
});
