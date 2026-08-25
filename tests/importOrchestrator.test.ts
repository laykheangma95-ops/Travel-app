// ─────────────────────────────────────────────────────────────────────────────
// The connector orchestrator, against a REAL Postgres with the REAL policies.
//
// Phase 3 recorded that a link exists (place_imports.status = 'queued'). This
// is Phase 4's half: claiming that row, asking a connector to read it, and
// leaving it `completed` or `failed` — never stuck, never processed twice, and
// never readable or claimable by anyone but the traveler who submitted it.
//
// The connector itself is a test double registered through
// lib/connectors/places/registry.ts's own test seam — this suite is not
// re-testing lib/travel/linkPreview.ts's network behaviour (tests/
// linkPreview.test.ts already does), it is testing what the orchestrator does
// with whatever a connector hands back.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createImportFromUrl } from '@/lib/travel/importIntake';
import { processImport } from '@/lib/travel/importOrchestrator';
import {
  __registerConnectorForTest,
  __resetConnectorsForTest,
} from '@/lib/connectors/places/registry';
import { ConnectorError, type ConnectorExtraction, type PlaceConnector } from '@/lib/connectors/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const TIKTOK = 'https://www.tiktok.com/@chef/video/7311122233344455566';
const RED = 'https://www.xiaohongshu.com/explore/64f0a1b2c3d4e5';

let harness: Harness;
let extractCalls: number;

function fakeConnector(
  id: string,
  behavior: (job: { url: string; platform: string }) => Promise<ConnectorExtraction>
): PlaceConnector {
  return {
    id,
    platforms: ['tiktok'],
    isConfigured: () => true,
    async extract(job) {
      extractCalls += 1;
      return behavior(job as { url: string; platform: string });
    },
  };
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
  extractCalls = 0;
});

afterEach(() => {
  __resetConnectorsForTest();
});

afterAll(async () => {
  await harness.close();
});

async function queueTiktok(userId: string): Promise<string> {
  const client = harness.clientFor(userId);
  const result = await createImportFromUrl(client, userId, TIKTOK);
  if (!result.ok) throw new Error('setup: intake refused the link');
  return result.importId;
}

describe('the success path', () => {
  it('claims a queued job, reads it, and completes it', async () => {
    __registerConnectorForTest(
      fakeConnector('test-connector', async (job) => ({
        connectorId: 'test-connector',
        platform: 'tiktok',
        sourceUrl: job.url,
        externalId: '123',
        title: 'Bangkok eats',
        captionText: '📍 Wat Pho\n📍 Chatuchak Market',
        candidateNames: [],
        locationHint: { city: null, country: null },
        coordinates: null,
        media: { thumbnailUrl: null },
        confidence: 0.8,
        connectorMetadata: {},
        extractedAt: new Date().toISOString(),
      }))
    );

    const importId = await queueTiktok(ALICE);
    const alice = harness.clientFor(ALICE);

    const result = await processImport(alice, ALICE, importId);
    expect(result).toMatchObject({ outcome: 'completed', status: 'completed', importOutcome: 'ok' });
    expect(result.candidateCount).toBeGreaterThan(0);

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('completed');
    expect(row.started_at).not.toBeNull();

    const candidates = await harness.rows('import_candidates');
    expect(candidates.length).toBe(result.candidateCount);
  });

  it('is idempotent: processing a completed job again does not re-run the connector', async () => {
    __registerConnectorForTest(
      fakeConnector('test-connector', async (job) => ({
        connectorId: 'test-connector',
        platform: 'tiktok',
        sourceUrl: job.url,
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
      }))
    );

    const importId = await queueTiktok(ALICE);
    const alice = harness.clientFor(ALICE);

    await processImport(alice, ALICE, importId);
    expect(extractCalls).toBe(1);

    const second = await processImport(alice, ALICE, importId);
    expect(second.outcome).toBe('already-processing');
    expect(second.status).toBe('completed');
    expect(extractCalls).toBe(1);
  });
});

describe('ownership', () => {
  it('cannot claim or read another traveler\'s job', async () => {
    __registerConnectorForTest(
      fakeConnector('test-connector', async (job) => ({
        connectorId: 'test-connector',
        platform: 'tiktok',
        sourceUrl: job.url,
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
      }))
    );

    const importId = await queueTiktok(ALICE);
    const bob = harness.clientFor(BOB);

    const result = await processImport(bob, BOB, importId);
    expect(result).toEqual({ outcome: 'not-found', status: null, importOutcome: null, candidateCount: 0 });
    expect(extractCalls).toBe(0);

    // Alice's job is untouched — still queued, not silently claimed by Bob's
    // attempt.
    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('queued');
  });

  it('a forged id that does not exist reads as not-found, not as a crash', async () => {
    const alice = harness.clientFor(ALICE);
    const result = await processImport(alice, ALICE, '00000000-0000-4000-8000-000000000000');
    expect(result.outcome).toBe('not-found');
  });
});

