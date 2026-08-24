import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Contract tests need a GoHub server on the other end (the mock, or real
    // staging), so they are not part of the default gate. `npm run test:contract`.
    exclude: ['tests/contract/**'],
    // Four suites boot their own PGlite (Postgres compiled to WebAssembly) in
    // beforeAll and replay five migrations into it. That is well inside the
    // 10s default on an idle machine and intermittently outside it when the
    // suites run in parallel on a loaded one — which surfaced as three files
    // failing on "Hook timed out in 10000ms" and then passing on a re-run of
    // the identical tree. The work is genuinely slow rather than stuck, so the
    // budget is raised instead of the startup being papered over.
    hookTimeout: 30_000,
    // Every test starts from a known environment; individual tests opt in to
    // production behavior via vi.stubEnv.
    env: {
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // See tests/support/serverOnly.ts — Next.js resolves this specifier in
      // its bundler; Vitest needs to be told.
      'server-only': fileURLToPath(new URL('./tests/support/serverOnly.ts', import.meta.url)),
    },
  },
});
