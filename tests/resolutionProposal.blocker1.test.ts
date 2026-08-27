// ─────────────────────────────────────────────────────────────────────────────
// BLOCKER-1 regression — Phase 13 Principal Engineer review.
//
// THE DEFECT THIS PINS:
//   The confirmation route used to re-derive the proposal at decision time.
//   Re-derivation reads only the traveler's `destination_places` row, which
//   does not record how its pin was obtained — so it scored with
//   pinOrigin='unknown' where the import had scored with 'geocoder'. The x0.8
//   geocoder penalty vanished, confidence rose by 1.25x, and every
//   geocoder-pinned match within 45m re-derived as `auto`. The server answered
//   "no-proposal" to a card the traveler was looking at: the tap did nothing,
//   canonical_place_id stayed NULL, no feedback row was written, and the
//   screen said "Kept as your own place" — the opposite of what they chose.
//
// WHY THE ORIGINAL SUITE MISSED IT:
//   No test ever sent a pinSource through the confirm path. The ambiguity
//   suite used the two-branch fixture (whose x0.7 penalty keeps BOTH sides
//   ambiguous, so the divergence cancels) and the route suite built
//   destination_places rows directly, leaving pinOrigin 'unknown' on both
//   sides. This file deliberately uses the shape neither covered: ONE
//   canonical match, geocoder-pinned, well inside 45m.
//
// Real Postgres, real policies, real route handler.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';

const session = vi.hoisted(() => ({ client: null as unknown, userId: '', signedIn: true }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => {
    if (!session.signedIn) {
      const { ApiError } = await import('@/lib/http');
      throw new ApiError('UNAUTHORIZED', 'Sign in.');
    }
    return { id: session.userId };
  },
  supabaseFromRequest: () => session.client,
}));

const { POST } = await import('@/app/api/travel/destination-places/[id]/resolution/route');

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  await harness.reset();
  await harness.createUser(ALICE);
  session.signedIn = true;
  session.userId = ALICE;
  session.client = harness.clientFor(ALICE);
});

afterAll(async () => {
  await harness.close();
});

function decide(destinationPlaceId: string, body: unknown) {
  return POST(
    new Request(`https://domner.test/api/travel/destination-places/${destinationPlaceId}/resolution`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.77' },
      body: JSON.stringify(body),
    }),
    { params: { id: destinationPlaceId } }
  );
}

/** ONE published canonical place. A single match — no second candidate to
 *  carry the x0.7 penalty — which is what puts this squarely in the band the
 *  old re-derivation broke. */
async function seedSingleMatch(): Promise<string> {
  const { data } = await harness.serviceClient()
    .from('places')
    .insert({
      slug: 'blue-cafe',
      name: 'Blue Cafe',
      country_name: 'Thailand',
      latitude: 13.7465,
      longitude: 100.4927,
      verification_status: 'domner_public',
    })
    .select('id')
    .single();
  return (data as { id: string }).id;
}

/** The real import path, with a caption-derived (therefore geocoder-pinned)
 *  candidate ~10m from the canonical place. */
async function importGeocoderPinned() {
  const { importPlacesToTrip } = await import('@/lib/travel/placeImport');
  return importPlacesToTrip(
    harness.clientFor(ALICE),
    ALICE,
    [
      {
        name: 'Blue Cafe',
        description: '',
        category: 'food',
        lat: 13.74659,
        lng: 100.4927,
        pinSource: 'caption',
        geocodeResultCount: 3,
      },
    ],
    { destination: 'Thailand' }
  );
}

