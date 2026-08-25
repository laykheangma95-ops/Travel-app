// ─────────────────────────────────────────────────────────────────────────────
// GET /api/imports/:id — the full request cycle.
//
// tests/importJobs.rls.test.ts proves loadImportForReview() against real RLS.
// This proves the exported handler: auth is required, the dynamic segment is
// read correctly, ownership refusals become 404 rather than leaking whether
// someone else's job exists, and the response shape is what a polling client
// would read at each stage of the job's life.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/http';
import { createImportFromUrl } from '@/lib/travel/importIntake';
import {
  __registerConnectorForTest,
  __resetConnectorsForTest,
} from '@/lib/connectors/places/registry';
import type { PlaceConnector } from '@/lib/connectors/places/types';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const TIKTOK = 'https://www.tiktok.com/@chef/video/7311122233344455566';
// Recognised and recorded by the intake, but no connector reads Xiaohongshu
// (docs/PLACE-IMPORT.md, "Classification is not permission to fetch") — a
// deterministic way to reach `failed` with no network dependency, rather than
// depending on tiktok.com's real oEmbed endpoint refusing us.
const RED = 'https://www.xiaohongshu.com/explore/64f0a1b2c3d4e5';

let harness: Harness;
let currentUser: string | null = ALICE;

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => {
    if (!currentUser) throw new ApiError('UNAUTHORIZED', 'Please sign in.');
    return { id: currentUser };
  },
  supabaseFromRequest: () => (currentUser ? harness.clientFor(currentUser) : null),
}));

const { GET } = await import('@/app/api/imports/[id]/route');
const { POST: processImport } = await import('@/app/api/imports/[id]/process/route');

function getImport(id: string) {
  return GET(
    new Request(`https://domner.test/api/imports/${id}`, {
      headers: { 'x-forwarded-for': '203.0.113.31' },
    }),
    { params: { id } }
  );
}

function process(id: string) {
  return processImport(
    new Request(`https://domner.test/api/imports/${id}/process`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.31' },
    }),
    { params: { id } }
  );
}

const noopConnector: PlaceConnector = {
  id: 'noop',
  platforms: ['tiktok'],
  isConfigured: () => true,
  async extract(job) {
    return {
      connectorId: 'noop',
      platform: 'tiktok',
      sourceUrl: job.url,
      externalId: null,
      title: 'A day in Bangkok',
      captionText: '📍 Wat Pho',
      candidateNames: [],
      locationHint: { city: null, country: null },
      coordinates: null,
      media: { thumbnailUrl: null },
      confidence: 0.6,
      connectorMetadata: {},
      extractedAt: new Date().toISOString(),
    };
  },
};

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  currentUser = ALICE;
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
  __registerConnectorForTest(noopConnector);
  vi.stubEnv('NOMINATIM_BASE_URL', '');
});

afterEach(() => {
  __resetConnectorsForTest();
  vi.unstubAllEnvs();
});

describe('reading a job at each stage', () => {
  it('a freshly queued job has no candidates yet', async () => {
    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup failed');

    const response = await getImport(queued.importId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'queued', candidateCount: 0, candidates: [] });
  });

  it('a completed job returns its candidates and preview', async () => {
    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup failed');

    const processed = await process(queued.importId);
    expect(processed.status).toBe(200);

    const response = await getImport(queued.importId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('completed');
    expect(body.outcome).toBe('ok');
    expect(body.candidateCount).toBeGreaterThan(0);
    expect(body.candidates.length).toBe(body.candidateCount);
    expect(body.preview).toMatchObject({ title: 'A day in Bangkok' });
    // The noop connector's caption goes through the deterministic extractor,
    // not the model, so this mirrors what a real basic-mode job would report.
    expect(body.usedModel).toBe(false);
  });

  it('a failed job reports failed with no candidates, not an error', async () => {
    const alice = harness.clientFor(ALICE);
    // No connector reads Xiaohongshu, so this fails cleanly with no_connector
    // regardless of the registry's real contents — deterministic, no network.
    const queued = await createImportFromUrl(alice, ALICE, RED);
    if (!queued.ok) throw new Error('setup failed');

    const processed = await process(queued.importId);
    expect(processed.status).toBe(200);

    const response = await getImport(queued.importId);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'failed', candidateCount: 0, candidates: [] });
  });
});

describe('authentication and isolation', () => {
  it('requires a signed-in traveler', async () => {
    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup failed');

    currentUser = null;
    const response = await getImport(queued.importId);
    expect(response.status).toBe(401);
  });

  it('refuses to read another traveler\'s job as 404, not 200 or 403', async () => {
    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup failed');

    currentUser = BOB;
    const response = await getImport(queued.importId);
    expect(response.status).toBe(404);
  });

  it('a nonexistent id is 404', async () => {
    const response = await getImport('00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
  });
});

describe('this route never writes', () => {
  it('polling a queued job repeatedly does not change its status', async () => {
    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup failed');

    await getImport(queued.importId);
    await getImport(queued.importId);
    await getImport(queued.importId);

    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('queued');
  });
});
