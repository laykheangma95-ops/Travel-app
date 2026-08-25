# Social Save + AI Place Intelligence — architecture audit & implementation plan

**Status: the import ledger and the canonical registry are delivered, and the
async import pipeline is production-complete as of Phase 6. This document's
own Phase 3 and Phase 5 remain proposals awaiting a decision.**
Parts 1–4 are the audit; Part 5 carries the phase plan (see its numbering note
— Phase 6 does not continue it) and Part 8 records what Phase 1 actually
shipped. Part 12 records Phase 6.

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

> **Numbering note, added in Phase 6.** The Phase 3/4/5 numbers below describe
> a plan that was superseded in practice. What actually shipped through PRs
> #73–#76 is a *different* sequence, documented in
> [`docs/PLACE-IMPORT.md`](PLACE-IMPORT.md): its own Phase 3 is the social-link
> intake (`/api/imports`), its Phase 4 is the connector/orchestration layer,
> and its Phase 5 is wiring `/import/link` to process+poll+review. Those are
> not the same features this table calls Phase 3/4/5 — this table's Phase 4
> (saved places) shipped too, but as *its own* "Phase 2" (see Part 10), and
> this table's Phase 3 (trusted provider) and Phase 5 (OCR/RED/flywheel)
> **have not started**. Two documents used the same numbers for different
> work; this note exists so a future session does not have to rediscover that
> the hard way.
>
> **The actually-current phase is Phase 6**, continuing the PLACE-IMPORT.md
> track (production-completing the shipped async pipeline), not this table's
> Phase 3 or Phase 5 — see *Part 12 — Phase 6* below. This table's own Phase 3
> and Phase 5 remain real, scoped, future work — owner-approved cost/security
> decisions away, not "next" by default.

### Phase 1 — Persistence + cost control ✅ **shipped — see Part 8**

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

### Phase 2 — Canonical registry + verification tiers ✅ **shipped — see Part 9**

- Migration `013_place_registry.sql`: the columns in §4.2 + backfill
  (`editorial → domner_public`, `ai_generated → ai_candidate`).
- `placeRegistry.ts`: resolve by provider id → geohash+name proximity → create.
- Import writes `ai_candidate` only. Nothing AI-created is publicly readable.

### Phase 3 — Trusted places provider *(owner cost decision required)*

- `placeProvider.ts` interface + one adapter behind a server-only key, with
  timeout, retry-with-backoff, structured logs and a resolved-place cache.
- New `ServiceName` in `lib/env.ts`; absent key → provider off → Nominatim.
- Promotion to `provider_verified` happens **only** here.

### Phase 4 — Saved places ✅ **shipped as Phase 2 — see Part 10** · collections, ratings still open

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


---

## Part 8 — Phase 1 as built

Approved decisions this was built under: a paid places provider is approved in
principle but stays behind an abstraction and is **not activated here**; a saved
place must eventually exist independently of a trip (Phase 4); promotion to
public must never be AI-only; and the SSRF allowlist is **not widened** — RED is
prepared for by the `platform` vocabulary and nothing else.

### What it does

```
paste → normalize URL → sha256 → url_hash
      → own completed import for this hash?
            hit  → replay stored candidates      ZERO tokens, ZERO fetches
            miss → daily quota check (a DB count)
                 → the existing pipeline, unchanged
                 → record job + candidates + token cost
save  → record which post each place came from, and which guess was kept
```

### Tables (migration `012_place_imports.sql`)

`place_imports` · `import_candidates` · `place_sources` · `ai_usage_log`.
No existing table is altered. `destination_places`, `trip_plans`,
`itinerary_days` and `itinerary_places` are untouched, so every existing save
path behaves exactly as before.

### The quota is enforced in the database, not in the app

The daily cap is a `COUNT` over `place_imports`, and a traveler holds the anon
key — they can call PostgREST directly, so "our code never does that" is not a
control. **Four** ways of defeating the count are closed in SQL:

| Attack | Closed by |
|---|---|
| Insert a row backdated outside the window | Trigger stamps `created_at` on INSERT |
| Update `created_at`, `user_id` or `url_hash` afterwards | Trigger preserves all three on UPDATE |
| Delete yesterday's rows to buy a fresh allowance | No DELETE policy exists |
| Mark real imports as replays, which the count excludes | Trigger requires a replay to name a **completed import of the same link by the same traveler** |

