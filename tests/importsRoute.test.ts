// ─────────────────────────────────────────────────────────────────────────────
// POST /api/imports — the full request cycle.
//
// The unit suites prove the URL gate and the intake against real policies. This
// proves the exported handler: that auth is required, that the wire shape is
// what the client reads, that the platform is derived server-side and cannot be
// dictated, and that a refusal carries a code the UI can turn into a sentence.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits, RATE_LIMITS } from '@/lib/rateLimit';
import { ApiError } from '@/lib/http';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

let harness: Harness;
let currentUser: string | null = ALICE;

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => {
    if (!currentUser) throw new ApiError('UNAUTHORIZED', 'Please sign in.');
    return { id: currentUser };
  },
  supabaseFromRequest: () => (currentUser ? harness.clientFor(currentUser) : null),
}));

vi.mock('@/lib/supabase', () => ({
  // Configured, but the route must never use it: everything goes through the
  // caller's session client so RLS applies.
  getSupabase: () => ({}),
}));

const { POST } = await import('@/app/api/imports/route');

const TIKTOK = 'https://www.tiktok.com/@chef/video/7311122233344455566';

function post(body: unknown, ip = '203.0.113.20') {
  return POST(
    new Request('https://domner.test/api/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  currentUser = ALICE;
  await harness.reset();
  await harness.createUser(ALICE);
  await harness.createUser(BOB);
});

afterAll(async () => {
  await harness.close();
});

describe('accepting a link', () => {
  it('records it and answers with the job', async () => {
    const response = await post({ url: TIKTOK });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      platform: 'tiktok',
      status: 'queued',
      reused: false,
      alreadyQueued: false,
    });
    expect(body.importId).toEqual(expect.any(String));
    expect(await harness.rows('place_imports')).toHaveLength(1);
  });

  it('records a Xiaohongshu link without anything fetching it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const body = await (await post({ url: 'https://www.xiaohongshu.com/explore/64f0a1' })).json();

    expect(body.platform).toBe('xiaohongshu');
    expect(body.status).toBe('queued');
    // THE PHASE 3 PROPERTY: the intake records, it does not request. Nothing in
    // this path opens a socket — not for RED, not for anything.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is idempotent over HTTP', async () => {
    const first = await (await post({ url: TIKTOK })).json();
    const second = await (await post({ url: TIKTOK })).json();

    expect(second.importId).toBe(first.importId);
    expect(second.alreadyQueued).toBe(true);
    expect(await harness.rows('place_imports')).toHaveLength(1);
  });
});

describe('what the client may say', () => {
  it('refuses an unknown field rather than ignoring it', async () => {
    // .strict(). A body that is silently dropped teaches the next developer
    // that the field is supported.
    expect((await post({ url: TIKTOK, userId: BOB })).status).toBe(400);
    expect((await post({ url: TIKTOK, platform: 'tiktok' })).status).toBe(400);
    expect((await post({ url: TIKTOK, status: 'completed' })).status).toBe(400);
    expect(await harness.rows('place_imports')).toHaveLength(0);
  });

  it('cannot dictate the platform through the URL either', async () => {
    // A generic web link stays `web` however it is dressed up.
    const body = await (await post({ url: 'https://tiktok.com.evil.test/@a/video/1' })).json();
    expect(body.platform).toBe('web');
  });

  it('refuses a missing or malformed body', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ url: '' })).status).toBe(400);
    expect((await post({ url: 'not a url' })).status).toBe(400);
  });
});

describe('what the URL gate refuses, the route reports', () => {
  it('answers 400 with a reason the UI can switch on', async () => {
    for (const [url, reason] of [
      ['javascript:alert(1)', 'unsupported-protocol'],
      ['http://127.0.0.1/', 'private-host'],
      ['http://169.254.169.254/latest/meta-data/', 'private-host'],
      ['http://2130706433/', 'private-host'],
      ['http://[::1]/', 'private-host'],
      ['https://user:pass@example.com/', 'credentials-in-url'],
      ['http://example.com:6379/', 'blocked-port'],
    ] as const) {
      const response = await post({ url });
      const body = await response.json();
      expect({ url, status: response.status, reason: body.error?.details?.reason }).toEqual({
        url,
        status: 400,
        reason,
      });
    }
    expect(await harness.rows('place_imports')).toHaveLength(0);
  });
});

describe('authentication and isolation', () => {
  it('requires a signed-in traveler', async () => {
    currentUser = null;
    const response = await post({ url: TIKTOK });
    expect(response.status).toBe(401);
    expect(await harness.rows('place_imports')).toHaveLength(0);
  });

  it('files the job against the caller, whatever the body says', async () => {
    await post({ url: TIKTOK });
    expect((await harness.rows('place_imports'))[0].user_id).toBe(ALICE);
  });

  it('does not replay one traveler\'s import for another', async () => {
    await post({ url: TIKTOK });
    currentUser = BOB;
    const body = await (await post({ url: TIKTOK })).json();

    // Bob gets his own fresh job, and no hint that Alice's exists.
    expect(body.reused).toBe(false);
    expect(body.alreadyQueued).toBe(false);
    const rows = await harness.rows('place_imports');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.user_id).sort()).toEqual([ALICE, BOB].sort());
  });
});

describe('rate limiting', () => {
  it('refuses a burst from one client', async () => {
    // The tripWrite bucket, shared with every other travel write.
    const limit = RATE_LIMITS.tripWrite.limit;
    for (let attempt = 0; attempt < limit; attempt += 1) {
      const response = await post({ url: `https://www.tiktok.com/@a/video/${attempt}` });
      expect(response.status).toBe(200);
    }
    const refused = await post({ url: 'https://www.tiktok.com/@a/video/over' });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).not.toBeNull();
  });

  it('counts invalid URLs too, so a scanner is throttled like anybody else', async () => {
    const limit = RATE_LIMITS.tripWrite.limit;
    for (let attempt = 0; attempt < limit; attempt += 1) {
      // Every one of these is refused by the URL gate — and still consumes the
      // allowance, because probing is exactly what the limit is for.
      await post({ url: `http://127.0.0.${attempt % 250}/` });
    }
    expect((await post({ url: TIKTOK })).status).toBe(429);
  });

  it('applies the daily quota on top of the burst limit', async () => {
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '2');
    await post({ url: 'https://www.tiktok.com/@a/video/1' });
    await post({ url: 'https://www.tiktok.com/@a/video/2' });

    const response = await post({ url: 'https://www.tiktok.com/@a/video/3' });
    expect(response.status).toBe(429);
    vi.unstubAllEnvs();
  });
});
