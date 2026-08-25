// ─────────────────────────────────────────────────────────────────────────────
// BLOCKER 1 and MEDIUM 1 from the Phase 4 review, as regression tests.
//
// Every case here reproduces an attack or a race that WORKED before migration
// 016, against a real Postgres running the real policies and the real trigger.
// The point of the suite is not that the fix is present — it is that the
// original failure is gone.
//
// THE ATTACK BLOCKER 1 DESCRIBES, in one line: a traveler holds the anon key,
// so `PATCH place_imports?id=eq.<own job> {"status":"queued"}` is a request
// they can simply send. Before 016 it was accepted, and re-processing the
// rewound row produced a second connector run — six runs came out of one
// quota-counted row. Migration 012's header already stated the threat model
// this falls under: "our code never does that" is not a control.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImportFromUrl } from '@/lib/travel/importIntake';
import { processImport } from '@/lib/travel/importOrchestrator';
import { reapStuckImports } from '@/lib/travel/importReaper';
import {
  __registerConnectorForTest,
  __resetConnectorsForTest,
} from '@/lib/connectors/places/registry';
import type { ConnectorExtraction, PlaceConnector } from '@/lib/connectors/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const TIKTOK = 'https://www.tiktok.com/@chef/video/7311122233344455566';

let harness: Harness;
let connectorRuns = 0;

function extraction(url: string): ConnectorExtraction {
  return {
    connectorId: 'counting',
    platform: 'tiktok',
    sourceUrl: url,
    externalId: null,
    title: null,
    captionText: '📍 Wat Pho',
    candidateNames: [],
    locationHint: { city: null, country: null },
    coordinates: null,
    media: { thumbnailUrl: null },
    confidence: 0.8,
    connectorMetadata: {},
    extractedAt: new Date().toISOString(),
  };
}

const counting: PlaceConnector = {
  id: 'counting',
  platforms: ['tiktok'],
  isConfigured: () => true,
  async extract(job) {
    connectorRuns += 1;
    return extraction(job.url);
  },
};

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
  connectorRuns = 0;
  __registerConnectorForTest(counting);
});

afterEach(() => {
  __resetConnectorsForTest();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await harness.close();
});

async function queue(userId: string, url = TIKTOK): Promise<string> {
  const result = await createImportFromUrl(harness.clientFor(userId), userId, url);
  if (!result.ok) throw new Error(`setup: intake refused (${result.code})`);
  return result.importId;
}

describe('BLOCKER 1 — a finished import cannot be rewound to buy another run', () => {
  it('refuses the exact PostgREST rewind the review used', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await queue(ALICE);
    await processImport(alice, ALICE, importId);
    expect(connectorRuns).toBe(1);
    expect((await harness.rows('place_imports'))[0].status).toBe('completed');

    // THE ATTACK. Their own row, their own session, one PATCH.
    const { error } = await alice
      .from('place_imports')
      .update({ status: 'queued' })
      .eq('id', importId);

    // Before 016 this came back with no error and the row read `queued`.
    expect(error).not.toBeNull();
    expect((await harness.rows('place_imports'))[0].status).toBe('completed');
  });

  it('keeps model runs bounded by quota-counted rows across a sustained attack', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await queue(ALICE);
    await processImport(alice, ALICE, importId);

    // The review's loop: rewind, re-process, repeat. It produced 6 runs from
    // 1 row. Every rewind is now refused, so every re-process finds a
    // completed job and does nothing.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await alice.from('place_imports').update({ status: 'queued' }).eq('id', importId);
      const again = await processImport(alice, ALICE, importId);
      expect(again.outcome).toBe('already-processing');
    }

    const rows = await harness.rows('place_imports');
    expect(rows).toHaveLength(1);
    // THE INVARIANT: runs never exceed the rows the quota can see.
    expect(connectorRuns).toBe(1);
    expect(connectorRuns).toBeLessThanOrEqual(rows.length);
  });

  it('refuses every other rewind spelling, including the deprecated ones', async () => {
    const alice = harness.clientFor(ALICE);
    const importId = await queue(ALICE);
    await processImport(alice, ALICE, importId);

    for (const status of ['queued', 'processing', 'needs_confirmation', 'extracting', 'failed']) {
      const { error } = await alice
        .from('place_imports')
        .update({ status })
        .eq('id', importId);
      expect({ status, refused: error !== null }).toEqual({ status, refused: true });
    }
    expect((await harness.rows('place_imports'))[0].status).toBe('completed');
  });

  it('a failed job is terminal too — a retry must cost a fresh row', async () => {
    const alice = harness.clientFor(ALICE);
    const [{ id }] = await harness.asAdmin(
      `INSERT INTO place_imports (user_id, url_hash, normalized_url, platform, status)
       VALUES ($1, 'hash-failed', 'x.test/1', 'tiktok', 'failed') RETURNING id`,
      [ALICE]
    );

    const { error } = await alice
      .from('place_imports')
      .update({ status: 'queued' })
      .eq('id', id as string);
    expect(error).not.toBeNull();
  });

  it('still allows the transitions the application actually makes', async () => {
    // The rule must not have broken the pipeline it is protecting.
    const alice = harness.clientFor(ALICE);
    const importId = await queue(ALICE);

    // queued -> processing -> completed, through the real orchestrator.
    const result = await processImport(alice, ALICE, importId);
    expect(result.outcome).toBe('completed');

    // An UPDATE that leaves status alone is unaffected.
    const { error } = await alice
      .from('place_imports')
      .update({ candidate_count: 3 })
      .eq('id', importId);
    expect(error).toBeNull();
  });
});

