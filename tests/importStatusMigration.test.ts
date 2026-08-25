// ─────────────────────────────────────────────────────────────────────────────
// Migration 016 applied three ways: fresh, onto an already-populated database,
// and twice over.
//
// WHY THIS SUITE EXISTS SEPARATELY FROM THE BEHAVIOUR TESTS. A guard that only
// works on a database built from scratch is a guard that does not work, because
// production is never built from scratch. And 016 REPLACES a function two
// earlier migrations also define, so "which definition wins" is the whole
// question — a fresh database runs 012 → 015 → 016 and an upgraded one runs
// 016 alone, and both have to end up enforcing the same rule.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const MIGRATION_016 = '016_import_status_terminal.sql';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.close();
  harness = null;
});

async function migrationSql(file: string): Promise<string> {
  return readFile(join(process.cwd(), 'supabase', 'migrations', file), 'utf8');
}

/** Try the attack; return true when the database refused it. */
async function rewindRefused(active: Harness, importId: string): Promise<boolean> {
  const { error } = await active
    .clientFor(ALICE)
    .from('place_imports')
    .update({ status: 'queued' })
    .eq('id', importId);
  return error !== null;
}

async function seedCompleted(active: Harness, hash: string): Promise<string> {
  const [{ id }] = await active.asAdmin(
    `INSERT INTO place_imports (user_id, url_hash, normalized_url, platform, status)
     VALUES ($1, $2, 'www.tiktok.com/@a/video/1', 'tiktok', 'completed') RETURNING id`,
    [ALICE, hash]
  );
  return id as string;
}

describe('a fresh database', () => {
  it('enforces the rule after the full migration run', async () => {
    // createHarness() replays 007…016 in order, which is the fresh-install path.
    harness = await createHarness();
    await harness.createUser(ALICE);
    const importId = await seedCompleted(harness, 'fresh');

    expect(await rewindRefused(harness, importId)).toBe(true);
  }, 120_000);
});

describe('an upgraded database', () => {
  it('was vulnerable before 016 and is not after applying it alone', async () => {
    harness = await createHarness();
    await harness.createUser(ALICE);

    // Wind the guard back to its 015 definition — this is precisely what a
    // production database that has not yet had 016 applied looks like.
    await harness.execAsAdmin(await migrationSql('015_import_intake.sql'));
    const before = await seedCompleted(harness, 'upgrade-before');
    expect(await rewindRefused(harness, before)).toBe(false);

    // Put the row back so the upgrade runs against realistic data: a mix of
    // finished and open jobs, exactly what 016 will meet in production.
    await harness.asAdmin(`UPDATE place_imports SET status = 'completed' WHERE id = $1`, [before]);
    await harness.asAdmin(
      `INSERT INTO place_imports (user_id, url_hash, normalized_url, platform, status)
       VALUES ($1, 'upgrade-open', 'www.tiktok.com/@a/video/2', 'tiktok', 'queued')`,
      [ALICE]
    );

    await harness.execAsAdmin(await migrationSql(MIGRATION_016));

    // The pre-existing finished row is now protected too — the rule applies to
    // rows that were already there, not only to ones created after it.
    expect(await rewindRefused(harness, before)).toBe(true);
  }, 120_000);

  it('leaves an in-flight job free to finish across the upgrade', async () => {
    // The migration must not strand work that was mid-pipeline when it ran.
    harness = await createHarness();
    await harness.createUser(ALICE);

    const [{ id }] = await harness.asAdmin(
      `INSERT INTO place_imports (user_id, url_hash, normalized_url, platform, status)
       VALUES ($1, 'inflight', 'www.tiktok.com/@a/video/3', 'tiktok', 'processing') RETURNING id`,
      [ALICE]
    );

    await harness.execAsAdmin(await migrationSql(MIGRATION_016));

    const { error } = await harness
      .clientFor(ALICE)
      .from('place_imports')
      .update({ status: 'completed' })
      .eq('id', id as string);
    expect(error).toBeNull();
  }, 120_000);
});

describe('repeated application', () => {
  it('is idempotent — applying 016 three times changes nothing', async () => {
    harness = await createHarness();
    await harness.createUser(ALICE);

    const sql = await migrationSql(MIGRATION_016);
    await harness.execAsAdmin(sql);
    await harness.execAsAdmin(sql);
    await harness.execAsAdmin(sql);

    const importId = await seedCompleted(harness, 'idempotent');
    expect(await rewindRefused(harness, importId)).toBe(true);

    // Exactly one trigger, not three. A duplicated BEFORE trigger would fire
    // the guard repeatedly and is the classic way a re-run migration corrupts
    // behaviour without failing.
    const triggers = await harness.asAdmin(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'place_imports'::regclass AND NOT tgisinternal`
    );
    expect(triggers.map((row) => row.tgname)).toEqual(['place_imports_guard_trg']);
  }, 120_000);
});

describe('fresh and upgraded converge', () => {
  it('produces a byte-identical guard function either way', async () => {
    // The property that makes the two paths safe to reason about as one.
    const fresh = await createHarness();
    const freshBody = (
      await fresh.asAdmin(`SELECT prosrc FROM pg_proc WHERE proname = 'place_imports_guard'`)
    )[0].prosrc;
    await fresh.close();

    const upgraded = await createHarness();
    await upgraded.execAsAdmin(await migrationSql('012_place_imports.sql'));
    await upgraded.execAsAdmin(await migrationSql('015_import_intake.sql'));
    await upgraded.execAsAdmin(await migrationSql(MIGRATION_016));
    const upgradedBody = (
      await upgraded.asAdmin(`SELECT prosrc FROM pg_proc WHERE proname = 'place_imports_guard'`)
    )[0].prosrc;
    await upgraded.close();

    expect(upgradedBody).toBe(freshBody);
  }, 120_000);
});
