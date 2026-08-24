// ─────────────────────────────────────────────────────────────────────────────
// The intake, against a REAL Postgres with the REAL policies.
//
// What Phase 3 has to get right, and what this file checks:
//
//   1. A link becomes a job row, with the platform derived SERVER-SIDE from a
//      validated hostname — never from anything a caller said.
//   2. The same link twice does not become two jobs.
//   3. Reuse is the traveler's OWN history and nobody else's. Which links a
//      person has pasted is a record of what they are planning and who they
//      follow.
//   4. A Xiaohongshu link is accepted and recorded, and nothing fetches it.
//   5. Two genuinely different posts never collapse onto one key.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImportFromUrl } from '@/lib/travel/importIntake';
import { completeImport, findReusableImport } from '@/lib/travel/importJobs';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const TIKTOK = 'https://www.tiktok.com/@chef/video/7311122233344455566';

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

describe('recording a link', () => {
  it('queues a job and derives the platform from the hostname', async () => {
    const alice = harness.clientFor(ALICE);
    const result = await createImportFromUrl(alice, ALICE, TIKTOK);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({ platform: 'tiktok', status: 'queued', reused: false });

    const [row] = await harness.rows('place_imports');
    expect(row.platform).toBe('tiktok');
    expect(row.status).toBe('queued');
    expect(row.user_id).toBe(ALICE);
    // The paste is kept as given, so support can start from what they saw.
    expect(row.original_url).toBe(TIKTOK);
    // …and the comparable form is what dedupe keys on.
    expect(String(row.normalized_url)).toContain('tiktok.com');
    expect(String(row.url_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(row.started_at).toBeNull();
    expect(row.completed_at).toBeNull();
  });

  it('classifies every platform Phase 3 supports', async () => {
    const alice = harness.clientFor(ALICE);
    const cases: [string, string][] = [
      ['https://www.tiktok.com/@a/video/1', 'tiktok'],
      ['https://www.instagram.com/reel/CxYzAbCdEfG/', 'instagram'],
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
      ['https://www.xiaohongshu.com/explore/64f0a1b2', 'xiaohongshu'],
      ['https://xhslink.com/aBcDeF', 'xiaohongshu'],
      ['https://www.facebook.com/watch/?v=123', 'facebook'],
      ['https://maps.app.goo.gl/abc123', 'google-maps'],
      ['https://www.lonelyplanet.com/thailand', 'web'],
    ];

    for (const [url, platform] of cases) {
      const result = await createImportFromUrl(alice, ALICE, url);
      expect({ url, ok: result.ok, platform: result.ok ? result.platform : null }).toEqual({
        url,
        ok: true,
        platform,
      });
    }
  });

  it('accepts a Xiaohongshu link even though nothing can read one yet', async () => {
    // The point of Phase 3: recording a link and fetching it are separate. RED
    // publishes no oEmbed endpoint and is on no fetch allowlist, so this is
    // written down and left alone until a connector exists.
    const result = await createImportFromUrl(
      harness.clientFor(ALICE),
      ALICE,
      'https://www.xiaohongshu.com/explore/64f0a1b2c3'
    );
    expect(result.ok && result.status).toBe('queued');
    expect((await harness.rows('place_imports'))[0].platform).toBe('xiaohongshu');
  });

  it('refuses what the URL gate refuses, and writes nothing', async () => {
    const alice = harness.clientFor(ALICE);
    for (const [url, code] of [
      ['javascript:alert(1)', 'unsupported-protocol'],
      ['http://127.0.0.1/', 'private-host'],
      ['http://2130706433/', 'private-host'],
      ['http://[::1]/', 'private-host'],
      ['https://user:pass@example.com/', 'credentials-in-url'],
      ['http://example.com:6379/', 'blocked-port'],
      ['not a url', 'malformed'],
      ['', 'empty'],
    ] as const) {
      const result = await createImportFromUrl(alice, ALICE, url);
      expect({ url, code: result.ok ? 'ACCEPTED' : result.code }).toEqual({ url, code });
    }
    expect(await harness.rows('place_imports')).toHaveLength(0);
  });
});

describe('a row that does not state its status', () => {
  it('is queued, never the deprecated value the column used to default to', async () => {
    // FOUND IN REVIEW. Migration 015 expanded the CHECK and backfilled the rows
    // but left `DEFAULT 'extracting'` in place, so any INSERT omitting status
    // kept writing a deprecated value — and a row like that is invisible to the
    // whole Phase 3 model.
    const alice = harness.clientFor(ALICE);
    const { error } = await alice.from('place_imports').insert({
      user_id: ALICE,
      url_hash: 'd'.repeat(64),
      normalized_url: 'tiktok.com/@a/video/77',
      platform: 'tiktok',
    });
    expect(error).toBeNull();

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('queued');
    expect(['extracting', 'ready']).not.toContain(row.status);
  });

  it('participates in the open-job model like any other queued row', async () => {
    const alice = harness.clientFor(ALICE);
    await alice.from('place_imports').insert({
      user_id: ALICE,
      url_hash: 'd'.repeat(64),
      normalized_url: 'tiktok.com/@a/video/77',
      platform: 'tiktok',
    });

    // The partial unique index covers `queued`, so a second open job for the
    // same link is refused — which is the property a defaulted row would have
    // escaped entirely while it was landing as 'extracting'.
    const { error } = await alice.from('place_imports').insert({
      user_id: ALICE,
      url_hash: 'd'.repeat(64),
      platform: 'tiktok',
    });
    expect(error?.code).toBe('23505');
    expect(await harness.rows('place_imports')).toHaveLength(1);
  });

  it('leaves nothing that would block removing the deprecated values later', async () => {
    // The contraction this migration promises: a later migration drops
    // 'extracting' and 'ready' from the CHECK. That cannot run while anything
    // still produces one — including the column default.
    const [column] = await harness.asAdmin(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'place_imports' AND column_name = 'status'`
    );
    expect(String(column.column_default)).toContain('queued');
    expect(String(column.column_default)).not.toContain('extracting');

    const rows = await harness.rows('place_imports');
    expect(rows.filter((row) => row.status === 'extracting' || row.status === 'ready')).toEqual([]);
  });
});

describe('the same link twice', () => {
  it('returns the job already in flight instead of queueing a second', async () => {
    const alice = harness.clientFor(ALICE);
    const first = await createImportFromUrl(alice, ALICE, TIKTOK);
    const second = await createImportFromUrl(alice, ALICE, TIKTOK);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.importId).toBe(first.importId);
    expect(second.alreadyQueued).toBe(true);
    expect(await harness.rows('place_imports')).toHaveLength(1);
  });

  it('is idempotent across a burst of submissions', async () => {
    const alice = harness.clientFor(ALICE);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createImportFromUrl(alice, ALICE, TIKTOK))
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await harness.rows('place_imports')).toHaveLength(1);
  });

  it('collapses the share variants of one post onto one job', async () => {
    const alice = harness.clientFor(ALICE);
    await createImportFromUrl(alice, ALICE, TIKTOK);
    // Mobile host, trailing slash, a share token, tracking parameters.
    const again = await createImportFromUrl(
      alice,
      ALICE,
      'https://m.tiktok.com/@chef/video/7311122233344455566/?_t=8abc&is_from_webapp=1'
    );
    expect(again.ok && again.alreadyQueued).toBe(true);
    expect(await harness.rows('place_imports')).toHaveLength(1);
  });

  it('does NOT collapse two different posts', async () => {
    const alice = harness.clientFor(ALICE);
    await createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@chef/video/111');
    await createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@chef/video/222');
    // Two videos, two identities, two jobs. The dedupe must never be so eager
    // that it loses a post.
    expect(await harness.rows('place_imports')).toHaveLength(2);

    await createImportFromUrl(alice, ALICE, 'https://www.youtube.com/watch?v=aaa');
    await createImportFromUrl(alice, ALICE, 'https://www.youtube.com/watch?v=bbb');
    // The `v` parameter IS the post's identity, so it survives normalization.
    expect(await harness.rows('place_imports')).toHaveLength(4);
  });

  it('replays a completed import rather than queueing work again', async () => {
    const alice = harness.clientFor(ALICE);
    const first = await createImportFromUrl(alice, ALICE, TIKTOK);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await completeImport(alice, first.importId, {
      outcome: 'ok',
      candidates: [],
      usedModel: true,
    });

    const replay = await createImportFromUrl(alice, ALICE, TIKTOK);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.reused).toBe(true);
    expect(replay.status).toBe('completed');
    expect(replay.importId).not.toBe(first.importId);

    // The traveler gets a job row of their own, pointing at the one that did
    // the work.
    const rows = await harness.rows('place_imports');
    expect(rows).toHaveLength(2);
    const replayRow = rows.find((row) => row.id === replay.importId);
    expect(replayRow!.reused_from_import_id).toBe(first.importId);
  });
});

describe('one traveler\'s import history is not another\'s', () => {
  it('does not replay Bob\'s completed import for Alice', async () => {
    const bob = harness.clientFor(BOB);
    const bobsImport = await createImportFromUrl(bob, BOB, TIKTOK);
    expect(bobsImport.ok).toBe(true);
    if (!bobsImport.ok) return;
    await completeImport(bob, bobsImport.importId, {
      outcome: 'ok',
      candidates: [],
      usedModel: true,
    });

    // Alice pastes the same link. She gets her own fresh job — not a replay of
    // Bob's, and no sign that his exists. Which links a person has pasted is a
    // record of what they are planning and who they follow.
    const alice = harness.clientFor(ALICE);
    const hers = await createImportFromUrl(alice, ALICE, TIKTOK);
    expect(hers.ok).toBe(true);
    if (!hers.ok) return;
    expect(hers.reused).toBe(false);
    expect(hers.alreadyQueued).toBe(false);
    expect(hers.status).toBe('queued');

    const rows = await harness.rows('place_imports');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.user_id).sort()).toEqual([ALICE, BOB].sort());
  });

  it('shows Alice nothing of Bob\'s imports at all', async () => {
    const bob = harness.clientFor(BOB);
    await createImportFromUrl(bob, BOB, TIKTOK);

    const alice = harness.clientFor(ALICE);
    const { data } = await alice.from('place_imports').select('id,user_id');
    expect(data ?? []).toHaveLength(0);
    // Even asking by hash, which is the one value she can compute herself.
    const [bobsRow] = await harness.rows('place_imports');
    expect(
      await findReusableImport(alice, ALICE, String(bobsRow.url_hash))
    ).toBeNull();
  });

  it('refuses an intake stamped with another traveler\'s id', async () => {
    // createImportFromUrl takes the id from the caller, but the policy is what
    // enforces it: a direct insert naming Bob is refused for Alice.
    const alice = harness.clientFor(ALICE);
    const { error } = await alice.from('place_imports').insert({
      user_id: BOB,
      url_hash: 'a'.repeat(64),
      platform: 'tiktok',
      status: 'queued',
    });
    expect(error).not.toBeNull();
    expect(await harness.rows('place_imports')).toHaveLength(0);
  });
});

describe('cost control', () => {
  it('counts new work against the daily quota', async () => {
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '2');
    const alice = harness.clientFor(ALICE);

    await createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@a/video/1');
    await createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@a/video/2');

    await expect(
      createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@a/video/3')
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('does not charge for a re-submission or a replay', async () => {
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '2');
    const alice = harness.clientFor(ALICE);

    const first = await createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@a/video/1');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Re-submitting while it is open costs nothing…
    await createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@a/video/1');
    await completeImport(alice, first.importId, { outcome: 'ok', candidates: [], usedModel: true });
    // …and neither does replaying it once it is done.
    const replay = await createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@a/video/1');
    expect(replay.ok && replay.reused).toBe(true);

    // One unit of real work spent, so a second distinct link still fits.
    const second = await createImportFromUrl(alice, ALICE, 'https://www.tiktok.com/@a/video/2');
    expect(second.ok).toBe(true);
  });
});
