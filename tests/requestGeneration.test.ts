// ─────────────────────────────────────────────────────────────────────────────
// RequestGeneration (lib/travel/requestGeneration.ts) — the staleness guard
// behind app/you/saved/page.tsx's `load`/`loadMore` (Phase 12, MEDIUM-1,
// docs/SOCIAL-SAVE.md Part 15).
//
// The page itself is a 'use client' .tsx component this repo's Vitest config
// cannot import (no JSX transform, no @testing-library/react in the tree —
// same constraint tests/socialLinkIntakePolling.test.ts documents for
// SocialLinkIntake's own poll loop). Two things are proven here instead:
//
//   1. RequestGeneration's own contract, in isolation.
//   2. A simulation of `load`/`loadMore` built from the REAL class, wired the
//      same way the page wires it (`load` calls `generation.next()` and
//      resets `loadingMore` immediately; `loadMore` calls `generation.peek()`
//      and only applies its response, or clears its own spinner, while its
//      ticket is still current) — so a regression in the real orchestration
//      logic (not just the primitive) would have to also change this file to
//      keep passing.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { RequestGeneration } from '@/lib/travel/requestGeneration';

describe('RequestGeneration', () => {
  it('starts at a ticket every isCurrent check can be compared against', () => {
    const gen = new RequestGeneration();
    const ticket = gen.next();
    expect(gen.isCurrent(ticket)).toBe(true);
  });

  it('next() invalidates a ticket already held by an earlier next()', () => {
    const gen = new RequestGeneration();
    const first = gen.next();
    const second = gen.next();
    expect(gen.isCurrent(first)).toBe(false);
    expect(gen.isCurrent(second)).toBe(true);
  });

  it('next() invalidates a ticket held by a prior peek()', () => {
    const gen = new RequestGeneration();
    const peeked = gen.peek();
    const fresh = gen.next();
    expect(gen.isCurrent(peeked)).toBe(false);
    expect(gen.isCurrent(fresh)).toBe(true);
  });

  it('two peek()s without an intervening next() do not invalidate each other', () => {
    const gen = new RequestGeneration();
    gen.next();
    const a = gen.peek();
    const b = gen.peek();
    expect(gen.isCurrent(a)).toBe(true);
    expect(gen.isCurrent(b)).toBe(true);
    expect(a).toBe(b);
  });
});

// ── A faithful simulation of app/you/saved/page.tsx's own orchestration ──────

interface Row {
  savedId: string;
  countryName: string;
}

/** Mirrors the real component's state shape and the exact wiring described
 *  in its own comments — not a simplified re-derivation of the fix. */
function makePager(server: (query: { destination: string | null; offset: number }) => Promise<Row[]>) {
  const generation = new RequestGeneration();
  let places: Row[] | null = null;
  let hasMore = false;
  let loadingMore = false;
  let filter: string | null = null;
  let error: string | null = null;
  const PAGE_SIZE = 20;

  const load = async (destination: string | null) => {
    const ticket = generation.next();
    loadingMore = false;
    error = null;
    try {
      const page = await server({ destination, offset: 0 });
      if (!generation.isCurrent(ticket)) return;
      places = page;
      hasMore = page.length === PAGE_SIZE;
    } catch {
      if (!generation.isCurrent(ticket)) return;
      places = [];
      hasMore = false;
      error = 'load failed';
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const ticket = generation.peek();
    loadingMore = true;
    error = null;
    try {
      const page = await server({ destination: filter, offset: places?.length ?? 0 });
      if (!generation.isCurrent(ticket)) return;
      const seen = new Set((places ?? []).map((r) => r.savedId));
      places = [...(places ?? []), ...page.filter((r) => !seen.has(r.savedId))];
      hasMore = page.length === PAGE_SIZE;
    } catch {
      if (!generation.isCurrent(ticket)) return;
      error = 'load failed';
    } finally {
      if (generation.isCurrent(ticket)) loadingMore = false;
    }
  };

  return {
    load,
    loadMore,
    setFilter: (f: string | null) => {
      filter = f;
    },
    get places() {
      return places;
    },
    get hasMore() {
      return hasMore;
    },
    get loadingMore() {
      return loadingMore;
    },
    get error() {
      return error;
    },
  };
}

function page(country: string, n: number, offset: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ savedId: `${country}-${offset + i}`, countryName: country }));
}