Each has a test that performs the attack.

**The fourth was missed in the first implementation and found in review**, after
this document had already claimed the quota could not be cheated. It could: the
count excludes rows with `reused_from_import_id` set, nothing stopped a traveler
from setting that column on every row, and three closed holes plus one open one
is an open cap. It is closed now, and the claim is stated as what is tested
rather than as a general guarantee.

Replays are still excluded from the count — they cost nothing to serve, so
rationing them would punish the behaviour this phase exists to encourage. What
changed is that being a replay now has to be *true*: a genuine replay is keyed
on the hash it reused, and a hundred distinct links cannot claim to be replays
of anything because no earlier import shares their hash.

### Privacy

`place_sources` links a person to a place they liked enough to save, so it is
private: own-row SELECT and INSERT, no UPDATE, no DELETE. Aggregate save counts
— what a public surface actually needs — are a Phase 4 table computed from this
one, never this table exposed.

### Where cost enforcement lives, and where the record lives

These are two different things and they are deliberately in two different
places.

**Enforcement is `place_imports`.** It is the table a traveler cannot backdate,
delete, or mark as a replay, so the daily cap computed from it means something.

**The record is `ai_usage_log`, and it is written only by the service role.**
It has *no RLS policy of any kind*: an authenticated caller can neither read nor
write it. It briefly had an INSERT policy scoped to `user_id = auth.uid()`, so
the extract route could write it on the session client it already had. That was
the wrong architecture — the policy constrained whose row could be written but
not what was in it, so any signed-in account could inject arbitrary models,
token counts and cost estimates into the numbers we would use to answer "what is
the AI importer costing us". A ledger anybody can write is not a ledger.

The route now writes it through `getSupabaseAdmin()`, and **records nothing when
no service key is configured**. An absent line is honest; an unverifiable one is
not. Nothing is enforced from this table, and nothing should ever be.

### Environment variables

| Name | Default | Effect |
|---|---|---|
| `PLACE_IMPORT_DAILY_QUOTA` | `40` | Pipeline runs per traveler per rolling day. `0` disables the cap. |
| `ANTHROPIC_PLACE_MODEL_FAST` | unset | Opt-in cheap first pass. **Unset = one call to the same model as before**, so default behaviour is unchanged. |

### Known limitations

1. **Reuse is own-user only.** A viral link imported by many travelers is still
   extracted once per traveler. Cross-user reuse means reading another user's
   row, which requires the service role — a decision with a privacy argument
   attached, not a free win. Phase 2 question.
2. **The escalation is billed twice.** With `ANTHROPIC_PLACE_MODEL_FAST` set and
   the cheap pass failing, both calls are paid for. `ai_usage_log` records the
   stronger model's line; the escalation itself is logged as
   `place_agent.escalated`.
3. **The ledger is best-effort.** If Supabase is unavailable the importer works
   and simply stops remembering — `importId` comes back `null`. That is the
   empty-`.env` configuration and it is covered by a test.
4. **The quota fails open.** If the count cannot be read the import proceeds. A
   database hiccup locking every traveler out of the importer would be a worse
   outage than the spending it guards against.
5. **No screenshot/OCR path, no RED classifier, no provider.** Out of scope by
   instruction.

### One invariant was deliberately narrowed

`tests/extractRoute.test.ts` asserted that the extract endpoint "must never
touch the database". It now asserts the narrower, true property: the endpoint
writes **no trip, place or itinerary row** — a wrong guess still costs a glance
rather than a cleanup — and writes only its own job row. It also may never use
the unscoped Supabase client; everything runs on the caller's session client so
RLS applies.


---

## Part 9 — The canonical place registry as built

Migration `013_place_registry.sql`. Delivered against the approved decisions: a
provider abstraction with **no paid vendor activated**, promotion that AI can
never reach, and **no SSRF allowlist change** — RED is prepared for only in the
platform vocabulary.

### The shape

| Table | What it is |
|---|---|
| `places` | One row per real-world place. Name, local name, slug, country, city/district/neighborhood, category/subcategory, coordinates, address, website, phone, price level, verification status. |
| `place_external_ids` | `(provider, provider_place_id) → place_id`, **unique**. This is what makes "100 users, 1 place" true. |
| `destination_places.canonical_place_id` | One nullable column. A traveler's saved copy points at the shared record. Nothing else changed. |

