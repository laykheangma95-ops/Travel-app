// ─────────────────────────────────────────────────────────────────────────────
// Phase 11 — proving /you/saved is actually reachable from the app, not just
// built. Phase 10's readiness inspection found the library had exactly one
// entry point in the whole codebase: the /place/[id] not-found branch. This
// suite is the regression for the three routes this phase adds.
//
// app/you/page.tsx's row data lives in lib/travel/youNav.ts (a plain .ts
// module, imported directly here) for the same reason
// lib/travel/importOutcome.ts exists: this repo's tsconfig sets
// `jsx: "preserve"` and Vitest has no JSX transform, so a .tsx file cannot be
// imported by a test at all — see that module's own header comment.
//
// components/travel/TripsView.tsx and app/you/saved/page.tsx have no such
// extracted data (a single inline Link each), so those two are proven by
// reading the actual shipped source text instead of guessing from a
// description of it — a real, if coarse, regression: if either Link is
// deleted or its href changed, this fails.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YOU_NAV_GROUPS } from '@/lib/travel/youNav';

describe('/you exposes /you/saved', () => {
  it('has a non-private-gated-away row linking to /you/saved with bilingual labels', () => {
    const row = YOU_NAV_GROUPS.flatMap((group) => group.rows).find(
      (candidate) => candidate.href === '/you/saved'
    );
    expect(row).toBeDefined();
    expect(row?.label.en).toBeTruthy();
    expect(row?.label.km).toBeTruthy();
    // Saving is a signed-in feature (saved_places is owner-scoped) — the row
    // is expected to be gated the same way /trips is, not a design accident.
    expect(row?.private).toBe(true);
  });
});

describe('/trips exposes /you/saved', () => {
  it('renders a Link to /you/saved in the trips workspace source', () => {
    const source = readFileSync('components/travel/TripsView.tsx', 'utf8');
    expect(source).toMatch(/href="\/you\/saved"/);
  });
});

describe('the empty saved library exposes /import/link', () => {
  it('renders a Link to /import/link when the library is empty', () => {
    const source = readFileSync('app/you/saved/page.tsx', 'utf8');
    expect(source).toMatch(/href="\/import\/link"/);
  });

  it('preserves the existing signed-out and error-state handling', () => {
    const source = readFileSync('app/you/saved/page.tsx', 'utf8');
    // SignInLink still gates the signed-out state; the load-error branch
    // still renders its own message. Neither should have been touched by an
    // empty-state-only change.
    expect(source).toMatch(/SignInLink/);
    expect(source).toMatch(/saved\.loadError/);
  });
});
