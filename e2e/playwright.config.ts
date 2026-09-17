import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../.env.local'));
} catch {
  // CI can provide env vars directly.
}

/**
 * Expects the local stack to be running:  pnpm local:up && pnpm db:setup && pnpm seed && pnpm dev
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