`itinerary_days`, `itinerary_places` and `trip_plans` are untouched. A
`destination_places` row that never resolves keeps working exactly as it does
today — the pointer is additive, and nothing reads it yet.

### Why some fields are not where the brief put them

- **`provider` / `provider_place_id` are not columns on `places`.** A place has
  ids from as many providers as have ever seen it, and the thing that actually
  prevents duplication is a UNIQUE constraint on the provider's id — which two
  columns cannot express without forbidding a second provider. The mapping
  table carries them.
- **`country_code` is nullable.** Domner's country identity is the *name*
  (`trip_plans.destination`), and there is no reliable way to derive an ISO code
  from a name in SQL. Inventing one during the backfill would be fabricated
  data. A provider fills it in when it knows it; `country_name` is NOT NULL and
  is what everything joins on.
- **`category` reuses the existing six values.** A registry with its own
  vocabulary needs a translation on every read, and translations drift.

### Deduplication

Two keys, both **generated by the database** so a row can never carry a key that
disagrees with its own name or coordinates:

- `name_normalized` — case-folded, Latin accents flattened, whitespace and
  ASCII punctuation removed. Chinese, Khmer and Thai characters survive.
- `geohash` — standard base32, 9 characters.

`UNIQUE (name_normalized, substr(geohash,1,7))` — same name inside one ~150m
cell is one place. The resolver searches a real **bounding box** first, because
a cell has edges and two points 30m apart can fall either side of one; the index
is the last-resort race guard, not the primary mechanism.

Resolution order, strongest evidence first: **provider id → proximity + name →
create as `unverified`**.

**Both keys exist twice — in SQL and in TypeScript.** If they ever disagree,
nothing throws: lookups compute one key, rows hold another, and every import
silently creates a duplicate. `tests/places.normalize.test.ts` runs both
implementations over Latin, Chinese and Khmer inputs in a real Postgres and
asserts they agree. Writing that test found two real divergences — a broken row
in the accent-folding table, and Postgres and JavaScript disagreeing about Khmer
combining marks. The second is why neither side uses a character class: POSIX
`[[:alnum:]]` and JavaScript's `\p{L}` classify those marks differently, so both
sides now strip an explicit, written-down set that means the same thing under
every collation.

### Promotion — the rule, as a policy rather than a habit

```
unverified  →  provider_verified  →  domner_public
```

- A traveler's session can insert and edit **only `unverified` rows they own**.
  There is no request body that reaches any other status: it is the RLS
  `WITH CHECK`, not a code path. A future AI pipeline runs as a traveler, so
  this is the answer to "AI must never promote", enforced by the database.
- `provider_verified` requires a provider mapping to exist — checked in the
  repository *and* by a trigger, so a direct SQL `UPDATE` cannot get around it.
- `domner_public` requires a **human actor**. A provider may verify; a provider
  may not publish. Publishing an unverified place needs an explicit `override`
  plus an actor and a reason, which is the editorial case.
- Every promotion is logged with actor and reason. There is no places audit
  table yet; that is worth adding when staff tooling arrives.

Provider mappings are **service-role only, with no INSERT policy at all**. A
caller who could write one could claim a real Google id for a place they
invented, and the unique index would then refuse the genuine link forever.

### The provider abstraction

`lib/providers/places/` — `types.ts` (the port), `registry.ts`, `sandbox.ts` —
mirroring the existing `lib/providers/esim/` convention.

```ts
interface PlacesProvider {
  readonly id: string;
  isConfigured(): boolean;
  search(query: PlaceSearchQuery): Promise<PlaceSearchResult[]>;
  getDetails(providerPlaceId: string): Promise<ProviderPlace | null>;
}
```

**No paid adapter is written or activated.** The default is no provider at all.
A vendor's payload is transformed into Domner types and validated
(`lib/places/validation.ts`) before it reaches any application logic — coordinate
ranges, a `.strict()` schema that rejects unmapped vendor fields, and an
http(s)-only website check, because a `javascript:` URL from a third party that
we store and later render is stored XSS handed to us.

