// ─────────────────────────────────────────────────────────────────────────────
// The import ledger against a REAL Postgres, with the REAL policies.
//
// Two things are being proved here, and only one of them is ordinary:
//
//   1. Ordinary: one traveler cannot see, write or claim another's imports,
//      candidates or provenance. Same shape as tests/savedPlaces.rls.test.ts.
//
//   2. Not ordinary: THE QUOTA CANNOT BE CHEATED. The daily cap is a COUNT over
//      place_imports, and a traveler holds the anon key — they can call
//      PostgREST directly. So "our code never backdates a row" is not a
//      control. The migration closes three specific holes and each one is
//      tested by doing exactly what an attacker would do: insert a backdated
//      row, update created_at afterwards, and delete yesterday's rows.
//
// PGlite is Postgres itself, so these policies are enforced by the same engine
// Supabase runs.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertWithinQuota,
  completeImport,
  findReusableImport,
  loadImportProvenance,
  markCandidateAccepted,
  recordPlaceSource,
  startImport,
} from '@/lib/travel/importJobs';
import type { PlaceCandidate } from '@/lib/travel/placeExtraction';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const KEY = {
  normalizedUrl: 'tiktok.com/@chef/video/7311122233344455566',
  urlHash: 'a'.repeat(64),
};

const WAT_PHO: PlaceCandidate = {
  name: 'Wat Pho',
  description: 'Reclining Buddha, go before 9am.',
  category: 'spot',
  city: 'Bangkok',
  country: 'Thailand',
  lat: 13.7465,
  lng: 100.4927,
  confidence: 0.9,
  source: 'model',
};

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await harness.close();
});

describe('the import job round trip', () => {
  it('records an extraction and replays it without a second model call', async () => {
    const alice = harness.clientFor(ALICE);

    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    expect(importId).not.toBeNull();

    await completeImport(alice, importId, {
      outcome: 'ok',
      candidates: [WAT_PHO],
      usedModel: true,
    });

    const reusable = await findReusableImport(alice, ALICE, KEY.urlHash);
    expect(reusable).not.toBeNull();
    expect(reusable!.outcome).toBe('ok');
    expect(reusable!.candidates).toHaveLength(1);
    // The replay has to come back in the same shape the route returns, or the
    // review screen renders a different thing for a repeat import.
    expect(reusable!.candidates[0]).toMatchObject({
      name: 'Wat Pho',
      category: 'spot',
      country: 'Thailand',
      lat: 13.7465,
      confidence: 0.9,
      source: 'model',
    });
  });

  it('replays an extraction that found nothing, rather than paying to be told twice', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, importId, {
      outcome: 'no-places-found',
      candidates: [],
      usedModel: true,
    });

    const reusable = await findReusableImport(alice, ALICE, KEY.urlHash);
    expect(reusable?.outcome).toBe('no-places-found');
    expect(reusable?.candidates).toEqual([]);
  });

  it('does not replay one traveler\'s extraction to another', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, importId, { outcome: 'ok', candidates: [WAT_PHO], usedModel: true });

    // Bob pasted the same link. Reuse is deliberately own-user only in Phase 1:
    // reading Alice's row would mean going around RLS with the service role.
    const bob = harness.clientFor(BOB);
    expect(await findReusableImport(bob, BOB, KEY.urlHash)).toBeNull();
  });
});

describe('the quota cannot be cheated', () => {
  it('refuses a traveler over the daily cap', async () => {
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '2');
    const alice = harness.clientFor(ALICE);

    await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await startImport(alice, { userId: ALICE, key: null, platform: 'text' });

    await expect(assertWithinQuota(alice, ALICE)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('does not charge a traveler for replays', async () => {
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '2');
    const alice = harness.clientFor(ALICE);

    const first = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, first, { outcome: 'ok', candidates: [WAT_PHO], usedModel: true });

    // A replay row points at the import it reused, and rows like that are
    // excluded from the count — they cost nothing to serve.
    const replay = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, replay, {
      outcome: 'ok',
      candidates: [WAT_PHO],
      usedModel: false,
      reusedFromImportId: first,
    });

    await expect(assertWithinQuota(alice, ALICE)).resolves.toBeUndefined();
  });

  it('stamps created_at server-side, so a backdated insert does not fall outside the window', async () => {
    const alice = harness.clientFor(ALICE);
    const lastYear = '2020-01-01T00:00:00.000Z';

    // Exactly what a direct PostgREST call would send.
    const { error } = await alice
      .from('place_imports')
      .insert({ user_id: ALICE, url_hash: KEY.urlHash, platform: 'tiktok', created_at: lastYear });
    expect(error).toBeNull();

    const [row] = await harness.rows('place_imports');
    expect(String(row.created_at)).not.toContain('2020');
  });

  it('refuses to let created_at, user_id or url_hash be rewritten afterwards', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });

    await alice
      .from('place_imports')
      .update({ created_at: '2020-01-01T00:00:00.000Z', url_hash: 'b'.repeat(64), user_id: BOB })
      .eq('id', importId!);

    const [row] = await harness.rows('place_imports');
    expect(String(row.created_at)).not.toContain('2020');
    expect(row.url_hash).toBe(KEY.urlHash);
    expect(row.user_id).toBe(ALICE);
  });

  it('has no delete policy, so the evidence the quota counts cannot be removed', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });

    await alice.from('place_imports').delete().eq('id', importId!);

    expect(await harness.rows('place_imports')).toHaveLength(1);
  });
});

