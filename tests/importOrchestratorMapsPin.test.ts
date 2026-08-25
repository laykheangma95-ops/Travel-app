// ─────────────────────────────────────────────────────────────────────────────
// HIGH 1 from the Phase 4 review, as a regression test.
//
// WHAT WENT WRONG. `candidatesFromNames` hardcoded `source: 'model'`,
// `confidence: 0.5` and `lat/lng: null`, and `runConnector` never read the
// coordinates the boundary had just validated. A Google Maps link — the one
// input Domner has that carries an exact pin and no ambiguity at all — came
// out of the queue path as:
//
//   {"name":"Wat Pho","lat":null,"lng":null,"confidence":0.5,
//    "extraction_source":"model"}
//
// Three defects in one row: the pin discarded and left to the geocoder to
// re-guess; the confidence dropped below AUTO_SELECT_CONFIDENCE (0.55) so the
// place arrives UN-TICKED in the review list; and the provenance recorded as
// `'model'`, which migration 012 relies on meaning something exact — "'model'
// is the only one that costs".
//
// app/api/travel/extract has always got this right (confidence 0.95,
// source 'maps-link'), so this is also the two paths agreeing again.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImportFromUrl } from '@/lib/travel/importIntake';
import { processImport } from '@/lib/travel/importOrchestrator';
import {
  __registerConnectorForTest,
  __resetConnectorsForTest,
} from '@/lib/connectors/places/registry';
import type { PlaceConnector } from '@/lib/connectors/places/types';
import { AUTO_SELECT_CONFIDENCE } from '@/lib/travel/placeExtraction';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const MAPS = 'https://maps.app.goo.gl/abc123';
const TIKTOK = 'https://www.tiktok.com/@chef/video/7311122233344455566';

const WAT_PHO = { lat: 13.7465, lng: 100.4927 };

let harness: Harness;

/** Stands in for linkConnector's google-maps path: an exact pin and a name. */
const mapsConnector: PlaceConnector = {
  id: 'maps-test',
  platforms: ['google-maps'],
  isConfigured: () => true,
  async extract(job) {
    return {
      connectorId: 'maps-test',
      platform: 'google-maps',
      sourceUrl: job.url,
      externalId: null,
      title: 'Wat Pho',
      captionText: null,
      candidateNames: ['Wat Pho'],
      locationHint: { city: null, country: null },
      coordinates: WAT_PHO,
      media: { thumbnailUrl: null },
      confidence: 0.95,
      connectorMetadata: {},
      extractedAt: new Date().toISOString(),
    };
  },
};

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  __registerConnectorForTest(mapsConnector);
  // Geocoding off, so no test in this file depends on OpenStreetMap being
  // reachable. Without this, "never spreads one coordinate across many names"
  // passed locally (no network) and failed in CI (real network): the real
  // Nominatim instance actually resolves "Wat Pho" to a real-world coordinate
  // close enough to this file's own fixture to look identical, which
  // `addCoordinates` — the existing, correct, unrelated-to-this-fix geocoding
  // step — then fills in. That is desired behaviour for a candidate with no
  // pin; asserting `lat` stays `null` forever was the test's mistake, not the
  // orchestrator's.
  vi.stubEnv('NOMINATIM_BASE_URL', '');
});

afterEach(() => {
  __resetConnectorsForTest();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await harness.close();
});

async function runMapsImport(url = MAPS) {
  const alice = harness.clientFor(ALICE);
  const queued = await createImportFromUrl(alice, ALICE, url);
  if (!queued.ok) throw new Error(`setup: intake refused (${queued.code})`);
  const result = await processImport(alice, ALICE, queued.importId);
  return { result, candidates: await harness.rows('import_candidates') };
}

describe('HIGH 1 — a Google Maps link keeps what the connector resolved', () => {
  it('stores the exact pin instead of discarding it', async () => {
    const { candidates } = await runMapsImport();
    expect(candidates).toHaveLength(1);
    expect(Number(candidates[0].lat)).toBeCloseTo(WAT_PHO.lat, 4);
    expect(Number(candidates[0].lng)).toBeCloseTo(WAT_PHO.lng, 4);
  });

  it('keeps the confidence high enough to arrive pre-ticked', async () => {
    const { candidates } = await runMapsImport();
    expect(Number(candidates[0].confidence)).toBe(0.95);
    // The property that actually matters to a traveler: it is not un-ticked.
    expect(Number(candidates[0].confidence)).toBeGreaterThanOrEqual(AUTO_SELECT_CONFIDENCE);
  });

  it('records the provenance the cost ledger depends on', async () => {
    const { candidates } = await runMapsImport();
    // Not 'model'. No model was called, and migration 012 counts on that word.
    expect(candidates[0].extraction_source).toBe('maps-link');
  });

  it('does not mark the job as having used a model', async () => {
    await runMapsImport();
    const [row] = await harness.rows('place_imports');
    expect(row.used_model).toBe(false);
    expect(row.status).toBe('completed');
  });
});

describe('a connector that names several places gets no pin at all', () => {
  it('never spreads one coordinate across many names', async () => {
    __resetConnectorsForTest();
    __registerConnectorForTest({
      id: 'multi',
      platforms: ['tiktok'],
      isConfigured: () => true,
      async extract(job) {
        return {
          connectorId: 'multi',
          platform: 'tiktok',
          sourceUrl: job.url,
          externalId: null,
          title: null,
          captionText: null,
          candidateNames: ['Wat Pho', 'Chatuchak Market', 'Jay Fai'],
          locationHint: { city: null, country: null },
          // One pin, three names. Putting all three here would be worse than
          // putting none: three places pinned to the same wrong spot.
          coordinates: WAT_PHO,
          media: { thumbnailUrl: null },
          confidence: 0.6,
          connectorMetadata: {},
          extractedAt: new Date().toISOString(),
        };
      },
    });

    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup');
    await processImport(alice, ALICE, queued.importId);

    const candidates = await harness.rows('import_candidates');
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(candidate.lat).toBeNull();
      expect(candidate.lng).toBeNull();
      // A connector reading names off a post spends no model tokens, so it is
      // not 'model' either.
      expect(candidate.extraction_source).toBe('caption');
    }
  });
});