The sandbox adapter is **refused in production** unless demo mode is explicitly
enabled. Fixtures that could stamp `provider_verified` on a live place would put
the word "verified" on data nobody verified.

Adding a real vendor is: one adapter file, one `register()` line, one
`ServiceName` in `lib/env.ts`, and an owner decision about the bill and about
what the vendor's terms permit us to store.

### Environment variables

| Name | Default | Effect |
|---|---|---|
| `PLACES_PROVIDER` | unset | Which adapter resolves places. Unset means none, which is how Domner ships today. `sandbox` works in dev only. |

### Rolling back, and rebuilding the keys

**Rollback order matters.** `destination_places.canonical_place_id` is a foreign
key into `places`, so dropping the table first fails. Reverse order, and no
existing data is destroyed:

```sql
-- 013, in reverse. Losing canonical_place_id loses the links, not the places.
ALTER TABLE destination_places DROP COLUMN IF EXISTS canonical_place_id;
DROP TABLE IF EXISTS place_external_ids;
DROP TABLE IF EXISTS places;
DROP FUNCTION IF EXISTS public.places_verification_guard();
DROP FUNCTION IF EXISTS public.place_name_normalized(TEXT);
DROP FUNCTION IF EXISTS public.geohash_encode(NUMERIC, NUMERIC, INT);

-- 012, in reverse. Import history and provenance are lost with it.
DROP TABLE IF EXISTS ai_usage_log;
DROP TABLE IF EXISTS place_sources;
DROP TABLE IF EXISTS import_candidates;
DROP TABLE IF EXISTS place_imports;
DROP FUNCTION IF EXISTS public.place_imports_guard();
```

Neither migration alters or removes a pre-existing column, so rolling both back
returns the database to exactly its previous shape. `destination_places`,
`trip_plans` and the itinerary tables are untouched throughout.

**Changing a normalizer is not a normal migration.** `place_name_normalized` and
`geohash_encode` sit behind GENERATED columns. Postgres accepts a
`CREATE OR REPLACE` of either and does **not** recompute the stored values — so
an edit silently leaves every existing row keyed under the old rule while new
rows use the new one, and deduplication quietly stops working with no error
anywhere. If one of them ever has to change:

```sql
BEGIN;
-- 1. Replace the function.
CREATE OR REPLACE FUNCTION public.place_name_normalized(value TEXT) ... ;

-- 2. Force every stored key to be recomputed. A no-op UPDATE does it, because
--    a generated column is re-evaluated on every write.
UPDATE places SET name = name;

-- 3. The identity index may now see collisions that did not exist before.
--    This must return zero rows before the transaction is committed.
SELECT name_normalized, substr(geohash, 1, 7), count(*)
FROM places GROUP BY 1, 2 HAVING count(*) > 1;
COMMIT;
```

If step 3 returns rows, the new rule merges places that were previously
distinct: resolve those by hand before committing. Update the TypeScript twin in
`lib/places/normalize.ts` in the same change, and run
`tests/places.normalize.test.ts` — it is what proves the two still agree.

### Known limitations

1. **Nothing calls the registry yet.** It is infrastructure: the importer still
   writes `destination_places`, and `canonical_place_id` stays null until a
   later phase wires resolution into the save path. That is deliberate — adding
   the table and changing the save path in one commit would put the live
   importer at risk for a table with no data in it.
2. **Cross-user proximity matching only sees published places.** Two travelers
   who each save an unverified place get two rows until one is published. That
   is the privacy trade, and it is the right way round.
3. **No places audit table.** Promotions are logged, not stored.
4. **The SQL/TypeScript parity is proven under PGlite's collation.** It is
   collation-independent by construction now, but the guarantee is a test, so
   run the suite against any database whose locale differs.

### Open items carried forward from the Principal Engineer review

None of these are live — nothing calls the registry yet — but they are real and
they are written down rather than forgotten:

- **`resolveProviderPlace` is ~8 round trips per place.** A 25-place import
  would be ~200. It must be collapsed before anything calls it in a loop.
- **`findNearbyByName` caps at 50 candidates before sorting by distance.** In a
  dense cluster of identically-named places the true nearest could in principle
  be truncated away.
- **The `013` backfill is a function-per-row join** over `destination_places`
  and cannot use an index. Fine at editorial-catalogue scale; check the row
  count before running it on a large table.
