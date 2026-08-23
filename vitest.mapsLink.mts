import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// The live Google Maps link suite. Talks to the real Google over HTTPS.
//
//   npm run test:maps-link
//
// With a real short link from your phone's Share button — the case that cannot
// be faked, because only Google can mint a maps.app.goo.gl URL:
//
//   MAPS_LINK_SHORT_URL="https://maps.app.goo.gl/…" npm run test:maps-link
//
// Kept out of `npm run verify` for the same reason the GoHub contract suite is:
// a gate that needs the open internet is a gate that fails on a locked-down CI
// box for reasons that have nothing to do with the commit.
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/contract/mapsLink.test.ts'],
    testTimeout: 30_000,
    env: { NODE_ENV: 'test' },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
});
