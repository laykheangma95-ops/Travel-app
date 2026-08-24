# Social Save + AI Place Intelligence — architecture audit & implementation plan

**Status: audit only. No production behaviour is changed by this document.**
The only files it touches are itself and the docs index in `CLAUDE.md`.

Required by CLAUDE.md §6 ("before coding, always report first"). It answers
three questions: what is actually in this repository, what of it can be reused,
and what is the safest additive path to
**Social Save → AI Place Extraction → Place Verification → Saved Places →
Domner Place Database**.

---

## Part 1 — Architecture audit

### 1.1 Application structure

Next.js **14.2.35**, App Router, TypeScript, at the **repo root** (`app/`,
`lib/`, `components/`). This is the live storefront and the target of this work.

`apps/*` and `packages/*` are npm-workspace scaffolds from an unrelated platform
migration, mostly empty (CLAUDE.md §8), and are **excluded from the root
`tsconfig.json`**. Nothing in this plan goes there — putting Social Save in
`apps/` would inherit two unresolved owner decisions and a `_staging/` directory
that does not exist.

### 1.2 Frontend routing

Route groups `(auth)`, `(dashboard)`, `(legal)` plus flat public routes. The
travel surface: `/trips`, `/trips/[tripId]/itinerary`, `/trips/new`, `/explore`,
`/destination/[slug]`, `/import`, `/share/trip/[token]`, `/share/maps-link`,
`/you`, `/updates`.

`app/import/page.tsx` is **43 lines** — a thin shell over a client component. The
importer UI is already the right shape to extend without a redesign.

### 1.3 API / server architecture

Every route handler is wrapped by `route()` in `lib/http.ts`, which supplies:

- a per-request `requestId`, echoed into every log line and every response;
- optional declarative rate limiting (`{ rateLimit: 'tripWrite' }`);
- one place where `ApiError`, `ConfigurationError` and `PricingError` become
  correct status codes, and anything unexpected becomes a 500 — never a 200
  with partial data.

Responses go through `ok<T>()`; input through `readJson()` + **Zod** schemas
(`.strict()` on the import routes). `runtime = 'nodejs'` and
`dynamic = 'force-dynamic'` on the travel routes; `maxDuration = 60` on
`/api/travel/extract`.

**This wrapper is the single most reusable asset in the audit.** Every new
endpoint below is a `route()` handler and gets logging, error mapping and rate
limiting for free.

### 1.4 Supabase configuration

`lib/supabase.ts` exposes `getSupabase()` (anon, returns `null` unconfigured)
and `getSupabaseAdmin()` (service key). `lib/serverAuth.ts` exposes
`supabaseFromRequest()` — a **per-request client carrying the caller's JWT**, so
RLS applies. Migrations are numbered SQL files in `supabase/migrations/`
(`001`–`011`) with `supabase/schema.sql` as the base. Region `sin1`
(`vercel.json`), matching the Singapore database move runbook.

**The convention to follow:** feature code takes a `SupabaseClient` parameter
and never reaches for the admin client. `lib/travel/placeImport.ts` documents
why in its header — handing it a service-role client would silently switch off
every policy (rule 3).

### 1.5 Authentication

Supabase Auth. `requireUser(request)` for travelers; `requireStaff`,
`requirePermission`, `requireAdmin`, `verifyServiceToken` and
`requireAdminOrService` for staff and scheduled jobs. `middleware.ts` refreshes
the session cookie and gates `/admin` and the dashboard prefixes **before any
HTML is sent** — explicitly documented as defence in depth, not the boundary.

Auth is a **locked area** (`docs/LOCKED.md`). Nothing in this plan modifies it;
everything reuses `requireUser()`.

### 1.6 User tables

`profiles` (id → `auth.users`, name, email, phone, `passport_country`,
`preferred_language km|en`, `role customer|support|admin`), extended by
migration `001` with `phone_verified_at`, `email_verified_at`, `auth_providers`,
plus `recovery_codes` and `otp_attempts`. Staff live separately in `staff_users`
/ `staff_events` (migration `004`, `docs/STAFF-ROLES.md`).

**Reuse:** every new user-owned table references `auth.users(id)` — the pattern
migration `009` already used for `destination_places.created_by`.

### 1.7 Existing place-related tables

