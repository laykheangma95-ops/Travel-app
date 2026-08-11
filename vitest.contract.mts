import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Contract tests. These talk to a real GoHub server over HTTP.
//
//   npm run mock            # terminal 1
//   npm run test:contract   # terminal 2
//
// Against staging, point the same suite at the real API — no test changes:
//
//   GOHUB_BASE_URL=https://staging.gohub.example/api \
//   GOHUB_PARTNER_ID=... GOHUB_API_KEY=... npm run test:contract
//
// Tests that need to set up supplier-side state (drop the balance, redirect
// webhooks) use the mock's /dev routes and skip themselves when those routes
// are absent, which is how they stay unchanged against staging.
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/contract/**/*.test.ts'],
    // Order creation, confirmation and fulfilment are stateful on the supplier
    // side; running files in parallel makes balance assertions flaky.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
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
