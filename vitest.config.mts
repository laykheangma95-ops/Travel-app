import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Contract tests need a GoHub server on the other end (the mock, or real
    // staging), so they are not part of the default gate. `npm run test:contract`.
    exclude: ['tests/contract/**'],
    // Every test starts from a known environment; individual tests opt in to
    // production behavior via vi.stubEnv.
    env: {
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});
