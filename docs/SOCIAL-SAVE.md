# Social Save + AI Place Intelligence — architecture report

**Status: report only. No code has been changed by this document.**

This is the pre-implementation report required by CLAUDE.md §6 ("before coding,
always report first") for the Social Save + AI Place Intelligence brief. It
states what already exists, what the brief asks for that does not exist, what
each phase would touch, and the risks. Nothing is built until the owner names a
phase.

---

## 1. Architecture discovered

**Framework and routing.** Next.js 14 App Router at the repo root (the live
storefront — see CLAUDE.md §8; `apps/*` and `packages/*` are empty scaffolds and
are *not* the target here). Route handlers under `app/api/**`, all wrapped by
`route()` / `ok()` / `ApiError` from `lib/http.ts`, which give every endpoint a
request id, structured errors and a uniform JSON envelope.

**Auth.** Supabase Auth. `requireUser(request)` in `lib/serverAuth.ts` on the
server; RLS is the real boundary. `lib/supabase.ts` returns `null` when unconfigured
(CLAUDE.md §11 — the app must run with an empty `.env`).

**Database.** Supabase Postgres. `supabase/schema.sql` plus numbered migrations
`001`–`011`. RLS is on for every travel table, owner-scoped by `auth.uid()`.

**The place/trip model that exists today:**

| Table | Role |
|---|---|
| `trip_plans` | A traveler's trip. `is_wishlist` marks one auto-created by a save. |
| `itinerary_days` | `day_index 0` is the private **Ideas** holding area; 1..n are days. |
| `itinerary_places` | A place placed on a day, with order, time and notes. |
| `destination_places` | The place catalogue. `created_by NULL` = editorial, else traveler-owned. `source ∈ {editorial, ai_generated}`, `content_slug` for guide dedupe, optional `opening_hours`/`timezone`. |

**The import pipeline that already exists** (documented in `docs/PLACE-IMPORT.md`):

```
paste / share-sheet  →  /import  →  POST /api/travel/extract  (writes nothing)
   socialLink.ts     classify + strip tracking params
   mapsResolve.ts    Google Maps link → exact coordinates (no model)
   linkPreview.ts    oEmbed / OpenGraph caption fetch, SSRF-guarded allowlist
   placeAgent.ts     Claude extraction (optional, degrades)
   placeExtraction.ts deterministic fallback + normaliseCandidate (the only door)
   geocode.ts        Nominatim, 1 req/s, capped at 8 per import
        ↓ user ticks candidates ↓
POST /api/travel/places/import  →  placeImport.ts  →  savedPlaces.addIdeaToTrip
```

Supporting: `lib/rateLimit.ts` (in-process token buckets), `lib/logger.ts`
(structured), `lib/travel/state.ts`, `itinerary.ts`, `trips.ts`, `tripWrites.ts`.
Tests already cover extraction, social links, link preview SSRF, maps links, saved
places and their RLS (`tests/*.test.ts`).

**Conclusion: roughly the top half of the brief's target architecture is built.**
Ingestion → AI extraction → candidates → confirmation → saved place all exist and
work. Rule 11 applies hard: none of it should be rebuilt.

---

## 2. Gap analysis against the brief

| Brief layer | Today | Gap |
|---|---|---|
| Import API | `POST /api/travel/extract` | Exists. Stateless. |
| **Import Job** | none | **Missing.** Extraction is synchronous inside one request (`maxDuration = 60`). Nothing is persisted, so nothing can be resumed, retried, audited or reused. |
| Content ingestion | `linkPreview.ts` | Exists, SSRF-guarded. No screenshot/OCR path. |
| AI extraction | `placeAgent.ts` | Exists. Single model, no cheap-first/escalate tier. |
| **Candidate places** | in-memory `PlaceCandidate[]` | **Missing as data.** Candidates die with the HTTP response. |
| **Place resolver** | `geocode.ts` (Nominatim) | Partial. Geocoding is not place resolution: no provider place id, no rating/hours, no canonical identity. |
| **Trusted places provider** | none | **Missing.** No Google Places / Mapbox adapter, no provider-id mapping. |
| **Confidence scoring** | `AUTO_SELECT_CONFIDENCE = 0.55` | Exists only as a UI tick threshold; not persisted, not resolver-aware. |
| User confirmation | `/import` review screen | Exists. |
| **Canonical place registry** | `destination_places` | Partial. Dedupe is by *name string per owner*; two travelers importing the same restaurant create two unrelated rows. No canonical `place_id`, no geo-proximity dedupe, no external id map. |
| Saved places | Ideas list (`day_index 0`) | Exists, but a save is always trip-bound; there is no trip-independent saved-place record. |
| **Collections** | none | **Missing.** |
| **Ratings / stats / save counts** | none | **Missing.** No `place_ratings`, no `place_stats`. |
| **Place sources (provenance)** | none | **Missing.** The TikTok URL a place came from is never stored. |
| Trips / trip places | `trip_plans`, `itinerary_*` | Exists. |
| **Verification tiers** | `source ∈ {editorial, ai_generated}` | **Missing the distinction the brief calls critical**: AI candidate vs provider-verified vs publicly safe. `ai_generated` currently conflates all three. |
| **Cost control** | per-user rate limit on `extract` only | **Mostly missing.** No URL hashing, no duplicate-import detection, no result reuse, no resolved-place reuse, no per-user quota, no usage log. Re-pasting the same TikTok link pays for a full model call every time. |

---

## 3. Proposed phasing

Each phase is independently shippable and additive. **Only one gets built per
instruction.**

**Phase 1 — Persistence + cost control (recommended first).**
Turn the stateless pipeline into a recorded one, and stop paying twice for the
same link. New tables `place_imports`, `import_candidates`, `place_sources`,
`ai_usage_log`; normalized-URL SHA-256 hashing in `socialLink.ts`; reuse of a
completed import for the same hash; per-user daily quota. `/api/travel/extract`
keeps its request and response shape exactly — the UI needs no change — and
gains an `importId`. Nothing about saving or the itinerary moves.

**Phase 2 — Canonical place registry + verification tiers.**
`places` canonical registry with `place_external_ids`, geo-proximity + name
dedupe, and a `verification` enum (`ai_candidate` / `provider_verified` /
`domner_public`). `destination_places` gains a nullable `canonical_place_id` and
is backfilled; it is not replaced and no row is dropped (rule 12).

**Phase 3 — Trusted places provider adapter.**
A `services/places-provider/` interface with a Google Places adapter behind a
server-only key, timeouts, retries, structured logging and a resolved-place
cache. Ships disabled without the key; Nominatim stays the fallback.

**Phase 4 — Saved places, collections, ratings, stats.**
Trip-independent `saved_places`, `collections`, `place_ratings`, aggregated
`place_stats` (counts only — no exposure of who saved what).

**Phase 5 — Screenshot/OCR ingestion, and the trip generator reading the flywheel.**

---

## 4. Risks

1. **Locked areas.** Auth, customer identity and eSIM QR delivery are locked
   (`docs/LOCKED.md`). No phase above needs to touch them; if one turns out to,
   it stops and asks.
2. **Live checkout.** None of these phases touch orders, payments or fulfilment.
   That separation is a hard constraint, not a preference.
3. **SSRF surface.** Any new fetch path (provider adapter, screenshot fetch)
   inherits the exact-match-allowlist + re-check-every-redirect rule. Widening an
   allowlist is an owner decision, as `docs/PLACE-IMPORT.md` records for `goo.gl`.
4. **Cost.** A places provider has a bill attached. Phase 3 is gated on the
   owner accepting it; Phase 1 is what makes that bill predictable.
5. **Privacy.** Provenance rows name the submitter. They must never be publicly
   readable; analytics stay aggregated.
6. **Migration ordering.** Phase 2's canonical registry must land after Phase 1's
   provenance tables, or the backfill has nothing to attribute rows to.

---

## 5. Decisions needed from the owner

1. Which phase to build now (recommendation: Phase 1).
2. Whether a paid Places provider is approved in principle (affects Phase 2/3
   design, not Phase 1).
3. Whether a saved place may ever exist outside a trip (Phase 4 assumes yes).
