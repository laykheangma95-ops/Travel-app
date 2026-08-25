// ─────────────────────────────────────────────────────────────────────────────
// The stuck-job reaper, against a REAL Postgres with the REAL policies.
//
// What has to be true, per lib/travel/importReaper.ts's own header:
//   1. A job stuck in `processing` past the timeout is failed.
//   2. A job that started recently is left alone — a reaper that races a
//      genuinely in-flight connector would be worse than the bug it fixes.
//   3. Running the sweep twice only touches a row once (idempotent).
//   4. A `processing` row from the OLDER synchronous pipeline, which never set
//      `started_at`, is still reachable — via `created_at`.
//   5. It reaches across every traveler's jobs, which requires the
//      service-role client; RLS on a single user's session client cannot.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reapStuckImports } from '@/lib/travel/importReaper';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
});

afterAll(async () => {
  await harness.close();
});

async function insertProcessing(
  userId: string,
  urlHash: string,
  ageMs: number,
  useStartedAt = true
): Promise<string> {
  const at = new Date(Date.now() - ageMs).toISOString();

  if (useStartedAt) {
    const [{ id }] = await harness.asAdmin(
      `INSERT INTO place_imports (user_id, url_hash, normalized_url, platform, status, started_at)
       VALUES ($1, $2, 'https://www.tiktok.com/@a/video/1', 'tiktok', 'processing', $3)
       RETURNING id`,
      [userId, urlHash, at]
    );
    return id as string;
  }

  // The legacy case: a row with no started_at, aged by `created_at` instead.
  // place_imports_guard_trg forces `created_at := NOW()` on every INSERT
  // (and pins it on UPDATE too) — the same guard that stops a traveler from
  // backdating a row to dodge the daily quota (migration 012). A test proving
  // the reaper reaches an old `created_at` has to get past that guard the same
  // way a migration backfill would: with the trigger off for the one
  // statement that needs to.
  await harness.execAsAdmin('ALTER TABLE place_imports DISABLE TRIGGER place_imports_guard_trg;');
  try {
    const [{ id }] = await harness.asAdmin(
      `INSERT INTO place_imports (user_id, url_hash, normalized_url, platform, status, created_at)
       VALUES ($1, $2, 'https://www.tiktok.com/@a/video/1', 'tiktok', 'processing', $3)
       RETURNING id`,
      [userId, urlHash, at]
    );
    return id as string;
  } finally {
    await harness.execAsAdmin('ALTER TABLE place_imports ENABLE TRIGGER place_imports_guard_trg;');
  }
}

describe('reaping a stuck job', () => {
  it('fails a job that has been processing far longer than the timeout', async () => {
    const stuck = await insertProcessing(ALICE, 'hash-stuck', 20 * 60 * 1000);

    const result = await reapStuckImports(harness.serviceClient(), 10 * 60 * 1000);
    expect(result.failed).toBe(1);
    expect(result.sampleIds).toContain(stuck);

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('failed');
    expect(row.error_code).toBe('stuck_timeout');
    expect(row.completed_at).not.toBeNull();
  });

  it('leaves a job that only just started', async () => {
    await insertProcessing(ALICE, 'hash-fresh', 5_000);

    const result = await reapStuckImports(harness.serviceClient(), 10 * 60 * 1000);
    expect(result.failed).toBe(0);

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('processing');
  });

  it('reaches a row from the older pipeline that never set started_at', async () => {
    await insertProcessing(BOB, 'hash-legacy', 20 * 60 * 1000, /* useStartedAt */ false);

    const result = await reapStuckImports(harness.serviceClient(), 10 * 60 * 1000);
    expect(result.failed).toBe(1);

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('failed');
    expect(row.started_at).toBeNull();
  });

  it('reaches across every traveler, not just one', async () => {
    await insertProcessing(ALICE, 'hash-a', 20 * 60 * 1000);
    await insertProcessing(BOB, 'hash-b', 20 * 60 * 1000);

    const result = await reapStuckImports(harness.serviceClient(), 10 * 60 * 1000);
    expect(result.failed).toBe(2);

    const rows = await harness.rows('place_imports');
    expect(rows.every((row) => row.status === 'failed')).toBe(true);
  });

  it('does not touch a job that is already completed or failed', async () => {
    await harness.asAdmin(
      `INSERT INTO place_imports (user_id, url_hash, normalized_url, platform, status, completed_at, created_at)
       VALUES ($1, 'hash-done', 'https://www.tiktok.com/@a/video/2', 'tiktok', 'completed', NOW() - interval '1 hour', NOW() - interval '1 hour')`,
      [ALICE]
    );

    const result = await reapStuckImports(harness.serviceClient(), 10 * 60 * 1000);
    expect(result.failed).toBe(0);

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('completed');
  });
});

describe('idempotency and concurrency', () => {
  it('running the sweep twice only fails a row once', async () => {
    await insertProcessing(ALICE, 'hash-stuck', 20 * 60 * 1000);

    const first = await reapStuckImports(harness.serviceClient(), 10 * 60 * 1000);
    const second = await reapStuckImports(harness.serviceClient(), 10 * 60 * 1000);

    expect(first.failed).toBe(1);
    expect(second.failed).toBe(0);
  });

  it('two sweeps racing on the same stuck row fail it exactly once', async () => {
    await insertProcessing(ALICE, 'hash-stuck', 20 * 60 * 1000);

    const [a, b] = await Promise.all([
      reapStuckImports(harness.serviceClient(), 10 * 60 * 1000),
      reapStuckImports(harness.serviceClient(), 10 * 60 * 1000),
    ]);

    // Exactly one of the two racing sweeps sees the row still `processing`;
    // the other's WHERE clause matches nothing once the winner has committed.
    expect(a.failed + b.failed).toBe(1);

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('failed');
  });
});

describe('why the reaper must run on the service-role client', () => {
  it('a traveler-scoped session client cannot reap another traveler\'s stuck job', async () => {
    await insertProcessing(ALICE, 'hash-alice', 20 * 60 * 1000);
    await insertProcessing(BOB, 'hash-bob', 20 * 60 * 1000);

    // Not what production wires up — app/api/imports/reap/route.ts always
    // passes getSupabaseAdmin() — but this is the property that actually
    // matters: RLS on place_imports (migration 012) grants only
    // `user_id = auth.uid()`, so Alice's own session client can reap HER row
    // and nothing stops it, but it structurally cannot reach Bob's. There is
    // no special-case in reapStuckImports that would let it; the guarantee is
    // RLS's, not this function's.
    const alice = harness.clientFor(ALICE);
    const result = await reapStuckImports(alice, 10 * 60 * 1000);
    expect(result.failed).toBe(1);

    const rows = await harness.rows('place_imports');
    const bobRow = rows.find((row) => row.user_id === BOB);
    expect(bobRow?.status).toBe('processing');
  });
});