| Table | Shape |
|---|---|
| `destination_places` | `id, destination, name, category(spot\|food\|shopping\|transport\|other), lat, lng, description, photo_url, source(editorial\|ai_generated), created_at, created_by, opening_hours jsonb, timezone, content_slug` |
| `itinerary_days` | `trip_id, day_index (0 = private Ideas), date, theme` |
| `itinerary_places` | `itinerary_day_id, place_id → destination_places, category, time_start, time_end, notes, sort_order` |
| `trip_plans` | `user_id, title, destination, dates, travelers, budget, interests, generated_itinerary, is_public, share_token, is_wishlist` |

Indexes exist on `(destination, category, name)`, plus partial uniques for
editorial names and per-owner names, and an owner index. RLS: editorial rows are
readable by any authenticated user, traveler rows only by their owner; writes
are confined to `created_by = auth.uid()`.

**This is the table the canonical registry must extend, not replace.** It holds
live editorial seed data (`supabase/seeds/destination_places.sql`) and traveler
rows; rule 12 forbids dropping it.

### 1.8 Itinerary architecture

`day_index 0` is a private Ideas holding area; days 1..n are the plan.
`lib/travel/itinerary.ts`, `savedPlaces.ts` (`addIdeaToTrip`), `tripWrites.ts`,
`smartDraft.ts` (deterministic day-drafting — **not** an LLM), `trips.ts`,
`tripSeed.ts`, `context.ts`, `state.ts`. `POST /api/travel/itinerary/[tripId]/generate`
reports `strategy: 'smart-draft'` and leaves Ideas untouched.

### 1.9 Saved / favourite functionality

There is **no `saved_places` table**. "Saved" means: a `destination_places` row
(found or created) referenced from the trip's Ideas day.
`savePlaceForTraveler()` resolves a guide `content_slug`, finds or creates the
trip for that country, and can return `needsChoice` — writing nothing — when
"which trip?" is genuinely ambiguous. `POST /api/travel/places/save` and
`POST /api/travel/places/import` are the two write doors.

**Consequence for this brief:** a save is always trip-bound today. A
trip-independent saved place is genuinely new (Phase 4), and is the one place
where a new table is unavoidable.

### 1.10 Map integrations

**Leaflet + OpenStreetMap** (`leaflet ^1.9.4`, `@types/leaflet`), used in
`components/travel/ItineraryEditor.tsx` and the flight map/globe (`three`,
`gsap`). Geocoding is **Nominatim** via `lib/travel/geocode.ts`: HTTPS-only,
5s timeout, a process-wide 1.1s floor between calls, capped at 8 lookups per
import, and disabled entirely by `NOMINATIM_BASE_URL=""`.

**No Google Maps SDK, no Mapbox, no billing relationship with a map vendor.**
That is a deliberate low-lock-in position and this plan preserves it.

### 1.11 Environment variables

`lib/env.ts` is the single source of truth: a `required` map per service,
`missingVars()`, `isConfigured()`, `assertConfigured()` and `configReport()`
(surfaced by `/api/health`). The rule it enforces: demo fallbacks are a
development convenience, and **in production a missing key is an outage, never a
discount** — written after a missing env var turned checkout into a free vending
machine. `DOMNER_ALLOW_DEMO` is the explicit staging escape hatch.

Place-related today: `ANTHROPIC_API_KEY`, `ANTHROPIC_PLACE_MODEL`,
`NOMINATIM_BASE_URL` — all read inside functions, never at module scope, so
tests can stub them.

### 1.12 PWA configuration

`public/manifest.webmanifest` + `public/sw.js` + `public/offline.html`, with
`next.config.mjs` forcing revalidation on all three. The manifest already
declares a **`share_target` pointing at `/import`** (GET, `title`/`text`/`url`),
so Android share-sheet ingestion is live. `scripts/pwa-check.mjs` guards it.

**Reuse:** the ingestion front door for Social Save already exists and is
installed on real phones. It must not change address — an installed PWA keeps
the manifest it was installed with, which is exactly why `/share/maps-link` was
kept as a forwarder.

### 1.13 Existing social / share functionality

Inbound: `lib/travel/socialLink.ts` classifies TikTok / Instagram / Facebook /
YouTube / Google Maps, strips tracking params (`igsh`, `_t`, `fbclid`, `utm_*`)
and produces a canonical URL. `linkPreview.ts` fetches captions by oEmbed or
OpenGraph. `mapsResolve.ts` resolves Maps links to exact coordinates.