- **Provider ids are readable by any authenticated user** for published places.
  Some vendors' terms restrict redistributing their place ids — check before
  wiring a real adapter.
- **Slug format is inconsistent** between backfilled rows (which keep the
  hyphenated `content_slug`) and new ones (punctuation stripped). Cosmetic:
  identity is the index, never the slug.
- **No places audit table.** Promotions are logged with actor and reason, not
  stored.
- **OUTSTANDING — real-catalogue staging validation for the `013` backfill has
  never been run.** Everything above about the backfill (dedup by geohash +
  normalized name, the function-per-row join, "check the row count before
  running it on a large table") has been verified against synthetic and
  PGlite-rehearsal data only — never against a copy of the real production
  `destination_places` catalogue, because no session doing this work has held
  staging credentials or network access to Supabase. Before `013` (or any
  migration reshaping `destination_places`) is applied to production, run it
  against a staging copy seeded from a real `destination_places` export and
  confirm, by hand:
    1. The backfilled row count into `places` matches the source row count in
       `destination_places` (no rows silently dropped).
    2. The step-3 "would this new rule merge two previously-distinct places"
       query (above, in *Rolling back, and rebuilding the keys*) returns zero
       unexpected merges — or every merge it does return has been reviewed by
       a human, not auto-resolved.
    3. The backfill's wall-clock time is acceptable at the real row count —
       it is a function-per-row join with no index, and "fine at editorial
       scale" was never checked against the actual catalogue size.
    4. A sample of `canonical_place_id` links from `destination_places` reads
       back correctly through the registry's own lookup path, not just via a
       direct SQL join.
  This is carried forward from Phase 3's own review rather than newly
  discovered; it is written here so it is tracked in the repository rather
  than only in a PR description or a chat transcript.
- **OUTSTANDING, added by Phase 7 — a sample of newly-imported real places
  must be checked against real editorial data in staging.** Phase 7 (Part 13)
  is the first thing that ever calls this registry from a live save path.
  Everything above about the `013` backfill was checked against synthetic and
  PGlite data only; Phase 7 adds one more question the same staging copy must
  answer before either migration reshapes production: import a handful of
  captions naming places that already exist in the real editorial
  `destination_places` catalogue, and confirm each one attaches
  `canonical_place_id` to that place's real backfilled row — not a fresh
  duplicate. This has not been run. No session doing this work has held
  staging Supabase credentials.


---

## Part 10 — The saved-place library (shipped)

Migration `014_saved_place_library.sql`. A traveler can keep a canonical place
**without a trip existing anywhere**.

### Two saves, deliberately kept apart

| | Trip save (unchanged) | Library save (new) |
|---|---|---|
| Means | "put this on a trip" | "keep this" |
| Keyed on | guide `content_slug` | canonical `places.id` |
| Needs a trip | yes — creates or asks which | no |
| Code | `lib/travel/savedPlaces.ts` | `lib/places/saved.ts` |
| Endpoint | `POST /api/travel/places/save` | `/api/travel/places/saved` |
| Button | `SavePlaceButton` (bookmark) | `SavedPlaceButton` (heart) |

Nothing in the trip path changed. A test asserts the library writes no row into
`destination_places`, `trip_plans` or `itinerary_places`.

### Save counts without COUNT(\*)

`place_stats` is a counter maintained by an `AFTER INSERT OR DELETE` trigger, so
a screen of twenty place cards reads one row per card from a primary key instead
of running twenty aggregates that get slower as the product succeeds. The
trigger is `SECURITY DEFINER` with `search_path` pinned to empty — it has to be,
because `place_stats` has no write policy at all.

**Reconciliation** (the counter is a cache; this is the truth it caches):

```sql
SELECT st.place_id, st.save_count,
       (SELECT count(*) FROM saved_places s WHERE s.place_id = st.place_id) AS actual
FROM place_stats st
WHERE st.save_count <> (SELECT count(*) FROM saved_places s WHERE s.place_id = st.place_id);
```

Expected: zero rows. A test asserts this after a save/save/unsave sequence.

### Privacy

`saved_places` is own-row only for SELECT, INSERT, UPDATE and DELETE — there is
no policy under which one traveler's library is visible to another.

`place_stats` holds a place id and a number, and **who saved what is never
joinable to it**. It is *not* publicly readable: reading a count requires a
signed-in caller **and** a place that caller can already see (published, or
their own). Anonymous callers get nothing at all — Phase 2 has no surface that
shows counts to a signed-out visitor, and opening one is a product decision
rather than a default.

### One finding, found while testing

The first version of `saved_places_insert_own` checked only
`user_id = auth.uid()`. **A foreign key is enforced regardless of RLS** — that
is what a foreign key is — so a traveler could insert a save naming a place they
cannot see. Nothing leaked (the library view joins `places` and filters it back
out), but a write that succeeds for one id and fails for another is an oracle
for enumerating other travelers' unverified places, and it moved their
`save_count`.

The policy now restates migration 013's visibility rule as a condition of
saving: published, or your own. Two permanent regression tests cover it — one
that the invisible place cannot be saved, one that your own unverified place
still can.

### Known limitations

1. **`collection_id` is a column with no table, pinned to NULL.** The API not
   accepting the field was never the guarantee — a direct PostgREST call could
   set it to any uuid at all, and rows written that way would become live
   cross-user collection references the moment collections shipped. It is now
   held at NULL by the `saved_places_collection_null` CHECK constraint, which
   the collections migration drops in the same statement that adds the foreign
   key.
2. **A `rejected` place drops out of a library.** The save row survives; the
   view stops returning it, because RLS on `places` no longer matches. Correct,
   and tested, but it means a list can shrink without the traveler acting.

   **TECHNICAL DEBT (M1) — rejected places inflate `place_stats.save_count`.**
   The surviving `saved_places` rows still count. A place we have judged not
   real therefore keeps its popularity, and every screen that ranks or displays
   by save count inherits that number. Nothing is exposed by it — the count is
   already gated on the place being visible, and a rejected place is visible to
   nobody but its creator — so this is a correctness debt, not a security one.

   It is deliberately NOT fixed in the security pull request that landed the
   ownership fixes, because that change had to stay reviewable. Fixing it means
   deciding what `rejected` should do to existing saves: leave them (today),
   delete them and let the counter trigger settle the number, or exclude
   rejected places from the counter and reconcile. That is a product decision
   about somebody else's library, so it needs an owner, not a default. Until it
   is made, treat `save_count` on a rejected place as stale.

   The reconciliation query in this document detects nothing here, by design:
   the counter and `saved_places` agree with each other. What disagrees is
   `save_count` and the intent of `rejected`.
3. **`getSavedDestinations` tallies in the application** over one page of saves,
   so the country counts describe the first 50. A `GROUP BY` view is the fix
   when a library that large exists.
4. **The heart is only mounted on `/you/saved`.** There is no public
   canonical-place surface yet to put it on; that arrives with place pages.


---

## Part 11 — The Phase 2 ownership review

A security issue found by testing rather than by design is a reason to sweep the
whole boundary, not to fix one column. The sweep ran every foreign key, policy,
trigger and route in Phase 2 as an attack. It found **three more instances of
one mistake**: a foreign key was being asked to do authorization's job.

> A foreign key proves a row EXISTS. It says nothing about who may point at it.

| Finding | Was | Now |
|---|---|---|
| **C1** `source_import_id` accepted another traveler's import — and it was reachable **through the documented API**, which accepts `sourceImportId` | provenance could be forged; valid import ids distinguishable from invented ones | RLS `WITH CHECK` on INSERT **and** UPDATE: NULL, or an import owned by `auth.uid()`. The guard trigger also makes it immutable after creation |
| **H1** `place_stats` was readable for any place by id, and its backfill inserts a row for **every** place — so on a populated database it enumerated every place id in the system, private ones included | existence and popularity leaked; no identities | read policy now requires the place to be visible to the caller: published, or their own |
| **H2** `collection_id` accepted any uuid through a direct PostgREST call | future cross-user collection references | `CHECK (collection_id IS NULL)`, dropped by the collections migration |

None of the three exposed a user's identity or another traveler's library; the
own-row policies held throughout. What leaked was existence, provenance and
aggregates.

**19 adversarial tests** now cover them, each performing the attack rather than
describing it, and each asserting what the *database* did rather than what a
route returned. The `place_stats` enumeration test is built in **production
migration order** — 014 re-applied against a populated `places` table — because
the ordinary harness runs migrations against an empty database and would have
reported that leak as blocked.


---

## Part 12 — Phase 6

**Status: implemented, this document's Phase 3 and Phase 5 remain untouched.**

Phase 6 does not continue this document's own Part 5 plan (see the numbering
note at the top of that section). It continues the *other* shipped track —
`docs/PLACE-IMPORT.md`'s intake → connector → UI-wiring sequence (PRs #73–#76)
— and production-completes it, rather than expanding ingestion. Full detail,
including the exact gaps found and fixed, lives in
[`docs/PLACE-IMPORT.md`](PLACE-IMPORT.md); this entry exists so a reader
starting from this document's own phase table lands on the right next step
instead of Part 5's Phase 3 or Phase 5.

