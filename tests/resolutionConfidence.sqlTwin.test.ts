// ─────────────────────────────────────────────────────────────────────────────
// The TypeScript scorer and its SQL twin must agree, exactly.
//
// WHY THERE ARE TWO AT ALL: the DATABASE computes the confidence that gets
// stored (migration 017's create_place_resolution_proposal), because a caller
// who could state a confidence could fabricate the ledger — that is HIGH-2
// from the Phase 13 review. The application computes the same score first, to
// decide auto/ambiguous/none before it ever calls the RPC.
//
// If the two ever disagree, the failure is silent and exactly the one this
// remediation exists to kill: the screen renders one number and the row stores
// another, or the app offers a proposal the database then refuses as "not
// ambiguous". So they are pinned to each other here, against a real Postgres —
// the same treatment tests/places.normalize.test.ts gives normalizePlaceName
// and geohash_encode.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scoreResolution, type PinOrigin } from '@/lib/places/resolutionConfidence';
import { distanceMeters } from '@/lib/places/normalize';
import { createHarness, type Harness } from './support/pgHarness';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

afterAll(async () => {
  await harness.close();
});

const DISTANCES = [0, 0.5, 1, 10, 22.5, 45, 45.1, 46, 74.9, 75, 112.5, 149, 149.9, 150, 151, 400];
const ALT_COUNTS = [0, 1, 3];
const COUNTRY: (boolean | null)[] = [null, false, true];
const ORIGINS: PinOrigin[] = ['maps-link', 'geocoder', 'unknown'];

describe('place_resolution_score agrees with scoreResolution', () => {
  it('over the full matrix of distances, alternatives, country verdicts and pin origins', async () => {
    const disagreements: string[] = [];

    for (const distanceMeters of DISTANCES) {
      for (const alternativeCount of ALT_COUNTS) {
        for (const countryMismatch of COUNTRY) {
          for (const pinOrigin of ORIGINS) {
            const ts = scoreResolution({
              distanceMeters,
              alternativeCount,
              countryMismatch,
              pinOrigin,
              geocoderResultCount: null,
            });

            const rows = await harness.asAdmin(
              'SELECT public.place_resolution_score($1, $2, $3, $4) AS score',
              [distanceMeters, alternativeCount, countryMismatch, pinOrigin]
            );
            const sql = Number(rows[0].score);

            if (sql !== ts.confidence) {
              disagreements.push(
                `d=${distanceMeters} alt=${alternativeCount} country=${countryMismatch} pin=${pinOrigin}: ts=${ts.confidence} sql=${sql}`
              );
            }
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
  });

  it('the SQL threshold band matches AUTO_LINK_CONFIDENCE / AMBIGUOUS_FLOOR_CONFIDENCE', async () => {
    // The RPC refuses to record anything outside [0.5, 0.85); these are the
    // exact boundary values the application classifies the same way.
    for (const [distance, expected] of [
      [45, 'auto'],
      [46, 'ambiguous'],
      [149, 'ambiguous'],
      [150, 'none'],
    ] as const) {
      const ts = scoreResolution({
        distanceMeters: distance,
        alternativeCount: 0,
        countryMismatch: null,
        pinOrigin: 'maps-link',
        geocoderResultCount: null,
      });
      expect(ts.decision).toBe(expected);

      const rows = await harness.asAdmin(
        "SELECT public.place_resolution_score($1, 0, NULL, 'maps-link') AS score",
        [distance]
      );
      const sql = Number(rows[0].score);
      const sqlDecision = sql >= 0.85 ? 'auto' : sql >= 0.5 ? 'ambiguous' : 'none';
      expect(sqlDecision).toBe(expected);
    }
  });
});

describe('place_distance_meters agrees with distanceMeters', () => {
  it('over real coordinate pairs, to sub-millimetre agreement', async () => {
    const pairs: [number, number, number, number][] = [
      [13.7465, 100.4927, 13.7465, 100.4927],
      [13.7465, 100.4927, 13.74659, 100.4927],
      [13.7465, 100.4927, 13.7474, 100.4927],
      [13.7465, 100.4927, 13.7465, 100.4939],
      [35.6812, 139.7671, 35.6895, 139.6917],
      [-33.8688, 151.2093, -33.865, 151.2099],
    ];

    for (const [lat1, lng1, lat2, lng2] of pairs) {
      const ts = distanceMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
      const rows = await harness.asAdmin(
        'SELECT public.place_distance_meters($1, $2, $3, $4) AS m',
        [lat1, lng1, lat2, lng2]
      );
      expect(Number(rows[0].m)).toBeCloseTo(ts, 6);
    }
  });
});