describe('BLOCKER 1 — forged queued rows cannot buy runs either', () => {
  it('caps spend when a traveler INSERTs their own queued rows through PostgREST', async () => {
    // The second vector, found while building the fix: RLS lets a traveler
    // INSERT their own rows, so the INTAKE quota is never consulted. Rows a
    // traveler can forge cannot be the cap — the cap is counted at the point
    // of spend instead.
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '3');
    const alice = harness.clientFor(ALICE);

    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const { data, error } = await alice
        .from('place_imports')
        .insert({
          user_id: ALICE,
          url_hash: `forged-${i}`,
          normalized_url: `www.tiktok.com/@a/video/${i}`,
          platform: 'tiktok',
          status: 'queued',
        })
        .select('id')
        .single();
      // The INSERT itself is allowed — that is RLS working as designed.
      expect(error).toBeNull();
      ids.push((data as { id: string }).id);
    }

    let refused = 0;
    for (const id of ids) {
      try {
        await processImport(alice, ALICE, id);
      } catch {
        refused += 1;
      }
    }

    // Ten forged rows, a quota of three: at most three ever reach a connector.
    expect(connectorRuns).toBeLessThanOrEqual(3);
    expect(refused).toBeGreaterThan(0);
  });
});

describe('MEDIUM 1 — the reaper and a late completion', () => {
  it('does not resurrect a reaped job, and does not keep its error text', async () => {
    let release: () => void = () => {};
    __registerConnectorForTest({
      id: 'slow',
      platforms: ['tiktok'],
      isConfigured: () => true,
      async extract(job) {
        connectorRuns += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return extraction(job.url);
      },
    });

    const alice = harness.clientFor(ALICE);
    const importId = await queue(ALICE);

    const inflight = processImport(alice, ALICE, importId);
    await new Promise((resolve) => setTimeout(resolve, 50)); // let it claim

    // A zero timeout makes everything currently processing "stuck", which is
    // how the review reproduced this without waiting ten minutes.
    const reaped = await reapStuckImports(harness.serviceClient(), 0);
    expect(reaped.failed).toBe(1);

    release();
    const result = await inflight;

    const [row] = await harness.rows('place_imports');
    // Before the fix this read: status=completed, error_code=stuck_timeout.
    expect(row.status).toBe('failed');
    expect(row.error_code).toBe('stuck_timeout');
    // The orchestrator reports the truth rather than claiming success.
    expect(result.outcome).toBe('already-processing');
    // And the run that outlived its claim leaves no candidates behind.
    expect(await harness.rows('import_candidates')).toHaveLength(0);
  });

  it('a connector failing after the reaper gave up does not overwrite the verdict', async () => {
    let release: () => void = () => {};
    __registerConnectorForTest({
      id: 'slow-failing',
      platforms: ['tiktok'],
      isConfigured: () => true,
      async extract() {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error('upstream died');
      },
    });

    const alice = harness.clientFor(ALICE);
    const importId = await queue(ALICE);
    const inflight = processImport(alice, ALICE, importId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    await reapStuckImports(harness.serviceClient(), 0);
    release();
    await inflight;

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('failed');
    // The reaper got there first; its reason is the one that stands.
    expect(row.error_code).toBe('stuck_timeout');
  });
});

describe('the guarantee is per traveler, not global', () => {
  it('one traveler being at their processing cap does not block another', async () => {
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '1');

    const aliceJob = await queue(ALICE);
    await processImport(harness.clientFor(ALICE), ALICE, aliceJob);

    const bobJob = await queue(BOB);
    const bobResult = await processImport(harness.clientFor(BOB), BOB, bobJob);
    expect(bobResult.outcome).toBe('completed');
  });
});
