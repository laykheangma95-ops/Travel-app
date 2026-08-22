// ─────────────────────────────────────────────────────────────────────────────
// What the real supabase-js client actually sends.
//
// tests/support/pgHarness.ts translates query-builder calls into SQL so the
// other suites can run against real Postgres. That translation is my reading of
// what `.or(...)`, `.ilike(...)`, `.in(...)` and an embedded select mean — and a
// harness that misreads them would agree with itself forever while production
// did something else.
//
// So this suite takes the genuine @supabase/supabase-js client, points it at a
// local server that records the request instead of answering it, and asserts the
// PostgREST call each query shape in lib/travel/savedPlaces.ts and the itinerary
// route produces. If a supabase-js upgrade changes how one of them is encoded,
// this is what notices.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface Captured {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: string;
}

let server: Server;
let client: SupabaseClient;
let captured: Captured[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk as Buffer));
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      captured.push({
        method: request.method ?? '',
        path: url.pathname,
        query: url.searchParams,
        headers: request.headers as Record<string, string>,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      // `.single()` asks for a bare object; anything else expects an array.
      const wantsObject = String(request.headers.accept ?? '').includes('pgrst.object');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(wantsObject ? '{}' : '[]');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  client = createClient(`http://127.0.0.1:${port}`, 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

beforeEach(() => {
  captured = [];
});

const only = () => {
  expect(captured).toHaveLength(1);
  return captured[0];
};

describe('the queries savePlaceForTraveler builds', () => {
  it('looks a place up by content_slug', async () => {
    await client.from('destination_places').select('id,category,destination').eq('content_slug', 'thailand:wat-pho').maybeSingle();

    const request = only();
    expect(request.method).toBe('GET');
    expect(request.path).toBe('/rest/v1/destination_places');
    expect(request.query.get('select')).toBe('id,category,destination');
    expect(request.query.get('content_slug')).toBe('eq.thailand:wat-pho');
  });

  it('encodes the open-trip filter as a single or= group', async () => {
    await client
      .from('trip_plans')
      .select('id,title,destination,end_date')
      .eq('user_id', 'user-1')
      .ilike('destination', 'Thailand')
      .or('end_date.is.null,end_date.gte.2026-08-22');

    const request = only();
    expect(request.query.get('user_id')).toBe('eq.user-1');
    expect(request.query.get('destination')).toBe('ilike.Thailand');
    // The harness splits this on commas into "IS NULL" / ">=" — which is only
    // correct because the two clauses arrive as one parenthesised group.
    expect(request.query.get('or')).toBe('(end_date.is.null,end_date.gte.2026-08-22)');
  });

  it('asks for a count without a body when head is set', async () => {
    await client
      .from('itinerary_places')
      .select('*', { count: 'exact', head: true })
      .eq('itinerary_day_id', 'day-1');

    const request = only();
    expect(request.method).toBe('HEAD');
    expect(request.headers.prefer).toContain('count=exact');
  });

  it('returns the inserted row when select() follows insert()', async () => {
    await client
      .from('itinerary_places')
      .insert({ itinerary_day_id: 'day-1', place_id: 'place-1', category: 'spot', sort_order: 0 })
      .select('id')
      .single();

    const request = only();
    expect(request.method).toBe('POST');
    // Without return=representation the insert would come back empty, and
    // addIdeaToTrip would report a failure on a row that was written fine.
    expect(request.headers.prefer).toContain('return=representation');
    expect(request.query.get('select')).toBe('id');
    expect(JSON.parse(request.body)).toMatchObject({ place_id: 'place-1', sort_order: 0 });
  });

  it('sends single() as a request for one object, not a list', async () => {
    await client.from('trip_plans').select('id,title').eq('id', 'trip-1').single();
    expect(only().headers.accept).toContain('pgrst.object');
  });
});

describe('the queries the itinerary route builds', () => {
  it('embeds the place on each itinerary row', async () => {
    await client
      .from('itinerary_places')
      .select('*, place:destination_places(*)')
      .in('itinerary_day_id', ['day-1', 'day-2'])
      .order('sort_order');

    const request = only();
    // The harness resolves this embed by <alias>_id; this is the encoding it is
    // resolving.
    expect(request.query.get('select')).toBe('*,place:destination_places(*)');
    expect(request.query.get('itinerary_day_id')).toBe('in.(day-1,day-2)');
    expect(request.query.get('order')).toBe('sort_order.asc');
  });

  it('orders descending and limits when finding the highest day_index', async () => {
    await client
      .from('itinerary_days')
      .select('day_index')
      .eq('trip_id', 'trip-1')
      .order('day_index', { ascending: false })
      .limit(1);

    const request = only();
    expect(request.query.get('order')).toBe('day_index.desc');
    expect(request.query.get('limit')).toBe('1');
  });

  it('sends update as PATCH and delete as DELETE, both filtered', async () => {
    await client.from('trip_plans').update({ is_public: true }).eq('id', 'trip-1');
    expect(captured[0].method).toBe('PATCH');
    expect(captured[0].query.get('id')).toBe('eq.trip-1');
    expect(JSON.parse(captured[0].body)).toEqual({ is_public: true });

    captured = [];
    await client.from('itinerary_places').delete().eq('id', 'place-1');
    expect(captured[0].method).toBe('DELETE');
    expect(captured[0].query.get('id')).toBe('eq.place-1');
  });
});

describe('what the harness must not get wrong', () => {
  it('reports a database refusal in the envelope rather than throwing', async () => {
    // supabase-js resolves with { data: null, error } on a 4xx. The harness
    // mirrors this; if it threw instead, every RLS test would be asserting the
    // wrong control flow.
    const { port } = server.address() as AddressInfo;
    const refusing = createServer((_request, response) => {
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'new row violates row-level security policy' }));
    });
    await new Promise<void>((resolve) => refusing.listen(port + 1, '127.0.0.1', resolve));

    const strict = createClient(`http://127.0.0.1:${port + 1}`, 'test-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await strict.from('destination_places').insert({ name: 'Wat Pho' });
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/row-level security policy/);

    await new Promise<void>((resolve, reject) =>
      refusing.close((error) => (error ? reject(error) : resolve()))
    );
  });
});
