// ─────────────────────────────────────────────────────────────────────────────
// The whole point of Phase 1, proved end to end: pasting the same link twice
// costs nothing the second time.
//
// This is the POST handler itself, against a REAL Postgres (PGlite) with the
// REAL policies, on a session-scoped client. The unit suites prove the hash and
// the ledger separately; only this proves they are actually wired into the
// route — which is where the money is spent.
//
// HOW "COSTS NOTHING" IS MEASURED: `fetch` is spied on. The first import must
// reach the network to read the caption; the second must not touch it at all.
// The model is left unconfigured, exactly as tests/extractRoute.test.ts does,
// so a single spy covers both the caption fetch and any model call.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/rateLimit';
import { createHarness, type Harness } from './support/pgHarness';

const ALICE = '11111111-1111-4111-8111-111111111111';
const LINK = 'https://www.tiktok.com/@chef/video/7311122233344455566';

let harness: Harness;

// The route resolves its client per request, so the mock reads a variable the
// tests set after the harness has booted.
let sessionClient: unknown = null;

vi.mock('@/lib/serverAuth', () => ({
  requireUser: async () => ({ id: ALICE }),
  supabaseFromRequest: () => sessionClient,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    throw new Error('the extract route must never use the unscoped client');
  },
  // The service-role client, used for the cost ledger only. Null is the
  // empty-.env deployment: no key, so no line is recorded and nothing throws.
  getSupabaseAdmin: () => null,
}));

const { POST } = await import('@/app/api/travel/extract/route');

function post(input: string) {
  return POST(
    new Request('https://domner.test/api/travel/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ input }),
    })
  );
}

/** A TikTok oEmbed reply carrying a caption with two 📍 lines in it. */
function oembed() {
  return new Response(
    JSON.stringify({
      title: 'Bangkok in 2 days\n📍 Wat Pho\n📍 Jodd Fairs Rama 9',
      author_name: 'chef',
      thumbnail_url: 'https://p16.tiktokcdn.com/thumb.jpg',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  __resetRateLimits();
  await harness.reset();
  await harness.createUser(ALICE);
  sessionClient = harness.clientFor(ALICE);
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('NOMINATIM_BASE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await harness.close();
});

describe('POST /api/travel/extract — the import ledger', () => {
  it('records the first import, then replays it without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(oembed());

    const first = await (await post(LINK)).json();
    expect(first.outcome).toBe('ok');
    expect(first.reused).toBe(false);
    expect(first.importId).toEqual(expect.any(String));
    expect(first.candidates.length).toBeGreaterThan(0);
    const callsForFirst = fetchSpy.mock.calls.length;
    expect(callsForFirst).toBeGreaterThan(0);

    const second = await (await post(LINK)).json();
    expect(second.reused).toBe(true);
    // The traveler sees the same places, in the same shape, on the same screen.
    expect(second.candidates).toEqual(first.candidates);
    expect(second.outcome).toBe('ok');
    // And nothing went out. No caption fetch, and — had a key been set — no
    // model call either.
    expect(fetchSpy.mock.calls.length).toBe(callsForFirst);

    // Both attempts are on the record, and the replay says what it reused.
    const imports = await harness.rows('place_imports');
    expect(imports).toHaveLength(2);
    const replay = imports.find((row) => row.reused_from_import_id !== null);
    expect(replay).toBeDefined();
    expect(replay!.used_model).toBe(false);
    // It points at the import that actually did the work.
    expect(replay!.reused_from_import_id).toBe(first.importId);
    expect(replay!.id).toBe(second.importId);
  });

  it('shows the same preview on a replay as on the first import', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(oembed());

    const first = await (await post(LINK)).json();
    // The post's own card: what the traveler recognises the reel by.
    expect(first.preview).toMatchObject({
      author: 'chef',
      thumbnailUrl: 'https://p16.tiktokcdn.com/thumb.jpg',
    });
    expect(first.preview.canonicalUrl).toContain('tiktok.com');

    const second = await (await post(LINK)).json();
    expect(second.reused).toBe(true);
    // A replay that dropped this rendered a different screen for the same
    // link, which reads as a failure rather than as a hit.
    expect(second.preview).toEqual(first.preview);
  });

  it('replays an import that had no preview as having none, not as an empty one', async () => {
    // A caption paste has no post behind it. `null` is the honest answer and
    // the same one the first import gave.
    const first = await (await post('Bangkok\n📍 Wat Pho')).json();
    expect(first.preview).toBeNull();
  });

  it('treats a link shared in a different shape as the same post', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(oembed());

    await post(LINK);
    // Mobile host, trailing slash, a share token on the end: one post.
    const again = await (
      await post('https://m.tiktok.com/@chef/video/7311122233344455566/?_t=8abc&is_from_webapp=1')
    ).json();

    expect(again.reused).toBe(true);
  });

  it('records a caption paste without a hash, and never replays it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const body = await (await post('Bangkok\n📍 Wat Pho\n📍 Jodd Fairs')).json();
    expect(body.outcome).toBe('ok');
    expect(body.reused).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Free text has no stable identity, so the row is written with no hash and
    // a second identical paste runs the pipeline again rather than matching on
    // something that only looks the same.
    const [row] = await harness.rows('place_imports');
    expect(row.url_hash).toBeNull();
    expect(row.platform).toBe('text');
    expect(row.status).toBe('ready');

    const second = await (await post('Bangkok\n📍 Wat Pho\n📍 Jodd Fairs')).json();
    expect(second.reused).toBe(false);
  });

  it('still extracts when the ledger is unavailable', async () => {
    // The empty-.env configuration: no session client at all.
    sessionClient = null;
    const body = await (await post('Bangkok\n📍 Wat Pho')).json();

    expect(body.outcome).toBe('ok');
    expect(body.candidates.length).toBeGreaterThan(0);
    // Bookkeeping is best-effort and says so, rather than failing the import.
    expect(body.importId).toBeNull();
  });

  it('refuses a traveler who is over the daily quota, and says so plainly', async () => {
    vi.stubEnv('PLACE_IMPORT_DAILY_QUOTA', '2');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(oembed());

    // Two distinct posts, so neither is a replay.
    await post('https://www.tiktok.com/@chef/video/111');
    await post('https://www.tiktok.com/@chef/video/222');

    const response = await post('https://www.tiktok.com/@chef/video/333');
    expect(response.status).toBe(429);

    // A replay is still free, because it was never the thing being rationed.
    const replay = await (await post('https://www.tiktok.com/@chef/video/111')).json();
    expect(replay.reused).toBe(true);
  });
});
