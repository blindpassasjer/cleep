import { defineConfig } from 'vitest/config';

// Server integration tests run against a real Postgres (DATABASE_URL_TEST, or the local default
// from drizzle.config.ts). They share one database, so they must not run in parallel.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    fileParallelism: false,
    pool: 'forks',
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