describe('one traveler cannot reach another\'s ledger', () => {
  it('hides imports, and refuses one stamped with someone else\'s id', async () => {
    const alice = harness.clientFor(ALICE);
    await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });

    const bob = harness.clientFor(BOB);
    const { data } = await bob.from('place_imports').select('id');
    expect(data ?? []).toHaveLength(0);

    // Claiming to be Alice fails the WITH CHECK, so startImport returns null
    // rather than writing a row into her history.
    expect(await startImport(bob, { userId: ALICE, key: KEY, platform: 'tiktok' })).toBeNull();
  });

  it('hides candidates belonging to another traveler\'s import', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, importId, { outcome: 'ok', candidates: [WAT_PHO], usedModel: true });

    const bob = harness.clientFor(BOB);
    const { data } = await bob.from('import_candidates').select('id,name');
    expect(data ?? []).toHaveLength(0);
  });

  it('reads provenance back only for the traveler who owns the import', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });

    expect(await loadImportProvenance(alice, importId!)).toEqual({
      platform: 'tiktok',
      key: KEY,
    });
    // Bob guessing an id gets nothing — which is what stops a caller dictating
    // where a place came from.
    expect(await loadImportProvenance(harness.clientFor(BOB), importId!)).toBeNull();
  });
});

describe('provenance', () => {
  it('records the post a place came from, once, and privately', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });

    const [place] = await harness.asAdmin(
      `INSERT INTO destination_places (destination, name, category, lat, lng, description, created_by)
       VALUES ('Thailand', 'Wat Pho', 'spot', 13.7465, 100.4927, '', $1) RETURNING id`,
      [ALICE]
    );
    const placeId = place.id as string;

    await recordPlaceSource(alice, {
      placeId,
      userId: ALICE,
      importId,
      platform: 'tiktok',
      key: KEY,
    });
    // The same post imported onto the same place twice is not an error and is
    // not a second row.
    await recordPlaceSource(alice, {
      placeId,
      userId: ALICE,
      importId,
      platform: 'tiktok',
      key: KEY,
    });

    expect(await harness.rows('place_sources')).toHaveLength(1);

    // Who saved what is the most sensitive thing this phase writes down.
    const { data } = await harness.clientFor(BOB).from('place_sources').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('marks the candidate a traveler actually kept', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, importId, {
      outcome: 'ok',
      candidates: [WAT_PHO, { ...WAT_PHO, name: 'Jodd Fairs' }],
      usedModel: true,
    });

    const [place] = await harness.asAdmin(
      `INSERT INTO destination_places (destination, name, category, lat, lng, description, created_by)
       VALUES ('Thailand', 'Wat Pho', 'spot', 13.7465, 100.4927, '', $1) RETURNING id`,
      [ALICE]
    );

    await markCandidateAccepted(alice, importId, 'Wat Pho', place.id as string);

    const rows = await harness.rows('import_candidates');
    const accepted = rows.filter((row) => row.accepted === true);
    // The difference between what was proposed and what was kept is the only
    // honest measure of whether the extraction is any good.
    expect(accepted).toHaveLength(1);
    expect(accepted[0].name).toBe('Wat Pho');
    expect(accepted[0].resolved_place_id).toBe(place.id);
  });
});

describe('the bill', () => {
  it('lets a traveler write their usage line but never read the table', async () => {
    const alice = harness.clientFor(ALICE);

    const { error } = await alice.from('ai_usage_log').insert({
      user_id: ALICE,
      feature: 'place_import',
      model: 'claude-sonnet-5',
      tokens_in: 900,
      tokens_out: 120,
      cost_estimate_micros: 4500,
    });
    expect(error).toBeNull();

    // Model names and cost estimates are our business, not the traveler's, so
    // there is no SELECT policy at all — RLS defaults to deny.
    const { data } = await alice.from('ai_usage_log').select('id');
    expect(data ?? []).toHaveLength(0);
    expect(await harness.rows('ai_usage_log')).toHaveLength(1);
  });
});
