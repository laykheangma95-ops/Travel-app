// ─────────────────────────────────────────────────────────────────────────────
// The import ledger against a REAL Postgres, with the REAL policies.
//
// Two things are being proved here, and only one of them is ordinary:
//
//   1. Ordinary: one traveler cannot see, write or claim another's imports,
//      candidates or provenance. Same shape as tests/savedPlaces.rls.test.ts.
//
//   2. Not ordinary: THE FOUR WAYS OF DEFEATING THE QUOTA ARE CLOSED. The daily
//      cap is a COUNT over place_imports, and a traveler holds the anon key —
//      they can call PostgREST directly, so "our code never backdates a row" is
//      not a control. Each attack below is tested by performing it: insert a
//      backdated row, rewrite created_at afterwards, delete yesterday's rows,
//      and mark real imports as replays (which the count excludes).
//
//      The fourth shipped and was found in review, after this file claimed the
//      quota could not be cheated. Three closed holes and one open one is an
//      open cap. The list here is what is tested, not a promise that no fifth
//      way exists.
//
// PGlite is Postgres itself, so these policies are enforced by the same engine
// Supabase runs.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertWithinQuota,
  completeImport,
  completeImportIfProcessing,
  failImport,
  findReusableImport,
  loadImportForReview,
  loadImportProvenance,
  markCandidateAccepted,
  recordPlaceSource,
  startImport,
} from '@/lib/travel/importJobs';
import { recordAiUsage } from '@/lib/travel/aiUsage';
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

  it('refuses to let a traveler mark a fresh import as a replay of another link', async () => {
    // THE ATTACK THAT SHIPPED AND WAS FOUND IN REVIEW.
    //
    // The quota excludes replays, because a replay costs nothing to serve.
    // Nothing stopped a traveler from UPDATEing `reused_from_import_id` on
    // every row to point at some other import of theirs — at which point the
    // count is zero and the daily cap is gone entirely. Three attacks were
    // closed and tested, this fourth was open, and the migration claimed the
    // quota could not be cheated.
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '2');
    const alice = harness.clientFor(ALICE);

    const first = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, first, { outcome: 'ok', candidates: [WAT_PHO], usedModel: true });

    // A DIFFERENT link — a different hash, so a real second extraction.
    const other = { normalizedUrl: 'tiktok.com/@chef/video/999', urlHash: 'c'.repeat(64) };
    const second = await startImport(alice, { userId: ALICE, key: other, platform: 'tiktok' });

    await expect(assertWithinQuota(alice, ALICE)).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    // Exactly what a direct PostgREST call would send.
    const { error } = await alice
      .from('place_imports')
      .update({ reused_from_import_id: first })
      .eq('id', second!);

    expect(error).not.toBeNull();
    expect(String(error?.message)).toContain('same link');

    const rows = await harness.rows('place_imports');
    expect(rows.find((row) => row.id === second)!.reused_from_import_id).toBeNull();
    // And the cap still holds, which is the point of all of it.
    await expect(assertWithinQuota(alice, ALICE)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('refuses a replay claim on an import that never had a link', async () => {
    const alice = harness.clientFor(ALICE);
    const source = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, source, { outcome: 'ok', candidates: [], usedModel: true });

    // A caption paste has no stable identity, so it can never be a replay of
    // anything — the cheapest form of the same attack.
    const pasted = await startImport(alice, { userId: ALICE, key: null, platform: 'text' });
    const { error } = await alice
      .from('place_imports')
      .update({ reused_from_import_id: source })
      .eq('id', pasted!);

    expect(String(error?.message)).toContain('cannot be a replay');
  });

  it('refuses a replay that names another traveler\'s import', async () => {
    const alice = harness.clientFor(ALICE);
    const bob = harness.clientFor(BOB);

    const aliceImport = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, aliceImport, { outcome: 'ok', candidates: [], usedModel: true });

    const bobImport = await startImport(bob, { userId: BOB, key: KEY, platform: 'tiktok' });
    const { error } = await bob
      .from('place_imports')
      .update({ reused_from_import_id: aliceImport })
      .eq('id', bobImport!);

    // Same link, different traveler: Alice paid for that extraction, not Bob.
    expect(String(error?.message)).toContain('same link');
  });

  it('refuses a replay of an import that never completed', async () => {
    const alice = harness.clientFor(ALICE);
    const unfinished = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });

    // The source has to be OUT of the open set before a second row for the same
    // link can exist at all — migration 015 added a partial unique index
    // allowing one open job per link per traveler. Failing it is the honest way
    // to get there: a failed extraction cached nothing, so there is nothing to
    // have replayed, which is exactly what this test is about.
    await failImport(alice, unfinished);

    const second = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    expect(second).not.toBeNull();

    const { error } = await alice
      .from('place_imports')
      .update({ reused_from_import_id: unfinished })
      .eq('id', second!);

    expect(String(error?.message)).toContain('same link');
  });

  it('still allows the genuine replay the exclusion exists for', async () => {
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '2');
    const alice = harness.clientFor(ALICE);

    const first = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, first, { outcome: 'ok', candidates: [WAT_PHO], usedModel: true });

    const replay = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, replay, {
      outcome: 'ok',
      candidates: [WAT_PHO],
      usedModel: false,
      reusedFromImportId: first,
    });

    const rows = await harness.rows('place_imports');
    expect(rows.find((row) => row.id === replay)!.reused_from_import_id).toBe(first);
    await expect(assertWithinQuota(alice, ALICE)).resolves.toBeUndefined();
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

