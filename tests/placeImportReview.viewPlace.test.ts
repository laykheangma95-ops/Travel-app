// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — the "View place" link on the import "saved" screen.
//
// viewPlaceHref is the one thing DoneStage (components/travel/
// PlaceImportReview.tsx) decides before rendering that link: pure, and lives
// in lib/travel/importOutcome.ts precisely so it is provable without a DOM —
// this repo's Vitest config has no JSX/TSX transform (see vitest.config.ts),
// so a decision function worth a regression test has to live in a plain .ts
// module, same as lib/travel/itinerary.ts's placeDetailHref.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { viewPlaceHref, type ImportOutcome } from '@/lib/travel/importOutcome';

function outcome(overrides: Partial<ImportOutcome> = {}): ImportOutcome {
  return {
    tripId: '10000000-0000-4000-8000-000000000001',
    tripTitle: 'Bangkok',
    createdTrip: false,
    added: ['Wat Pho'],
    skipped: [],
    failed: [],
    canonicalPlaceId: null,
    ...overrides,
  };
}

describe('viewPlaceHref', () => {
  it('links to the place when exactly one was added and it resolved', () => {
    const result = outcome({
      added: ['Wat Pho'],
      canonicalPlaceId: '20000000-0000-4000-8000-000000000002',
    });
    expect(viewPlaceHref(result)).toBe('/place/20000000-0000-4000-8000-000000000002');
  });

  it('is null when the one place added never resolved to a canonical place', () => {
    expect(viewPlaceHref(outcome({ added: ['Wat Pho'], canonicalPlaceId: null }))).toBeNull();
  });

  it('is null for a multi-place import, even when a canonical id came back', () => {
    expect(
      viewPlaceHref(
        outcome({ added: ['Wat Pho', 'Wat Arun'], canonicalPlaceId: '20000000-0000-4000-8000-000000000002' })
      )
    ).toBeNull();
  });

  it('is null when nothing was added', () => {
    expect(viewPlaceHref(outcome({ added: [], canonicalPlaceId: null }))).toBeNull();
  });
});