**Owner decisions this was built under**, matching the pattern Parts 8–10
record for earlier phases: continue the PLACE-IMPORT.md track, not this
document's Phase 3 (trusted provider) or Phase 5 (OCR/RED/flywheel); schedule
the stuck-job reaper with an external authenticated POST caller, not Vercel
Cron; do not activate a paid Places provider; do not widen the SSRF allowlist
for Xiaohongshu/RED; leave M1 (Part 10) exactly as documented; leave
collections/ratings deferred.

**What it does:**

- `GET /api/imports/:id` now returns `error_code`/`error_message` for a
  failed job (already written since Phase 4's `failImportWithReason`, never
  previously read back), so the review screen can say *why* a link could not
  be read instead of one sentence for every cause.
- The client distinguishes the daily processing-quota rejection from the
  route wrapper's own burst rate limit — both throw the same `RATE_LIMITED`
  code, so the distinction is made on the response body's `details.limit`,
  which only the quota path sets — and shows the specific message
  immediately instead of decaying into a 70-second generic timeout.
- The `pollTimeout` screen's "Check again" button now re-attempts
  `process()` before polling, closing a dead end where a job that was never
  claimed could not be un-stuck from that screen at all.
- The stuck-job reaper's production requirement is now stated as a decision,
  not an open question — see `docs/PLACE-IMPORT.md`, *Scheduling the
  reaper*.