Outbound: `trip_plans.is_public` + `share_token`, `/share/trip/[token]`,
`flight_shares`.

**Xiaohongshu / RED is not in the classifier.** The brief names it; adding it is
a classifier entry plus an allowlist decision, not a new pipeline.

### 1.14 Existing background jobs

There is **no `crons` block in `vercel.json`** and no queue. The nearest thing
is `POST /api/notifications/dispatch`, gated by `requireAdminOrService()` — a
staff session or `DOMNER_SERVICE_TOKEN`, "the token the scheduled jobs hold".

**This is the most consequential finding for the brief's "Import Job" layer.**
There is no worker to run a job on. Any job must either be driven by the
foreground request or polled by an authenticated endpoint an external scheduler
calls. Introducing a queue here would be a new dependency and new vendor lock-in
for a pipeline that currently completes inside one 60s request.

### 1.15 Existing AI integrations

Exactly one: `lib/travel/placeAgent.ts` (Anthropic SDK, `claude-sonnet-5` by
default, 20s timeout, 6,000-char caption cap, `server-only`). The caption is
fenced and labelled as untrusted data, and the model's JSON is passed through
`normaliseCandidate()`, which is documented as **the only door**.

`/api/chat` is *not* an LLM: it runs `lib/domnerEngine.ts` locally, deliberately
so it cannot fail on billing. Itinerary generation is deterministic
(`smartDraft.ts`). So today's total AI cost surface is one call per import, and
**that call is uncached**.

### 1.16 Logging / error architecture

`lib/logger.ts` — one JSON line per event with `level`, `event`, `ts`, plus
`redactEmail()` / `redactPhone()`. `LOG_LEVEL` configurable, `info` in
production. `lib/supabaseError.ts` classifies Postgres failures into causes
(`docs/SUPABASE-OPS.md`). No Sentry, no APM.

### 1.17 Analytics

**None as a product.** No GA, PostHog or Plausible; the `analytics` matches in
the codebase are unrelated identifiers. Any counting this brief needs must be
built as aggregate rows in Postgres — which is the privacy-preferable answer
anyway.

### 1.18 TypeScript configuration

`strict: true`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`isolatedModules`, `target ES2022`, `moduleResolution: bundler`, path alias
`@/*` → repo root. `apps` and `packages` excluded.

### 1.19 Testing infrastructure

**Vitest**, node environment, `tests/**/*.test.ts`, contract tests excluded from
the default gate. The notable asset: `tests/support/pgHarness.ts` boots
**PGlite** (Postgres in WebAssembly), replays real migrations
(`007, 008, 009, 010, 011`) plus a `trip_plans` prerequisite and stub
`auth.uid()` / `auth.role()`, and runs statements as `authenticated` with a real
JWT claim. `tests/savedPlaces.rls.test.ts` therefore proves the **actual
policies**, not a mock.

Two gates, reported separately: `npm run verify` (typecheck + lint + tests) and
`npm run verify:runtime` (real server, real browser), with `npm run env:check`
first — a `SKIP` is an unproven claim, never a pass (`docs/VERIFICATION.md`).

**Reuse:** every new migration in this plan gets appended to `MIGRATIONS` in
`pgHarness.ts` and its RLS asserted the same way. This is non-negotiable for
anything touching user-owned rows.

### 1.20 Deployment configuration

Vercel, region `sin1`, `DEPLOY.md`. Serverless functions — no long-lived
process, no in-memory state that survives a request. Note: `lib/rateLimit.ts` is
an **in-process** map, so limits are per-instance, not global. Fine as a
courtesy limit; not a quota mechanism.

---

## Part 2 — Reuse matrix