describe('a geocoder-pinned single match inside 45m', () => {
  it('is shown as ambiguous, and CONFIRMING IT ACTUALLY CONFIRMS IT', async () => {
    const placeId = await seedSingleMatch();
    const result = await importGeocoderPinned();
    const added = result.addedPlaces[0];

    // 1–3. The traveler is shown a proposal, and nothing is linked yet.
    expect(added.resolution?.decision).toBe('ambiguous');
    expect(added.canonicalPlaceId).toBeNull();
    expect(added.resolution?.proposed.id).toBe(placeId);

    // 4. The evidence persisted at proposal time — captured BEFORE the
    //    decision, so the assertions below compare against what was actually
    //    shown rather than against whatever a later pass would recompute.
    const pending = (await harness.rows('place_resolution_feedback'))[0];
    expect(pending.decision).toBe('pending');
    const shownConfidence = added.resolution!.confidence;
    expect(Number(pending.resolution_confidence)).toBe(shownConfidence);

    // 5. Confirm through the real route.
    const response = await decide(added.destinationPlaceId, { decision: 'confirmed' });
    const body = await response.json();

    // 6. The assertions the review demanded.
    expect(response.status).toBe(200);
    expect(body.outcome).toBe('applied');
    expect(body.outcome).not.toBe('no-proposal');
    expect(body.canonicalPlaceId).toBe(placeId);

    const dest = (await harness.rows('destination_places'))[0];
    expect(dest.canonical_place_id).toBe(placeId);
    expect(dest.name).toBe('Blue Cafe'); // the trip place itself is untouched

    const feedback = await harness.rows('place_resolution_feedback');
    expect(feedback).toHaveLength(1);
    expect(feedback[0].decision).toBe('confirmed');
    expect(feedback[0].proposed_place_id).toBe(placeId);

    // Stored confidence EXACTLY matches proposal time — the decision did not
    // recompute it, and the guard refused to let the UPDATE change it.
    expect(Number(feedback[0].resolution_confidence)).toBe(shownConfidence);
    expect(feedback[0].resolver_version).toBe('resolution-v1');
    expect(added.resolution!.resolverVersion).toBe('resolution-v1');

    // The geocoder evidence survives the decision intact.
    const signals = feedback[0].reason_signals as Record<string, unknown>;
    expect(signals.pinOrigin).toBe('geocoder');
    expect(signals.geocoderResultCount).toBe(3);
    expect(signals.alternativeCount).toBe(0);
  });

  it('the same proposal can be rejected, leaving the trip place unlinked but intact', async () => {
    await seedSingleMatch();
    const added = (await importGeocoderPinned()).addedPlaces[0];
    expect(added.resolution?.decision).toBe('ambiguous');

    const body = await (await decide(added.destinationPlaceId, { decision: 'rejected' })).json();
    expect(body.outcome).toBe('applied');
    expect(body.canonicalPlaceId).toBeNull();

    const dest = (await harness.rows('destination_places'))[0];
    expect(dest.canonical_place_id).toBeNull();
    expect(dest.name).toBe('Blue Cafe');
    expect((await harness.rows('place_resolution_feedback'))[0].decision).toBe('rejected');
  });
});

describe('the band around the old break point', () => {
  // The old re-derivation broke everything from 0m to 45m. Both ends are
  // covered so a future change to either threshold cannot quietly reopen it.
  for (const [label, lat] of [
    ['~1m away', 13.746509],
    ['~10m away', 13.74659],
    ['~40m away', 13.74686],
  ] as const) {
    it(`${label}: proposal is recorded and confirmable`, async () => {
      const placeId = await seedSingleMatch();
      const { importPlacesToTrip } = await import('@/lib/travel/placeImport');
      const result = await importPlacesToTrip(
        harness.clientFor(ALICE),
        ALICE,
        [
          {
            name: 'Blue Cafe',
            description: '',
            category: 'food',
            lat,
            lng: 100.4927,
            pinSource: 'model',
            geocodeResultCount: 1,
          },
        ],
        { destination: 'Thailand' }
      );
      const added = result.addedPlaces[0];
      expect(added.resolution?.decision).toBe('ambiguous');

      const body = await (await decide(added.destinationPlaceId, { decision: 'confirmed' })).json();
      expect(body.outcome).toBe('applied');
      expect(body.canonicalPlaceId).toBe(placeId);
    });
  }
});

describe('an exact platform pin is not dragged into the ambiguous band', () => {
  it('a maps-link pin at the same distance auto-links, with no proposal recorded', async () => {
    const placeId = await seedSingleMatch();
    const { importPlacesToTrip } = await import('@/lib/travel/placeImport');
    const result = await importPlacesToTrip(
      harness.clientFor(ALICE),
      ALICE,
      [
        {
          name: 'Blue Cafe',
          description: '',
          category: 'food',
          lat: 13.74659,
          lng: 100.4927,
          pinSource: 'maps-link',
          geocodeResultCount: null,
        },
      ],
      { destination: 'Thailand' }
    );

    const added = result.addedPlaces[0];
    expect(added.resolution).toBeUndefined();
    expect(added.canonicalPlaceId).toBe(placeId);
    // Nothing was asked, so nothing is on the record as having been asked.
    expect(await harness.rows('place_resolution_feedback')).toHaveLength(0);
  });
});
