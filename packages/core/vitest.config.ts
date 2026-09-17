import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.itest.ts'],
    testTimeout: 30_000,
  },
});