| Need | Reuse | Verdict |
|---|---|---|
| Endpoint scaffolding | `lib/http.ts` `route()`/`ok()`/`ApiError` | Reuse as-is |
| Auth | `requireUser()`, `supabaseFromRequest()` | Reuse as-is |
| Link classification | `lib/travel/socialLink.ts` | Extend: add RED, export a canonical-URL hash |
| Caption fetch | `lib/travel/linkPreview.ts` | Reuse as-is; allowlist untouched |
| Maps link → coordinates | `lib/travel/mapsResolve.ts`, `mapsLink.ts` | Reuse as-is |
| AI extraction | `lib/travel/placeAgent.ts` | Extend: cheap-first tiering + usage metering |
| Validation | `normaliseCandidate()`, `dedupeCandidates()` | Reuse as the only door |
| Geocoding | `lib/travel/geocode.ts` | Reuse; add a cache in front, keep Nominatim default |
| Writing a place onto a trip | `placeImport.ts` → `savedPlaces.addIdeaToTrip` | Reuse as-is |
| Place catalogue | `destination_places` | **Extend with columns — do not create a parallel `places` table** |
| Ideas / saved list | `itinerary_days.day_index 0` | Reuse; Phase 4 adds a trip-independent record alongside |
| Share ingestion | manifest `share_target` → `/import` | Reuse; address must not change |
| Config gating | `lib/env.ts` | Extend `ServiceName` for a places provider |
| Logging | `lib/logger.ts` | Reuse |
| Rate limiting | `lib/rateLimit.ts` | Reuse for burst; quotas need a DB counter (see 4.3) |
| RLS testing | `tests/support/pgHarness.ts` | Reuse; append every new migration |

**Nothing in the existing pipeline needs to be rewritten.** The gaps are all
*below* the water line: persistence, identity, provenance, and cost.

---

## Part 3 — Gap analysis

| Brief layer | Today | Gap |
|---|---|---|
| Import API | `POST /api/travel/extract` | Exists |
| Import Job | — | **Missing.** Synchronous, nothing persisted, nothing resumable or auditable |
| Content ingestion | `linkPreview.ts` | Exists. No screenshot/OCR path |
| AI extraction | `placeAgent.ts` | Exists. One model, no tiering, no metering |
| Candidate places | in-memory `PlaceCandidate[]` | **Missing as data** — candidates die with the response |
| Place resolver | `geocode.ts` | Partial: coordinates only, no provider identity |
| Trusted places provider | — | **Missing** |
| Confidence scoring | `AUTO_SELECT_CONFIDENCE = 0.55` | UI-only, not persisted, not resolver-aware |
| User confirmation | `/import` review screen | Exists |
| Canonical registry | `destination_places` | Partial: dedupe is per-owner name-string; no canonical id, no geo dedupe, no external-id map |
| Saved places | Ideas list | Exists, but trip-bound only |
| Collections | — | **Missing** |
| Ratings / stats / save counts | — | **Missing** |
| Provenance (`PlaceSource`) | — | **Missing** — the source URL is never stored |
| Verification tiers | `source ∈ {editorial, ai_generated}` | **Missing the distinction the brief calls critical**: `ai_generated` conflates AI-guess, provider-verified and publicly-safe |
| Cost control | burst rate limit only | **Mostly missing**: no URL hash, no duplicate detection, no result reuse, no quota, no usage log |

---

## Part 4 — Proposed architecture

### 4.1 Principles

1. **Extend `destination_places`; never fork it.** A parallel `places` table
   would split the editorial seed, the guide save path, `itinerary_places.place_id`
   and every existing RLS policy. Canonical identity is added as a
   self-referencing column instead.
2. **Three-state verification, stored explicitly.** A new
   `verification` column: `ai_candidate` → `provider_verified` →
   `domner_public`. The model may only ever write `ai_candidate`. Promotion to
   `provider_verified` requires a trusted provider record; promotion to
   `domner_public` requires a human or a threshold rule the owner sets. This is
   the brief's "critical principle" made into a database constraint rather than
   a convention.
3. **Provenance is a separate table, private by default.** Who submitted a
   source is never publicly readable; public surfaces read aggregate counts.
4. **The job is a row, not a queue.** `place_imports` records state
   (`pending → extracting → ready → saved/failed`) and is driven by the same
   foreground request that already does the work. No queue, no worker, no new
   vendor. If the pipeline later outgrows 60s, the row is already the handoff
   point for a poller.
5. **Every new capability degrades to off.** No key → no provider → Nominatim →
   no pin. The app still runs with an empty `.env` (CLAUDE.md §11).

### 4.2 Data model (additive)

**New columns on `destination_places`** (all nullable / defaulted, no rewrite):

