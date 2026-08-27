// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 MEDIUM-5 remediation — the failure-classification test the
// review's mutation check found missing: nothing previously forced a REAL
// persistence failure through the real `importPlacesToTrip`, all the way to
// `ImportResult.failedPlaces`, and proved a swallowed classification breaks
// it.
//
// The failure forced here is genuine, against real Postgres — not a mocked
// Supabase error object. `addIdeaToTrip` (lib/travel/savedPlaces.ts) throws
// `destination_mismatch` for real when the destination_places row it is
// handed does not match the trip's OWN destination string. To reach that
// path deterministically (rather than hoping for a timing-dependent race),
// this test mutates the trip's destination via a separate admin connection
// at the one moment that matters — after `insertPlace` has already written
// the destination_places row under the ORIGINAL destination, and just before
// `addIdeaToTrip` reads the trip back. Everything downstream of that
// mutation — the query, the mismatch, the throw, the classification, the
// copy the traveler would see — is the real production code path, not a
// mock.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportablePlace } from '@/lib/travel/placeImport';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';

let harness: Harness;

vi.mock('@/lib/travel/savedPlaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/travel/savedPlaces')>();
  return { ...actual, addIdeaToTrip: vi.fn(actual.addIdeaToTrip) };
});

const savedPlaces = await import('@/lib/travel/savedPlaces');
const { importPlacesToTrip } = await import('@/lib/travel/placeImport');

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  vi.mocked(savedPlaces.addIdeaToTrip).mockClear();
});

afterAll(async () => {
  await harness.close();
});

describe('a real destination_mismatch persistence failure is classified, not swallowed', () => {
  it('failedPlaces[0].code and .message are populated from the real thrown reason', async () => {
    const alice = harness.clientFor(ALICE);
    const { data: trip } = await alice
      .from('trip_plans')
      .insert({ user_id: ALICE, title: 'Vietnam trip', destination: 'Vietnam' })
      .select('id')
      .single();
    const tripId = (trip as { id: string }).id;

    // Sabotage: the moment addIdeaToTrip is actually called (after
    // insertPlace has already written the destination_places row under
    // 'Vietnam'), swap the TRIP's own destination out from under it via a
    // separate admin connection — a genuine mismatch, produced by real data,
    // not a mocked error object.
    const actualAddIdeaToTrip = (
      await vi.importActual<typeof import('@/lib/travel/savedPlaces')>('@/lib/travel/savedPlaces')
    ).addIdeaToTrip;
    vi.mocked(savedPlaces.addIdeaToTrip).mockImplementationOnce(async (...args) => {
      await harness.asAdmin(`UPDATE trip_plans SET destination = 'Thailand' WHERE id = $1`, [tripId]);
      return actualAddIdeaToTrip(...args);
    });

    const candidate: ImportablePlace = {
      name: 'lẩu 2',
      description: '190 Đề Thám, phường Cầu Ông Lãnh, quận 1, TpHCM',
      category: 'food',
      lat: 10.7657,
      lng: 106.6933,
    };

    const result = await importPlacesToTrip(alice, ALICE, [candidate], { destination: 'Vietnam', tripId });

    // The public contract every existing caller already depends on.
    expect(result.added).toEqual([]);
    expect(result.failed).toEqual(['lẩu 2']);

    // The Phase 13.5 contract: WHY, not just that it failed.
    expect(result.failedPlaces).toHaveLength(1);
    expect(result.failedPlaces[0].name).toBe('lẩu 2');
    expect(result.failedPlaces[0].code).toBe('destination_mismatch');
    expect(result.failedPlaces[0].message).toContain('lẩu 2');
    expect(result.failedPlaces[0].message).not.toMatch(/23505|SQLSTATE|constraint|[0-9a-f]{8}-[0-9a-f]{4}/i);

    // What DoneStage (components/travel/PlaceImportReview.tsx) actually
    // renders is exactly this string, verbatim, inside one <li> per failed
    // place — no transformation happens between this contract and the DOM,
    // so proving the contract IS proving what reaches the screen.
    expect(result.failedPlaces[0].message).toBe(
      "This place isn't in the same destination as the trip. (lẩu 2)"
    );

    // The row itself was still written — a bookkeeping/filing failure never
    // silently drops the traveler's data; it is reported, and the row is
    // still there to recover from.
    const destRows = await harness.rows('destination_places');
    expect(destRows).toHaveLength(1);
    expect(destRows[0].name).toBe('lẩu 2');

    // But it was never filed onto the trip — the failure is real, not
    // merely logged and then quietly treated as a success.
    expect(await harness.rows('itinerary_places')).toHaveLength(0);
  });
});