describe('loadImportForReview — the queued-job review screen\'s only read', () => {
  it('returns candidates and preview once a job has completed', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, importId, {
      outcome: 'ok',
      candidates: [WAT_PHO],
      usedModel: true,
      preview: { title: 'Bangkok in a day', author: '@chef', thumbnailUrl: null, canonicalUrl: null },
    });

    const snapshot = await loadImportForReview(alice, ALICE, importId!);
    expect(snapshot?.status).toBe('completed');
    expect(snapshot?.outcome).toBe('ok');
    expect(snapshot?.candidates).toHaveLength(1);
    expect(snapshot?.candidates[0]).toMatchObject({ name: 'Wat Pho', country: 'Thailand' });
    expect(snapshot?.preview).toMatchObject({ title: 'Bangkok in a day', author: '@chef' });
    // completeImport was told usedModel: true above — the review screen's
    // "basic mode" hint depends on this surviving the round trip.
    expect(snapshot?.usedModel).toBe(true);
  });

  it('reports usedModel: false for a job the deterministic extractor answered', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, importId, { outcome: 'ok', candidates: [WAT_PHO], usedModel: false });

    const snapshot = await loadImportForReview(alice, ALICE, importId!);
    expect(snapshot?.usedModel).toBe(false);
  });

  it('reads a job the connector layer completed via completeImportIfProcessing the same way', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    // The queue path claims 'processing' before it may complete (migration
    // 016's terminal-status guard requires it); startImport above already
    // wrote 'processing', so this is the claimed state the orchestrator would
    // have produced.
    const won = await completeImportIfProcessing(alice, importId!, {
      outcome: 'ok',
      candidates: [WAT_PHO],
      usedModel: false,
    });
    expect(won).toBe(true);

    const snapshot = await loadImportForReview(alice, ALICE, importId!);
    expect(snapshot?.status).toBe('completed');
    expect(snapshot?.candidates).toHaveLength(1);
  });

  it('returns the status with no candidate query for a job still in flight', async () => {
    const alice = harness.clientFor(ALICE);
    // startImport itself writes 'processing' — there is no queued-then-fetch
    // step in this harness, so this job is already mid-flight.
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });

    const snapshot = await loadImportForReview(alice, ALICE, importId!);
    expect(snapshot?.status).toBe('processing');
    expect(snapshot?.candidates).toEqual([]);
    expect(snapshot?.preview).toBeNull();
  });

  it('returns the status for a failed job, with no candidates', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await failImport(alice, importId);

    const snapshot = await loadImportForReview(alice, ALICE, importId!);
    expect(snapshot?.status).toBe('failed');
    expect(snapshot?.candidates).toEqual([]);
  });

  it('never reads another traveler\'s job — a foreign id is null, not another traveler\'s data', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    await completeImport(alice, importId, { outcome: 'ok', candidates: [WAT_PHO], usedModel: true });

    const bob = harness.clientFor(BOB);
    expect(await loadImportForReview(bob, BOB, importId!)).toBeNull();
  });

  it('a nonexistent id reads as null, not as a crash', async () => {
    const alice = harness.clientFor(ALICE);
    expect(await loadImportForReview(alice, ALICE, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('degrades a malformed stored preview to null rather than leaking it raw', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await startImport(alice, { userId: ALICE, key: KEY, platform: 'tiktok' });
    // Exactly what a row from an older release, or a direct PostgREST write,
    // could leave behind: jsonb the database accepts because it enforces only
    // that this column is an object, not its shape.
    await alice
      .from('place_imports')
      .update({ status: 'completed', preview: { unexpected: 'shape' }, outcome: 'ok' })
      .eq('id', importId!);

    const snapshot = await loadImportForReview(alice, ALICE, importId!);
    expect(snapshot?.preview).toBeNull();
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
  it('cannot be written by a traveler at all', async () => {
    // It briefly could: an INSERT policy scoped to `user_id = auth.uid()` let
    // the extract route write on the caller's session client. That constrained
    // WHOSE row could be written but not what was in it, so any signed-in
    // account could inject arbitrary models, token counts and costs into the
    // numbers we use to answer "what is this costing us". There is now no
    // policy of any kind, and RLS defaults to deny.
    const alice = harness.clientFor(ALICE);

    const { error } = await alice.from('ai_usage_log').insert({
      user_id: ALICE,
      feature: 'place_import',
      model: 'claude-sonnet-5',
      tokens_in: 999_999,
      tokens_out: 999_999,
      cost_estimate_micros: 1,
    });

    expect(error).not.toBeNull();
    expect(await harness.rows('ai_usage_log')).toHaveLength(0);
  });

  it('cannot be read by a traveler either', async () => {
    const service = harness.serviceClient();
    await recordAiUsage(service, ALICE, 'place_import', {
      model: 'claude-sonnet-5',
      tokensIn: 900,
      tokensOut: 120,
    });

    const { data } = await harness.clientFor(ALICE).from('ai_usage_log').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('is written by the service role, with the cost it estimated', async () => {
    const service = harness.serviceClient();
    await recordAiUsage(service, ALICE, 'place_import', {
      model: 'claude-sonnet-5',
      tokensIn: 900,
      tokensOut: 120,
    });

    const [row] = await harness.rows('ai_usage_log');
    expect(row.model).toBe('claude-sonnet-5');
    expect(row.tokens_in).toBe(900);
    // $3/1M in and $15/1M out: 900*3 + 120*15 = 4500 micro-dollars.
    expect(Number(row.cost_estimate_micros)).toBe(4500);
  });

  it('records nothing, and does not throw, with no service key configured', async () => {
    // The empty-.env deployment. An absent line is honest; a line a traveler
    // could have written is not.
    await expect(
      recordAiUsage(null, ALICE, 'place_import', {
        model: 'claude-sonnet-5',
        tokensIn: 10,
        tokensOut: 10,
      })
    ).resolves.toBeUndefined();
    expect(await harness.rows('ai_usage_log')).toHaveLength(0);
  });
});
