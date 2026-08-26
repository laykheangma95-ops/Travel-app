// ─────────────────────────────────────────────────────────────────────────────
// A "cancel the old one" ticket for async UI state, for the case two requests
// against the same piece of state can resolve out of order — a traveler
// switches /you/saved's destination filter while a "Load more" page is still
// in flight, or switches the filter twice in quick succession. Without this,
// whichever response happens to arrive LAST wins, not whichever request was
// started last — the exact bug this exists to close (Phase 12, MEDIUM-1,
// docs/SOCIAL-SAVE.md Part 15): a stale "Load more" page landing after a
// fresh filter's list replaced it, silently appending the wrong country's
// rows onto the screen.
//
// SAME SHAPE AS SocialLinkIntake.tsx's OWN `pollToken` — a plain incrementing
// counter, checked at resolution, never at the moment a request is sent (the
// generation can move between the two). Pulled into its own module, unlike
// `pollToken`, only because getting this race right is this fix's whole job:
// this repo's Vitest config has no JSX/React plugin, so a decision worth
// pinning down with a regression test has to live in a plain .ts module — the
// same reason lib/travel/importPollDecision.ts exists.
// ─────────────────────────────────────────────────────────────────────────────

export class RequestGeneration {
  private current = 0;

  /**
   * Start a new AUTHORITATIVE request — e.g. a fresh `load` after the filter
   * changed. Invalidates every request already in flight, including one that
   * already holds an earlier ticket from `next()` or `peek()`.
   */
  next(): number {
    this.current += 1;
    return this.current;
  }

  /**
   * Start a request that should be invalidated by a `next()` elsewhere (e.g.
   * `loadMore`) without itself becoming the new authority — two overlapping
   * `loadMore` calls do not need to invalidate one another, only a `load`.
   */
  peek(): number {
    return this.current;
  }

  /** True while `ticket` is still the current one — safe to apply its response. */
  isCurrent(ticket: number): boolean {
    return ticket === this.current;
  }
}