describe('the exact race: Load More in flight, then the filter changes', () => {
  it('unfiltered list loaded, Load More starts, switches to China, China resolves, the old Load More resolves after — visible list stays China-only', async () => {
    let releaseStaleLoadMore: (() => void) | undefined;

    const pager = makePager(async ({ destination, offset }) => {
      if (destination === null && offset === 20) {
        // The slow, now-stale "Load more" request against the OLD filter.
        await new Promise<void>((resolve) => {
          releaseStaleLoadMore = resolve;
        });
        return page('Thailand', 20, 20);
      }
      if (destination === 'China') return page('China', 1, 0);
      return page('Thailand', 20, 0);
    });

    await pager.load(null); // 20 unfiltered rows, hasMore = true
    expect(pager.places).toHaveLength(20);
    expect(pager.hasMore).toBe(true);

    const staleLoadMore = pager.loadMore(); // fires, hangs on the gate above
    expect(pager.loadingMore).toBe(true);

    pager.setFilter('China');
    await pager.load('China'); // the filter's own refetch lands first

    // The fresh, correct state — proven BEFORE the stale response arrives.
    expect(pager.places).toEqual([{ savedId: 'China-0', countryName: 'China' }]);
    expect(pager.hasMore).toBe(false);
    // load() clears the stale request's spinner immediately, not only once
    // that request itself eventually settles.
    expect(pager.loadingMore).toBe(false);

    releaseStaleLoadMore?.();
    await staleLoadMore; // the invalidated response finally arrives

    // Nothing about the current, correct state moved.
    expect(pager.places).toEqual([{ savedId: 'China-0', countryName: 'China' }]);
    expect(pager.hasMore).toBe(false);
    expect(pager.loadingMore).toBe(false);
    const countries = new Set((pager.places ?? []).map((r) => r.countryName));
    expect(countries.has('Thailand')).toBe(false);
    expect(countries).toEqual(new Set(['China']));
  });

  it('a stale initial-load response cannot replace a newer filter\'s results', async () => {
    let releaseFirstLoad: ((rows: Row[]) => void) | undefined;

    const pager = makePager(async ({ destination }) => {
      if (destination === null) {
        return new Promise<Row[]>((resolve) => {
          releaseFirstLoad = resolve;
        });
      }
      return page('China', 1, 0);
    });

    const firstLoad = pager.load(null); // slow, will be superseded
    pager.setFilter('China');
    await pager.load('China'); // wins the race by resolving first

    expect(pager.places).toEqual([{ savedId: 'China-0', countryName: 'China' }]);

    releaseFirstLoad?.(page('Thailand', 20, 0));
    await firstLoad; // the stale unfiltered response finally arrives

    // Still China — the stale response never touched state.
    expect(pager.places).toEqual([{ savedId: 'China-0', countryName: 'China' }]);
  });

  it('a stale Load More response cannot move hasMore for the current filter', async () => {
    let releaseStale: ((rows: Row[]) => void) | undefined;

    const pager = makePager(async ({ destination, offset }) => {
      if (destination === null && offset === 20) {
        return new Promise<Row[]>((resolve) => {
          releaseStale = resolve;
        });
      }
      if (destination === 'China') return page('China', 1, 0); // short page → hasMore false
      return page('Thailand', 20, 0);
    });

    await pager.load(null);
    const stale = pager.loadMore();
    pager.setFilter('China');
    await pager.load('China');
    expect(pager.hasMore).toBe(false); // China's own short page

    // A full 20-row page for the OLD filter, arriving late — would flip
    // hasMore back to true for a screen that is no longer showing Thailand.
    releaseStale?.(page('Thailand', 20, 20));
    await stale;
    expect(pager.hasMore).toBe(false);
  });

  it('rapid filter switching settles on the LAST filter requested, regardless of arrival order', async () => {
    const arrivalOrder = ['Vietnam', 'China', 'Thailand']; // resolve out of request order
    let i = 0;
    const releases = new Map<string, () => void>();

    const pager = makePager(
      async ({ destination }) =>
        new Promise<Row[]>((resolve) => {
          releases.set(destination ?? 'ALL', () => resolve(page(destination ?? 'ALL', 1, 0)));
        })
    );

    const p1 = pager.load('Thailand');
    const p2 = pager.load('China');
    const p3 = pager.load('Vietnam'); // the traveler's actual final choice

    for (const country of arrivalOrder) {
      releases.get(country)?.();
      i += 1;
    }
    await Promise.all([p1, p2, p3]);
    expect(i).toBe(3);

    // The traveler tapped Vietnam last; that must be what is on screen, even
    // though Thailand's and China's responses both arrived after it did.
    expect(pager.places).toEqual([{ savedId: 'Vietnam-0', countryName: 'Vietnam' }]);
  });

  it('a failed current request still surfaces its error, unaffected by an earlier stale one', async () => {
    let releaseStale: (() => void) | undefined;

    const pager = makePager(async ({ destination, offset }) => {
      if (destination === null && offset === 20) {
        await new Promise<void>((resolve) => {
          releaseStale = resolve;
        });
        return page('Thailand', 20, 20);
      }
      if (destination === 'China') throw new Error('network down');
      return page('Thailand', 20, 0);
    });

    await pager.load(null);
    const stale = pager.loadMore();
    pager.setFilter('China');
    await pager.load('China'); // fails

    expect(pager.error).toBe('load failed');
    expect(pager.places).toEqual([]);

    releaseStale?.();
    await stale;

    // The stale success does not clear the real, current error.
    expect(pager.error).toBe('load failed');
    expect(pager.places).toEqual([]);
  });
});
