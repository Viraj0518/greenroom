import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/helpers/stack.ts'],
    // One worker: all suites share one wrangler stack + one local D1.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