**What it deliberately does not do:** add OCR/screenshot ingestion, add a
Xiaohongshu/RED connector or widen the SSRF allowlist, activate a paid Places
provider, touch M1, or add collections/ratings. All five remain exactly where
Parts 5 and 10 of this document left them.


---

## Part 13 — Phase 7

**Status: implemented.** Registry wiring only — the smallest change that makes
Part 9's canonical registry (`places`, `place_external_ids`,
`resolvePlaceForTraveler`, `attachCanonicalPlace`) reachable from a real save,
rather than infrastructure nothing calls. See Part 9's own "Known
limitations" #1, which this phase closes: "nothing calls the registry yet."

**Owner decisions this was built under:** registry wiring exactly as scoped
here — no paid Places provider, no AI extraction change, no OCR/RED, no
collections/ratings, no M1 change, no itinerary-editor manual-add wiring, no
provider verification, no batched-resolver redesign. No schema change: the
`canonical_place_id` column Phase 2 added to `destination_places` is reused
as-is. Resolver performance is left as measured (one `findNearbyByName`
lookup per place, not the ~8-round-trip provider path Part 9's risk register
warned about) rather than redesigned around batching, matched to current
pre-launch traffic; batching is documented below as follow-up if measurement
ever shows otherwise.

**What it does:** `insertPlace()` in `lib/travel/placeImport.ts` — the one
place both the synchronous (`/import`) and async (`/import/link`) pipelines
write a traveler's `destination_places` row — now calls
`resolvePlaceForTraveler()` on the caller's own session client immediately
after that row is written, and sets `canonical_place_id` via
`attachCanonicalPlace()` when a resolution comes back. Both pipelines pick
this up automatically through the shared call site; neither was touched
directly.