| Column | Purpose |
|---|---|
| `canonical_place_id UUID REFERENCES destination_places(id)` | Self-reference. NULL = this row *is* canonical. Lets duplicates collapse without deleting anyone's row |
| `verification TEXT NOT NULL DEFAULT 'ai_candidate'` | `ai_candidate\|provider_verified\|domner_public`, CHECK-constrained. Backfill: existing `editorial` → `domner_public`, existing `ai_generated` → `ai_candidate` |
| `confidence NUMERIC` | The score that produced the row |
| `provider_place_id TEXT` / `provider TEXT` | Trusted-provider identity, when one exists |
| `geohash TEXT` | Cheap proximity bucketing for dedupe |

`source` is **left alone** — deprecating a column in the same migration that
reshapes meaning is what CLAUDE.md Step 1 explicitly forbids.

**New tables:**

| Table | Key columns | RLS |
|---|---|---|
| `place_imports` | `id, user_id, url_hash, normalized_url, platform, status, outcome, candidate_count, model, tokens_in/out, created_at, completed_at` | owner-only |
| `import_candidates` | `id, import_id, name, description, category, lat, lng, confidence, resolved_place_id, accepted` | via import owner |
| `place_sources` | `id, place_id, platform, normalized_url, url_hash, submitted_by, created_at` | insert own; **read = aggregate only** |
| `ai_usage_log` | `id, user_id, feature, model, tokens_in, tokens_out, cost_estimate_micros, created_at` | service/staff read only |
| `place_stats` *(Phase 4)* | `place_id, save_count, source_count, rating_avg, rating_count` | public read, service write |
| `saved_places`, `collections`, `collection_places`, `place_ratings` *(Phase 4)* | owner-scoped | owner-only, ratings aggregate-public |

Indexes: `place_imports (user_id, created_at DESC)`, unique
`place_imports (url_hash) WHERE status = 'ready'`, `place_sources (place_id)`,
unique `place_sources (place_id, url_hash)`, `destination_places (geohash)`,
`destination_places (provider, provider_place_id)`,
`destination_places (canonical_place_id) WHERE canonical_place_id IS NOT NULL`.

### 4.3 Cost control design

```
paste → normalize URL (socialLink.ts) → sha256 → url_hash
      → SELECT completed import for this hash
           hit  → replay stored candidates, ZERO model tokens
           miss → check per-user daily quota (COUNT over place_imports)
                → cheap model pass
                → escalate to the stronger model only if confidence < threshold
                → write ai_usage_log
```

Four separate savings, deliberately: a repeat of the *same link* costs nothing;
a place already resolved is reused rather than re-geocoded; the cheap model
handles the majority; and the quota is a **database count**, not the in-process
rate limiter, because serverless instances do not share memory (§1.20).

The existing burst limiter stays in front of all of it.

### 4.4 Module layout

Follow the repo's own convention (`lib/travel/*`) rather than importing the
brief's `features/ services/` tree — a second architecture in one codebase costs
more than it explains. New modules:

```
lib/travel/importJobs.ts      job row lifecycle
lib/travel/urlHash.ts         normalize + sha256 (pure, testable)
lib/travel/placeRegistry.ts   canonical resolution, geo+name dedupe, promotion
lib/travel/placeProvider.ts   provider interface (adapter behind it, Phase 3)
lib/travel/aiUsage.ts         metering + quota
```

---

## Part 5 — Phased implementation plan

Each phase is independently shippable, additive, and reversible.

### Phase 1 — Persistence + cost control *(recommended first)*

- Migration `012_place_imports.sql`: `place_imports`, `import_candidates`,
  `place_sources`, `ai_usage_log` + RLS + indexes.
- `lib/travel/urlHash.ts`, `importJobs.ts`, `aiUsage.ts`.
- `/api/travel/extract` records a job and **reuses a completed import for the
  same hash**. Request/response shape unchanged except an added `importId`, so
  the UI needs no change to keep working.
- `/api/travel/places/import` writes `place_sources` for saved places.
- Tests: pure hash tests; PGlite RLS tests for all four tables; a reuse test
  asserting **zero model calls** on a repeat import.
- **Nothing user-visible changes.** That is the point.

### Phase 2 — Canonical registry + verification tiers

- Migration `013_place_registry.sql`: the columns in §4.2 + backfill
  (`editorial → domner_public`, `ai_generated → ai_candidate`).
- `placeRegistry.ts`: resolve by provider id → geohash+name proximity → create.
- Import writes `ai_candidate` only. Nothing AI-created is publicly readable.

### Phase 3 — Trusted places provider *(owner cost decision required)*

