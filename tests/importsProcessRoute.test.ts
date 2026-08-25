// ─────────────────────────────────────────────────────────────────────────────
// POST /api/imports/:id/process — the full request cycle.
//
// tests/importOrchestrator.test.ts proves the claim/connector/completion logic
// against real RLS. This proves the exported handler: auth is required, the
// dynamic segment is read correctly, ownership refusals become 404 rather than
// leaking whether someone else's job exists, and the response shape is what
// the client would read.
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
const TIKTOK_2 = 'https://www.tiktok.com/@chef/video/7311122233344455577';

let harness: Harness;
let currentUser: string | null = ALICE;

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => {
    if (!currentUser) throw new ApiError('UNAUTHORIZED', 'Please sign in.');
    return { id: currentUser };
  },
  supabaseFromRequest: () => (currentUser ? harness.clientFor(currentUser) : null),
}));

const { POST } = await import('@/app/api/imports/[id]/process/route');

function process(id: string) {
  return POST(
    new Request(`https://domner.test/api/imports/${id}/process`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.30' },
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
      title: null,
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
  // Geocoding off, so nothing in this file makes a real network call to
  // OpenStreetMap — matches tests/extractRoute.test.ts's own setup.
  vi.stubEnv('NOMINATIM_BASE_URL', '');
});

afterEach(() => {
  __resetConnectorsForTest();
  vi.unstubAllEnvs();
});

describe('processing a queued import', () => {
  it('completes it and returns the outcome', async () => {
    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup failed');

    const response = await process(queued.importId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'completed', outcome: 'ok' });
    expect(body.candidateCount).toBeGreaterThan(0);
  });
});

describe('the processing quota', () => {
  it('rejects a second run over the daily cap with a details.limit the client can key on', async () => {
    // Intake (assertWithinQuota) and processing (assertWithinProcessingQuota)
    // share the same PLACE_IMPORT_DAILY_QUOTA env var and the same
    // dailyImportQuota() reader, but count different things — rows created
    // vs. runs performed (docs/PLACE-IMPORT.md, "The quota is counted at the
    // point of spend"). Both jobs have to exist before the cap is lowered, or
    // the second createImportFromUrl would be rejected by the intake count
    // instead of exercising the processing count this test is about.
    const alice = harness.clientFor(ALICE);
    const first = await createImportFromUrl(alice, ALICE, TIKTOK);
    const second = await createImportFromUrl(alice, ALICE, TIKTOK_2);
    if (!first.ok || !second.ok) throw new Error('setup failed');

    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '1');

    const firstRun = await process(first.importId);
    expect(firstRun.status).toBe(200);

    const secondRun = await process(second.importId);
    expect(secondRun.status).toBe(429);
    const body = await secondRun.json();
    // This is the exact shape components/travel/SocialLinkIntake.tsx's
    // isProcessingQuotaError() (lib/travel/importPollDecision.ts) checks for
    // — proving the client's assumption against the real server contract,
    // not just a hand-written fixture.
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details.limit).toBe(1);

    // Rejected before the claim — the second job is still there to retry
    // tomorrow, not burned to 'failed'.
    const rows = await harness.rows('place_imports');
    const secondRow = rows.find((row) => row.id === second.importId);
    expect(secondRow?.status).toBe('queued');
  });
});

describe('authentication and isolation', () => {
  it('requires a signed-in traveler', async () => {
    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup failed');

    currentUser = null;
    const response = await process(queued.importId);
    expect(response.status).toBe(401);
  });

  it('refuses to process another traveler\'s job as 404, not 200 or 403', async () => {
    const alice = harness.clientFor(ALICE);
    const queued = await createImportFromUrl(alice, ALICE, TIKTOK);
    if (!queued.ok) throw new Error('setup failed');

    currentUser = BOB;
    const response = await process(queued.importId);
    expect(response.status).toBe(404);

    // Alice's job is untouched.
    const [row] = await harness.rows('place_imports');
    expect(row.status).toBe('queued');
  });

  it('a nonexistent id is 404', async () => {
    const response = await process('00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
  });
});
