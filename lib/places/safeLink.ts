// ─────────────────────────────────────────────────────────────────────────────
// safeWebsiteHref — the one gate a place's website must pass before it may
// become a clickable link.
//
// WHY THIS EXISTS: `places.website` (migration 013) is `TEXT` with no protocol
// CHECK. `lib/places/validation.ts`'s http(s)-only refinement only runs on the
// path that goes through `canonicalPlaceInput` — a direct PostgREST call (the
// anon key can INSERT and UPDATE a traveler's own `unverified` row) bypasses it
// entirely, and does today: a `javascript:` value written that way persists
// with no error. React renders a `javascript:` href with a console warning,
// not a refusal, so the render boundary — not the write path — is where this
// has to be stopped. app/place/[id]/page.tsx is the first and only place in
// this codebase that renders `places.website` as an anchor.
//
// Pure, no DOM, no network: testable without rendering the page.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The stored website value, unchanged, when it is safe to render as a
 * clickable `<a href>`. Otherwise null — never a `javascript:`, `data:`,
 * `vbscript:`, schemeless, or malformed value. http(s) only.
 */
export function safeWebsiteHref(value: string | null | undefined): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
}
