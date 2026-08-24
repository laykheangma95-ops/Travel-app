// ─────────────────────────────────────────────────────────────────────────────
// What happens when the database is one migration behind the code.
//
// THE PRODUCTION FAILURE THIS REPRODUCES:
//   Creating a trip answered "That trip could not be found." on a deployment
//   that already had the ensureTripId fix. The trip form filled in, the row
//   presumably written, and every read of it came back empty.
//
//   loadTravelerContext selects `is_wishlist` from trip_plans. That column
//   arrives in migration 011. On a database where 011 has not been applied,
//   PostgREST answers the WHOLE query with error 42703 (undefined column) —
//   it does not return the other columns with is_wishlist null. The route then
//   does exactly what it was told to do for a partly-migrated project:
//
//       if (result.error) log.warn('travel.context_query_failed', ...)
//       const tripRows = (tripsResult.data ?? []) as TripRow[];
//
//   ...logs, swallows, and carries on with ZERO trips. Every trip the traveler
//   owns is then "not found", including the one just created.
//
//   The intent — degrade rather than break — was right and is written down in
//   that file. It just covered a missing TABLE, not a missing COLUMN, and one
//   optional column took the whole feature down with it.
//
// WHY ensureTripId DID NOT SAVE IT:
//   The targeted re-fetch added for the 20-trip cap selects the same column
//   list, so it fails for the same reason. Two queries, one missing column,
//   both empty.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';

const session = vi.hoisted(() => ({ client: null as unknown, userId: '' }));
const alice = () => ({ id: session.userId, email: 'alice@example.com', user_metadata: {} });

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => alice(),
  getUser: async () => alice(),
  supabaseFromRequest: () => session.client,
}));

const { POST, GET } = await import('@/app/api/travel/trips/route');

let harness: Harness;

function createTrip() {
  return POST(
    new Request('https://domner.test/api/travel/trips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.12' },
      body: JSON.stringify({
        title: 'Kuala Lumpur trip',
        destination: 'Malaysia',
        startDate: '2026-08-25',
        endDate: '2026-08-27',
        travelers: 1,
        interests: [],
      }),
    })
  );
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  await harness.reset();
  // TRUNCATE does not undo a dropped column, so the schema is put back between
  // cases — otherwise the first test to drop it would decide the outcome of
  // every test after it.
  await harness.asAdmin(
    'ALTER TABLE trip_plans ADD COLUMN IF NOT EXISTS is_wishlist BOOLEAN NOT NULL DEFAULT false'
  );
  await harness.createUser(ALICE);
  session.userId = ALICE;
  session.client = harness.clientFor(ALICE);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(async () => {
  await harness.close();
});

describe('a database one migration behind the code', () => {
  /** Puts trip_plans back the way it looked before migration 011. */
  async function unapplyMigration011() {
    await harness.asAdmin('ALTER TABLE trip_plans DROP COLUMN IF EXISTS is_wishlist');
  }

  it('still creates AND returns the trip when is_wishlist does not exist', async () => {
    await unapplyMigration011();

    const response = await createTrip();
    const body = await response.json();

    expect(
      response.status,
      `expected 201, got ${response.status}: ${JSON.stringify(body?.error ?? body)}`
    ).toBe(201);
    expect(body.trip.title).toBe('Kuala Lumpur trip');

    // And the row really is there — the traveler was not told about a trip
    // that does not exist.
    const rows = await harness.rows('trip_plans');
    expect(rows).toHaveLength(1);
  });

  it('still lists trips when is_wishlist does not exist', async () => {
    await unapplyMigration011();
    await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'Existing trip','Thailand')`,
      [ALICE]
    );

    const response = await GET(
      new Request('https://domner.test/api/travel/trips', {
        headers: { 'x-forwarded-for': '203.0.113.12' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // Without the fallback this is 0 — every trip silently vanishes and /trips
    // reads as "No trips yet", which looks exactly like data loss.
    expect(body.trips).toHaveLength(1);
    expect(body.trips[0].title).toBe('Existing trip');
  });

  it('treats a trip as non-wishlist when the column is missing', async () => {
    // The grouping degrades — "Saved for later" is simply empty — rather than
    // taking the whole list down with it.
    await unapplyMigration011();
    await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination) VALUES ($1,'No column trip','Thailand')`,
      [ALICE]
    );

    const response = await GET(
      new Request('https://domner.test/api/travel/trips', {
        headers: { 'x-forwarded-for': '203.0.113.12' },
      })
    );
    const body = await response.json();
    expect(body.trips[0].isWishlist).toBe(false);
  });

  it('still uses the column normally when the migration IS applied', async () => {
    // The fallback must not cost anything on a correctly migrated database.
    await harness.asAdmin(
      `INSERT INTO trip_plans (user_id,title,destination,is_wishlist) VALUES ($1,'Wish','Thailand',true)`,
      [ALICE]
    );

    const response = await GET(
      new Request('https://domner.test/api/travel/trips', {
        headers: { 'x-forwarded-for': '203.0.113.12' },
      })
    );
    const body = await response.json();
    expect(body.trips).toHaveLength(1);
    expect(body.trips[0].isWishlist).toBe(true);
  });
});
