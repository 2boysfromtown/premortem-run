import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@premortem/core': fileURLToPath(new URL('./packages/core/src', import.meta.url)),
      '@premortem/ai': fileURLToPath(new URL('./packages/ai/src', import.meta.url)),
      '@premortem/database': fileURLToPath(new URL('./packages/database/src', import.meta.url)),
      '@premortem/browser-agent': fileURLToPath(
        new URL('./packages/browser-agent/src', import.meta.url)
      )
    }
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'packages/core/src/url-safety.ts',
        'packages/core/src/success-evaluation.ts',
        'packages/core/src/launch-readiness.ts',
        'packages/core/src/findings.ts',
        'packages/core/src/ai-provider.ts',
        'packages/core/src/job-state.ts'
      ],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 }
    }
  }
});
