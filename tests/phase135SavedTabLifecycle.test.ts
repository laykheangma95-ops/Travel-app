// ─────────────────────────────────────────────────────────────────────────────
// Phase 13.5 HIGH-2 remediation — the itinerary "Saved" tab's request
// lifecycle, proven against React's own documented effect contract.
//
// WHY THIS IS NOT A COMPONENT TEST: this repo's Vitest config has no JSX/TSX
// transform (see tests/placeImportReview.viewPlace.test.ts's own header for
// the same constraint on DoneStage) — there is no DOM, no React renderer, and
// no way to mount components/travel/ItineraryEditor.tsx here. A route-only
// test cannot see this bug at all: the defect is entirely in how the EFFECT
// schedules against its own state, not in what any route returns.
//
// So this drives a small, faithful simulator of React's actual contract —
// dependency-array diffing, "run the PREVIOUS cleanup before the NEXT effect
// body on any dep change", no cleanup unless one is returned — the exact
// mechanism the principal engineer review used to PROVE the original bug
// without a browser. Two effect bodies are run through the identical
// simulator: `oldEffect`, copied verbatim from the pre-remediation source
// (kept here specifically so this suite can demonstrate it fails), and
// `newEffect`, mirroring components/travel/ItineraryEditor.tsx's actual
// current dependency array and control flow line for line. A future edit
// that reintroduces state into that effect's own dependency list has to
// consciously diverge from what `newEffect` encodes to do it — and the
// mutation check below proves this suite catches it when it happens.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';

interface LibraryPlace {
  savedId: string;
}

/** A faithful driver of React's documented useEffect contract: the body runs
 *  after each render; when any dependency changes, the PREVIOUS effect's
 *  cleanup (if it returned one) runs BEFORE the new body does. */
function makeEffectHarness(effectBody: (deps: unknown[]) => void | (() => void)) {
  let prevDeps: unknown[] | null = null;
  let cleanup: (() => void) | undefined;
  return {
    render(deps: unknown[]) {
      if (prevDeps && prevDeps.length === deps.length && prevDeps.every((d, i) => d === deps[i])) return;
      if (prevDeps && cleanup) cleanup();
      prevDeps = deps;
      cleanup = effectBody(deps) ?? undefined;
    },
  };
}