- `placeProvider.ts` interface + one adapter behind a server-only key, with
  timeout, retry-with-backoff, structured logs and a resolved-place cache.
- New `ServiceName` in `lib/env.ts`; absent key → provider off → Nominatim.
- Promotion to `provider_verified` happens **only** here.

### Phase 4 — Saved places, collections, ratings, stats

- Trip-independent `saved_places`, `collections`, `place_ratings`, aggregate
  `place_stats`. Existing trip-Ideas saves keep working unchanged.

### Phase 5 — Screenshot/OCR ingestion, RED support, trip generation from the flywheel

---

## Part 6 — Risk register

### Vendor lock-in

| Risk | Assessment |
|---|---|
| **Google Places (Phase 3)** | The real one. Provider place ids and Terms that restrict caching/redisplay would make a switch expensive. **Mitigation:** the adapter interface is the contract; `provider` + `provider_place_id` are stored as a *mapping*, never as the primary key; Nominatim stays the working default. Do not store provider content we are not permitted to retain — that is an owner/legal decision before Phase 3, not after |
| Anthropic | Low. One narrow JSON-extraction call behind `placeAgent.ts`, already optional |
| Supabase | Pre-existing and accepted. Plain Postgres + RLS; nothing new added here deepens it |
| Vercel | Pre-existing. Adding a queue vendor **would** deepen it — hence the job-as-row design |
| Leaflet/OSM | None. No contract, and this plan keeps it as the default |

### Security & privacy

1. **SSRF** — any new fetch path inherits the existing rule: exact-match `Set`
   allowlist, checked before the socket opens and **re-checked at every redirect
   hop**, https only, no credentials, no odd ports, capped body reads. Adding
   RED means adding hosts to an allowlist, which is an owner decision like
   `goo.gl` was.
2. **Prompt injection** — a caption is hostile input. The existing fencing and
   `normaliseCandidate()` gate stay the only door; new fields (`confidence`,
   provider ids) must pass through it too, never around it.
3. **Provenance leaks identity** — `place_sources.submitted_by` must never be
   readable by another traveler. Public surfaces read `place_stats` counts only.
4. **Verification bypass** — the whole design fails if anything can write
   `domner_public`. Enforce it as a CHECK plus an RLS policy, and prove it in a
   PGlite test.
5. **Provider key exposure** — server-only module, never `NEXT_PUBLIC_`, gated
   through `lib/env.ts` like every other service.
6. **Quota as an abuse control** — without it, one account can spend the model
   budget. The in-process limiter cannot do this (§1.20); the DB counter can.

### API cost risks

| Risk | Control |
|---|---|
| Same link imported repeatedly | `url_hash` reuse — zero tokens |
| Viral link imported by many users | Same hash across users; reuse a completed extraction (candidates only, never another user's *saves*) |
| Long transcripts | Existing 6,000-char cap |
| Model escalation on every import | Cheap-first; escalate only below a confidence threshold |
| Provider lookups per candidate | Cache resolved places; cap per import as geocoding already does (8) |
| Runaway account | Per-user daily quota + `ai_usage_log` |
| Silent bill growth | `ai_usage_log` with cost estimate, reportable per day/user/feature |

### Operational risks

- **No worker exists.** Anything genuinely long-running needs an owner decision
  on a scheduler. Phase 1 deliberately avoids needing one.
- **`maxDuration = 60`** is the hard ceiling on foreground extraction.
- **PGlite harness must be updated** with every new migration or the RLS tests
  silently stop covering the new tables.
- **Locked areas** — none of this touches auth, identity or QR delivery. If a
  phase turns out to, it stops and asks (CLAUDE.md §7).
- **Checkout** — untouched by every phase. Non-negotiable (rule 13).

---

## Part 7 — Decisions needed before any code

1. **Which phase to build.** Recommendation: Phase 1. It is invisible to
   travelers, reversible, and it is what makes Phase 3's bill predictable.
2. **Is a paid Places provider approved in principle?** Affects Phase 2/3
   design only. Phase 1 is unaffected either way.
3. **May a saved place exist outside a trip?** Phase 4 assumes yes.
4. **Who may promote a place to `domner_public`?** A human, or a rule
   (e.g. N independent saves + provider verification)?
5. **Xiaohongshu / RED:** add its hosts to the SSRF allowlist? Same class of
   decision as the `goo.gl` widening already recorded in `docs/PLACE-IMPORT.md`.