describe('concurrency: two calls racing to claim the same job', () => {
  it('exactly one of them runs the connector', async () => {
    let resolveExtract: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      resolveExtract = resolve;
    });

    __registerConnectorForTest(
      fakeConnector('slow-connector', async (job) => {
        await gate;
        return {
          connectorId: 'slow-connector',
          platform: 'tiktok',
          sourceUrl: job.url,
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
      })
    );

    const importId = await queueTiktok(ALICE);
    const alice = harness.clientFor(ALICE);

    const first = processImport(alice, ALICE, importId);
    // Give the first call time to win the claim (its UPDATE ... WHERE
    // status='queued' commits) before the second is attempted.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await processImport(alice, ALICE, importId);

    expect(second.outcome).toBe('already-processing');
    expect(second.status).toBe('processing');

    resolveExtract();
    const firstResult = await first;
    expect(firstResult.outcome).toBe('completed');
    expect(extractCalls).toBe(1);
  });
});

describe('when nothing can read the link', () => {
  it('fails cleanly with no_connector rather than hanging in processing', async () => {
    // No connector is registered for xiaohongshu anywhere in the real
    // registry, by design — see lib/connectors/places/linkConnector.ts.
    __resetConnectorsForTest();
    const alice = harness.clientFor(ALICE);
    const result = await createImportFromUrl(alice, ALICE, RED);
    if (!result.ok) throw new Error('setup: intake refused the RED link');

    const outcome = await processImport(alice, ALICE, result.importId);
    expect(outcome).toMatchObject({ outcome: 'failed', status: 'failed' });

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('failed');
    expect(row.error_code).toBe('no_connector');
    // Not stuck in the open-job index: a fresh submission of the same link
    // creates a new job rather than being told one is already open.
    const retry = await createImportFromUrl(alice, ALICE, RED);
    expect(retry.ok && !retry.alreadyQueued).toBe(true);
  });
});

describe('when the connector itself fails', () => {
  it('records the failure and leaves the job in a terminal state', async () => {
    __registerConnectorForTest(
      fakeConnector('flaky-connector', async () => {
        throw new ConnectorError('flaky-connector', 'upstream returned 500');
      })
    );

    const importId = await queueTiktok(ALICE);
    const alice = harness.clientFor(ALICE);

    const result = await processImport(alice, ALICE, importId);
    expect(result).toMatchObject({ outcome: 'failed', status: 'failed' });

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('failed');
    expect(row.error_code).toBe('connector_error');
    expect(row.error_message).toContain('upstream returned 500');
  });
});

describe('defense in depth: the URL is re-validated before any connector touches it', () => {
  it('refuses to process a row whose stored URL is no longer considered safe', async () => {
    __registerConnectorForTest(
      fakeConnector('test-connector', async (job) => ({
        connectorId: 'test-connector',
        platform: 'tiktok',
        sourceUrl: job.url,
        externalId: null,
        title: null,
        captionText: null,
        candidateNames: [],
        locationHint: { city: null, country: null },
        coordinates: null,
        media: { thumbnailUrl: null },
        confidence: 0,
        connectorMetadata: {},
        extractedAt: new Date().toISOString(),
      }))
    );

    // A row shaped as if an earlier code path had written a private-host URL —
    // the intake itself would refuse this today, so this simulates a future
    // regression or an older release's row, exactly the case defense in depth
    // is for.
    const [{ id: importId }] = await harness.asAdmin(
      `INSERT INTO place_imports (user_id, url_hash, normalized_url, platform, status)
       VALUES ($1, 'deadbeef', 'http://169.254.169.254/latest/meta-data/', 'tiktok', 'queued')
       RETURNING id`,
      [ALICE]
    );

    const alice = harness.clientFor(ALICE);
    const result = await processImport(alice, ALICE, importId as string);
    expect(result).toMatchObject({ outcome: 'failed', status: 'failed' });
    expect(extractCalls).toBe(0);

    const [row] = await harness.rows('place_imports');
    expect(row.error_code).toBe('unsafe_url');
  });
});