**The null-island guard.** `insertPlace()` already substituted `lat: place.lat
?? 0, lng: place.lng ?? 0` for a place with no geocoded pin — existing
behaviour, unchanged. Registry resolution reads `place.lat`/`place.lng`
*before* that substitution: a place with either one `null` is never sent into
`resolvePlaceForTraveler` at all, so `(0, 0)` — a "no map pin" placeholder,
never a location — can never seed or match a proximity search. Without this,
every coordinate-less import from every traveler would eventually collide at
one canonical row sitting on the null island in the Gulf of Guinea.

**Failure isolation.** The resolve-and-attach call is wrapped in its own
try/catch, on top of the fact that `resolvePlaceForTraveler` and
`attachCanonicalPlace` already return `null`/`false` rather than throw. A
registry failure costs a place that stays unlinked; it can never fail the
`destination_places` insert, the import as a whole, or trip creation — the
same failure-isolation pattern `recordPlaceSource`/`markCandidateAccepted`
already use two lines below it.

**Tests.** `tests/placeImport.registry.test.ts`, against the same PGlite
harness every RLS-sensitive suite uses, proves through the actual import call
path (not the repository directly, which `tests/places.registry.rls.test.ts`
already covers): a real-coordinate place gets `canonical_place_id` attached
and starts `unverified`; the resolve call is made with the caller's own
session client and never a service/admin client; the same place imported
twice (by one traveler, or by two once the first is published — cross-user
matching only sees published places, per Part 9's own known limitation)
lands on one canonical row; two places sharing a normalized name but ~150km
apart do not merge; a place with no coordinates is never sent into
resolution and leaves `canonical_place_id` NULL; two coordinate-less imports
from different travelers never merge through the `(0, 0)` sentinel; the
import path cannot escalate a place past `unverified`, checked by attempting
it through the traveler's own client; and a mocked registry failure still
lets the place, the import, and trip creation all succeed.

**What Phase 7 deliberately did not do:** touch `lib/places/repository.ts`,
`lib/places/normalize.ts`, or `lib/places/validation.ts` — the resolver,
already built and already tested by Phase 2's own review, needed no change,
only a caller. No migration, no new `ServiceName`, no service-role client
introduced anywhere in the call path. The itinerary editor's own manual
"add a place" insert sites
(`app/api/travel/itinerary/[tripId]/route.ts`,
`.../generate/route.ts`) also write fresh `destination_places` rows and are
not wired to the registry by this phase — identified while auditing every
insert site, deliberately left alone as a separate, unapproved scope
expansion.

**Known limitation, inherited from Part 9 and not addressed here — corrected
after the Phase 7 review found the original wording wrong.** Two different
travelers each importing the same unpublished real-world place do **not**
produce two canonical rows. What actually happens, verified against the real
migrations rather than assumed:

1. Alice imports the place. One `places` row is created, `unverified`, owned
   by her. Her `destination_places` row gets `canonical_place_id` set to it.
2. Bob imports the same real place while Alice's row is still `unverified`.
   `places_identity_idx` — `UNIQUE (name_normalized, substr(geohash, 1, 7))`,
   with no owner column in it at all — refuses a second row for the same name
   and cell, exactly as it is designed to.
3. The recovery path for that refusal is a proximity re-lookup on Bob's own
   session client. `places_read_public_or_own` hides Alice's still-unverified
   row from Bob, so his lookup finds nothing.
4. Bob's `destination_places` row is written successfully — his import still
   reports the place as added, not failed — but it stays unlinked:
   `canonical_place_id` is `NULL`.

So the registry never holds a duplicate; it holds one row, plus one
traveler the row correctly refuses to reveal to. **The link is not backfilled
retroactively when Alice's place is later published** — Bob's row stays
`NULL` unless he imports that place again after publication, at which point
the ordinary published-place path (proven in
`tests/places.registry.rls.test.ts`) resolves it. Phase 7 makes the registry
reachable; it does not change who can see what in it, and it does not add
any process that revisits an old unlinked row once visibility changes.

**Staging validation — still BLOCKED / OUTSTANDING, unchanged in kind, one
item added.** No session doing any phase of this work has held staging
Supabase credentials or network access to Supabase. Part 9's four-point
backfill checklist (row count, zero-unexpected-merges, wall-clock time,
sampled round-trip) remains unrun. Phase 7 adds a fifth, specific to what it
wires in — recorded in Part 9's own "Open items carried forward" list rather
than duplicated here — and it must not be reported as passed until an
owner or a session with real staging access runs it.