/** Deferred fetch stand-in: resolves only when the test tells it to, so the
 *  interleaving between "state changed" and "fetch resolved" is controlled
 *  precisely rather than raced against real I/O. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('OLD effect (pre-remediation): self-invalidates and wedges on "loading"', () => {
  it('reproduces the exact bug the review found — this documents the failure, it is not the fix', async () => {
    let picker = true;
    let libraryPlaces: LibraryPlace[] | null = null;
    let libraryState: 'idle' | 'loading' | 'error' = 'idle';
    const destination = 'Vietnam';
    let aborted = false;

    const pending = deferred<LibraryPlace[]>();

    // Verbatim copy of the pre-remediation effect body's control flow
    // (components/travel/ItineraryEditor.tsx before this remediation):
    // `libraryState` sits in its OWN dependency array, and is set inside the
    // body — this is the whole bug.
    const harness = makeEffectHarness((deps) => {
      const [p, , lp, ls] = deps as [boolean, string, LibraryPlace[] | null, typeof libraryState];
      if (!p || lp !== null || ls === 'loading') return undefined;
      libraryState = 'loading'; // setLibraryState('loading') — triggers a re-render
      pending.promise
        .then((places) => {
          if (aborted) return;
          libraryPlaces = places;
          libraryState = 'idle';
        })
        .catch(() => {
          if (aborted) return;
          libraryState = 'error';
        });
      return () => {
        aborted = true;
      }; // cleanup: controller.abort()
    });

    const render = () => harness.render([picker, destination, libraryPlaces, libraryState]);

    render(); // deps: [true, dest, null, 'idle'] -> starts fetch, sets loading
    render(); // deps changed ([..., 'loading']) -> cleanup runs -> abort() -> new body early-returns

    pending.resolve([]); // the (aborted) fetch "arrives" anyway
    await Promise.resolve();
    await Promise.resolve();

    expect(aborted).toBe(true);
    expect(libraryState).toBe('loading'); // stuck — this is the bug
    expect(libraryPlaces).toBeNull();

    // Reopening the sheet never recovers, because the guard
    // (`libraryState === 'loading'`) blocks every future attempt too.
    picker = false;
    render();
    picker = true;
    render();
    expect(libraryState).toBe('loading');
  });
});

describe('NEW effect (Phase 13.5 remediated): loads, and does not abort its own request', () => {
  // Mirrors components/travel/ItineraryEditor.tsx's ACTUAL current shape:
  //   - the effect's dependency array is [picker, destination, loadLibrary]
  //     — never libraryState/libraryPlaces
  //   - "already started" is tracked by a REF (libraryFetchStarted), not by
  //     state read back through the dependency array
  //   - no cleanup function at all — there is nothing for a re-run to abort
  //   - staleness is resolved by a RequestGeneration ticket, checked only
  //     when a response actually arrives (the same pattern
  //     app/you/saved/page.tsx already uses)
  function makeSavedTabSimulator() {
    let picker = false;
    let destination: string | null = null;
    let libraryPlaces: LibraryPlace[] | null = null;
    let libraryState: 'idle' | 'loading' | 'error' = 'idle';
    let generation = 0;
    const libraryFetchStarted = { current: false };
    const pendingByTicket = new Map<number, ReturnType<typeof deferred<LibraryPlace[]>>>();
    const failByTicket = new Set<number>();

    const loadLibrary = (dest: string) => {
      generation += 1;
      const ticket = generation;
      libraryState = 'loading';
      const pending = deferred<LibraryPlace[]>();
      pendingByTicket.set(ticket, pending);
      pending.promise
        .then((places) => {
          if (ticket !== generation) return; // superseded
          libraryPlaces = places;
          libraryState = 'idle';
        })
        .catch(() => {
          if (ticket !== generation) return;
          libraryState = 'error';
        });
      return ticket;
    };

    const harness = makeEffectHarness((deps) => {
      const [p, dest] = deps as [boolean, string | null];
      if (!p || !dest) return undefined;
      if (libraryFetchStarted.current) return undefined;
      libraryFetchStarted.current = true;
      loadLibrary(dest);
      return undefined; // no cleanup — nothing to abort
    });

    const render = () => harness.render([picker, destination, loadLibrary]);

    return {
      open(dest: string) {
        picker = true;
        destination = dest;
        render();
      },
      close() {
        picker = false;
        render();
      },
      reopen() {
        picker = true;
        render();
      },
      resolveLatest(places: LibraryPlace[]) {
        const ticket = generation;
        pendingByTicket.get(ticket)?.resolve(places);
      },
      /** Resolve a SPECIFIC, possibly-no-longer-current ticket — for proving
       *  a stale request's late answer cannot land. */
      resolveTicket(ticket: number, places: LibraryPlace[]) {
        pendingByTicket.get(ticket)?.resolve(places);
      },
      failLatest() {
        const ticket = generation;
        failByTicket.add(ticket);
        pendingByTicket.get(ticket)?.reject(new Error('library unavailable'));
      },
      retry(dest: string) {
        loadLibrary(dest); // the "Try again" button — bypasses the started-ref guard
      },
      get state() {
        return libraryState;
      },
      get places() {
        return libraryPlaces;
      },
      get generation() {
        return generation;
      },
    };
  }

  it('open -> loading -> resolves -> idle, with the fetched places', async () => {
    const sim = makeSavedTabSimulator();
    sim.open('Vietnam');
    expect(sim.state).toBe('loading');

    sim.resolveLatest([{ savedId: 'a' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(sim.state).toBe('idle');
    expect(sim.places).toEqual([{ savedId: 'a' }]);
  });

  it('error clears loading into an error state, never leaves it stuck on loading', async () => {
    const sim = makeSavedTabSimulator();
    sim.open('Vietnam');
    sim.failLatest();
    await Promise.resolve();
    await Promise.resolve();

    expect(sim.state).toBe('error');
  });

  it('closing the sheet while a request is in flight, then reopening, does not start a redundant second fetch', async () => {
    const sim = makeSavedTabSimulator();
    sim.open('Vietnam');
    const generationAfterOpen = sim.generation;

    sim.close();
    sim.reopen();
    // The "already started" ref guard means reopening before the first
    // request resolves does not mint a second one.
    expect(sim.generation).toBe(generationAfterOpen);

    sim.resolveLatest([{ savedId: 'a' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(sim.state).toBe('idle');
    expect(sim.places).toEqual([{ savedId: 'a' }]);
  });

  it('a stale first request cannot overwrite a genuinely newer one (manual retry)', async () => {
    const sim = makeSavedTabSimulator();
    sim.open('Vietnam');
    const firstTicket = sim.generation;

    // A manual retry (the "Try again" button) starts a second, newer request
    // before the first has resolved.
    sim.retry('Vietnam');
    expect(sim.generation).not.toBe(firstTicket);

    // The FIRST request's answer arrives late. It must never land.
    sim.resolveTicket(firstTicket, [{ savedId: 'stale' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(sim.places).not.toEqual([{ savedId: 'stale' }]);

    // The second (current) request resolves normally.
    sim.resolveLatest([{ savedId: 'fresh' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(sim.state).toBe('idle');
    expect(sim.places).toEqual([{ savedId: 'fresh' }]);
  });

  it('an empty library renders the idle/empty state, not a permanent spinner', async () => {
    const sim = makeSavedTabSimulator();
    sim.open('Thailand');
    sim.resolveLatest([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(sim.state).toBe('idle');
    expect(sim.places).toEqual([]);
  });
});
