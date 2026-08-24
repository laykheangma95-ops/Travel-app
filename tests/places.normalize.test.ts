// ─────────────────────────────────────────────────────────────────────────────
// The dedupe primitives, and the one failure mode that would be silent.
//
// `normalizePlaceName` and `geohashEncode` exist twice: in TypeScript
// (lib/places/normalize.ts) and in SQL (migration 013, behind generated
// columns). The database's value is the one stored; the application's is the
// one used to look a place UP.
//
// If they ever disagree, nothing throws. A lookup computes one key, the row
// holds another, no match is found, and every single import quietly creates a
// duplicate — which is the exact thing the registry was built to prevent. So
// the last block here runs both implementations over the same inputs, in a real
// Postgres, and asserts they agree character for character.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  boundingBox,
  distanceMeters,
  geohashEncode,
  identityCell,
  normalizePlaceName,
  placeSlug,
  proximityConfidence,
  SAME_PLACE_RADIUS_M,
} from '@/lib/places/normalize';
import { createHarness, type Harness } from './support/pgHarness';

const WAT_PHO = { lat: 13.7465, lng: 100.4927 };

describe('normalizePlaceName', () => {
  it('folds the ways one name gets typed', () => {
    const forms = ['Wat Pho', 'wat pho', 'WAT-PHO', '  Wat  Pho!  ', 'Wat_Pho'];
    expect(new Set(forms.map(normalizePlaceName)).size).toBe(1);
  });

  it('does not fold two different names together', () => {
    expect(normalizePlaceName('Wat Pho')).not.toBe(normalizePlaceName('Wat Phra Kaew'));
  });

  it('flattens Latin accents', () => {
    expect(normalizePlaceName('Café Amazon')).toBe(normalizePlaceName('Cafe Amazon'));
    expect(normalizePlaceName('Đà Nẵng')).toContain('a');
  });

  it('keeps non-Latin scripts as usable keys', () => {
    // Stripping these would normalise every Chinese name to '', and the
    // identity index would then read a whole district as one place — which
    // matters rather a lot for a product built around a trip to China.
    expect(normalizePlaceName('外滩')).toBe('外滩');
    expect(normalizePlaceName('外滩 ')).toBe(normalizePlaceName('外滩'));
    expect(normalizePlaceName('ប្រាសាទអង្គរវត្ត')).not.toBe('');
    expect(normalizePlaceName('外滩')).not.toBe(normalizePlaceName('豫园'));
  });

  it('returns an empty key for a name with nothing comparable in it', () => {
    // The repository refuses to match on this rather than matching everything.
    expect(normalizePlaceName('!!!')).toBe('');
    expect(normalizePlaceName('')).toBe('');
  });
});

describe('geohashEncode', () => {
  it('produces the standard encoding', () => {
    // Fixed points with widely published geohashes.
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(geohashEncode(0, 0, 5)).toBe('s0000');
  });

  it('agrees on a cell for two points a few metres apart, and not for two far apart', () => {
    expect(identityCell(WAT_PHO.lat, WAT_PHO.lng)).toBe(
      identityCell(WAT_PHO.lat + 0.00002, WAT_PHO.lng + 0.00002)
    );
    expect(identityCell(WAT_PHO.lat, WAT_PHO.lng)).not.toBe(identityCell(13.7563, 100.5665));
  });
});

describe('distanceMeters', () => {
  it('measures a known distance', () => {
    // Wat Pho to Jodd Fairs Rama 9 is about 8km.
    const meters = distanceMeters(WAT_PHO, { lat: 13.7563, lng: 100.5665 });
    expect(meters).toBeGreaterThan(7_800);
    expect(meters).toBeLessThan(8_300);
  });

  it('is zero for a point and itself', () => {
    expect(distanceMeters(WAT_PHO, WAT_PHO)).toBe(0);
  });
});

describe('boundingBox', () => {
  it('contains every point inside the radius', () => {
    const box = boundingBox(WAT_PHO, SAME_PLACE_RADIUS_M);
    // A point 100m north is inside the box; one 5km east is not.
    const near = { lat: WAT_PHO.lat + 0.0009, lng: WAT_PHO.lng };
    const far = { lat: WAT_PHO.lat, lng: WAT_PHO.lng + 0.05 };

    expect(near.lat).toBeLessThanOrEqual(box.maxLat);
    expect(near.lat).toBeGreaterThanOrEqual(box.minLat);
    expect(far.lng).toBeGreaterThan(box.maxLng);
  });

  it('widens the longitude span away from the equator', () => {
    // A degree of longitude is narrower in Reykjavík than in Singapore, so the
    // box has to be wider in degrees to cover the same metres.
    const tropics = boundingBox({ lat: 1.35, lng: 103.8 }, 1_000);
    const north = boundingBox({ lat: 64.1, lng: -21.9 }, 1_000);
    expect(north.maxLng - north.minLng).toBeGreaterThan(tropics.maxLng - tropics.minLng);
  });
});

describe('proximityConfidence', () => {
  it('is highest when touching and zero past the radius', () => {
    expect(proximityConfidence(0)).toBe(1);
    expect(proximityConfidence(SAME_PLACE_RADIUS_M)).toBe(0);
    expect(proximityConfidence(SAME_PLACE_RADIUS_M + 1)).toBe(0);
    expect(proximityConfidence(75)).toBeGreaterThan(0.5);
    expect(proximityConfidence(75)).toBeLessThan(1);
  });
});

describe('placeSlug', () => {
  it('is readable, stable, and namespaced by country', () => {
    expect(placeSlug('Thailand', 'Wat Pho')).toBe('thailand:watpho');
    expect(placeSlug('Thailand', 'Wat Pho')).toBe(placeSlug('thailand', 'WAT  PHO'));
    expect(placeSlug('Thailand', 'Wat Pho', 'x7f2')).toBe('thailand:watpho-x7f2');
  });

  it('never produces an empty handle', () => {
    expect(placeSlug('', '!!!')).toBe('world:place');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the SQL twins agree with the TypeScript ones', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  const NAMES = [
    'Wat Pho',
    'wat pho',
    'WAT-PHO',
    '  Jodd  Fairs Rama 9 ',
    'Café Amazon',
    "Ollie's Bicycle Shop",
    '外滩',
    'ប្រាសាទអង្គរវត្ត',
    'Đà Nẵng',
    '7-Eleven',
  ];

  it('normalizes names identically', async () => {
    for (const name of NAMES) {
      const [row] = await harness.asAdmin('SELECT public.place_name_normalized($1) AS value', [name]);
      expect({ name, value: row.value }).toEqual({ name, value: normalizePlaceName(name) });
    }
  });

  const POINTS: [number, number][] = [
    [13.7465, 100.4927],
    [31.2397, 121.4909],
    [13.4125, 103.867],
    [57.64911, 10.40744],
    [0, 0],
    [-33.8688, 151.2093],
    [64.1466, -21.9426],
    [-54.8019, -68.302],
  ];

  it('encodes geohashes identically', async () => {
    for (const [lat, lng] of POINTS) {
      const [row] = await harness.asAdmin('SELECT public.geohash_encode($1, $2, 9) AS value', [
        lat,
        lng,
      ]);
      expect({ lat, lng, value: row.value }).toEqual({ lat, lng, value: geohashEncode(lat, lng, 9) });
    }
  });

  it('stores a geohash on insert that matches the one a lookup would compute', async () => {
    // The end-to-end version of the property: what the generated column holds
    // has to be what `identityCell` looks for, or nothing ever matches.
    await harness.asAdmin(
      `INSERT INTO places (slug, name, country_name, category, latitude, longitude)
       VALUES ('thailand:watpho', 'Wat Pho', 'Thailand', 'spot', 13.7465, 100.4927)`
    );
    const [row] = await harness.rows('places');
    expect(String(row.geohash).slice(0, 7)).toBe(identityCell(13.7465, 100.4927));
    expect(row.name_normalized).toBe(normalizePlaceName('Wat Pho'));
  });
});
