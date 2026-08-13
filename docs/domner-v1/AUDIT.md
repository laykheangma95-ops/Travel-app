# DOMNER V1 — Phase 1 Audit

**Status:** Complete. Read-only. No code, schema or config was changed.
**Branch:** `claude/domner-v1-monetization-muld7e`
**Scope of the audit:** the live root storefront (`app/`, `lib/`, `components/`,
`supabase/`). The `apps/*` and `packages/*` workspaces are Phase-1 empty shells
(see `CLAUDE.md` §8) and are recorded here but are not part of the monetization
surface.

> **This file is the source of truth from here on.** Per §0.1, the repo is not
> re-scanned. A source file is opened again only when it is about to be edited,
> or when this document is provably wrong about it.

---

## 0. Headline findings

Five things materially change the shape of Phases 2–4. Read these before the
tables.

1. **There is no external AI in this product.** Not one call to Anthropic,
   OpenAI, or OpenRouter exists anywhere in the code. `@anthropic-ai/sdk` is
   installed in `package.json` but imported by nothing. The "AI" chatbot
   (`/api/chat`) runs a deterministic local intent classifier and template
   engine on our own server, at zero marginal cost. **The premise of §3.3 (AI
   cost tiers) does not currently hold** — there are no AI token costs to tier.
2. **There is no itinerary generation.** `trip_plans.generated_itinerary` is a
   JSONB column that is *read* in three places and *written* in none. There is
   also no create/update path for trips at all — no `POST /api/travel/trips`,
   no server action, no client-side insert. Trips are read-only in the shipped
   app. The single most-cited Trip Pass feature in the brief does not exist yet.
3. **There is no saved-places table.** "Saved places" is derived from a JSONB
   key inside `generated_itinerary`, or from checklist rows tagged
   `category = 'places'`. There is nothing to gate.
4. **The eSIM has no activation state or validity window.** `esim_orders` has
   `fulfilled_at` (when the QR was *delivered*) and `duration_days` (plan
   length). It has no `activated_at` and no `expires_at`. GoHub's fulfil
   webhook carries an `activationExpiryDate` per serial, but that value is
   parsed and never persisted. **Travel Mode as specified (§3.1 L4) cannot be
   computed from current data.**
5. **Every database write already goes through a server route.** There are zero
   client-side Supabase `insert`/`update`/`delete` calls in `app/` or
   `components/`. This is the single best thing about the current architecture
   for entitlement work: there is a real server-side choke point for every
   mutation.

### The three things that will most resist a central entitlement layer

**1 — There is no write path to gate on the features the brief wants to gate.**
Trips, itineraries and saved places are all read-only or non-existent. A gate
needs an action to sit in front of. For Trip Pass and Plus, Phase 4 would be
gating endpoints that must first be *built*, which puts feature work on the
critical path of monetization work and collides directly with §0.3 ("prefer a
new module + a thin call site over modifying existing logic" assumes there is a
call site).

**2 — Identity is split three ways, and one of the three has no user ID.**
`lib/serverAuth.ts` resolves a Supabase `User`; `lib/staff.ts` resolves a
separate `staff_users` role; and checkout supports **guest orders keyed by
email** (`esim_orders.user_id` is nullable, `ON DELETE SET NULL`, and
`saved_flights.guest_email` exists for the same reason). An eSIM bought as a
guest has no `user_id` to hang a Travel Mode entitlement on. The resolver
contract in Phase 3 must answer "who is this?" for a subject that may be a
`uuid`, an email, or an order number — or the eSIM→Travel Mode loop silently
excludes the guest buyers, who are a large share of a Cambodian storefront's
traffic.

**3 — Money and time are modelled loosely, and entitlements need both to be
exact.** Money is `DECIMAL(10,2)` throughout (`CLAUDE.md` §12 conflict #4, still
undecided), and there are no timestamps anywhere that represent an entitlement
window. Order status is a five-value `TEXT CHECK` constraint
(`pending/paid/fulfilled/cancelled/refunded`) with no `expires_at`, no grace
period, and no timezone policy — the app has no stored user timezone at all.
Every state machine in §4.2 (subscription, trip pass, eSIM window) needs an
expiry instant and a clock, and neither exists today.

---

## 1. Features, routes, entry points

43 pages, 30 API routes. Route groups: `(auth)`, `(dashboard)`, `(legal)`, plus
ungrouped public routes and `/admin`.

### Public / customer pages

| Route | What it does |
|---|---|
| `/` | Home. Renders per *travel state* (see §5), not as a fixed page. WebGL globe. |
| `/explore` | Destination discovery. |
| `/destination/[slug]` | Destination detail; live weather + FX via `/api/destination/[slug]/live`. |
| `/esim`, `/esim/[country]` | eSIM catalogue and per-country plans. |
| `/esim/checkout`, `/cart` | Checkout. **Locked area.** |
| `/order-confirmation/[id]` | Post-purchase; offers the Telegram delivery deep link. |
| `/flights`, `/flights/[flightNumber]` | Flight Guardian — live tracking. |
| `/arrival/[flightNumber]` | Arrival experience. |
| `/airport-board/[code]`, `/airport-guide` | FIDS board and airport walkthroughs. |
| `/trips`, `/trips/[tripId]`, `/trips/[tripId]/memories` | Trip workspace. **Read-only** (see §0.2). |
| `/checklist` | "Am I Ready?" pre-trip checklist. |
| `/emergency` | Offline-capable emergency phrases. |
| `/track/[token]` | Public share link for a tracked flight. |
| `/you`, `/you/notifications` | Traveller profile and notification inbox. |
| `/updates` | Changelog / product updates. |
| `/affiliate` | Affiliate application. |
| `/apsara-hero` | Brand/marketing page. |
| `(auth)/*` | sign-in, sign-up, forgot-password, reset-password. **Locked area.** |
| `(dashboard)/*` | dashboard, my-esims, my-trips, settings. Middleware-gated. |
| `(legal)/*` | privacy, terms, refunds. |

### Admin pages (`/admin`)

`/admin` · `/admin/orders` · `/admin/staff` · `/admin/reports` ·
`/admin/support` · `/admin/affiliates` · `/admin/providers` ·
`/admin/generate-esim`

### API routes

| Route | Methods | Auth | Rate-limit bucket |
|---|---|---|---|
| `/api/chat` | POST | none | `chat` (20/min) |
| `/api/esim` | GET | none | `catalog` (120/min) |
| `/api/destination/[slug]/live` | GET | none | ISR `revalidate = 900` |
| `/api/flights`, `/flights/live`, `/flights/predict`, `/flights/suggest` | GET | none | `flightData` (30/min) |
| `/api/flightradar`, `/api/fids` | GET | none | `flightData` |
| `/api/travel/state` | GET | optional — guests get a `new_user` snapshot | `session` (60/min) |
| `/api/travel/trips` | **GET only** | `requireUser` | `session` |
| `/api/orders` | GET | user | — |
| `/api/payments/stripe` | POST create · PUT webhook | none (webhook signature) | `checkout` (5/min) |
| `/api/payments/aba` | POST create · PUT webhook | none (webhook signature) | `checkout` |
| `/api/notifications` | POST, PUT | staff/service on send | `notifications` (10/min) |
| `/api/notifications/dispatch` | POST | `requireAdminOrService` | — |
| `/api/notifications/inbox` | GET, PATCH | user | — |
| `/api/notifications/preferences` | GET, PUT | user | — |
| `/api/push/subscribe` | POST, DELETE | user | — |
| `/api/telegram/webhook` | POST | Telegram secret | — |
| `/api/webhooks` | POST | none — affiliate click/apply only | `publicWrite` (20/min) |
| `/api/admin/*` (orders, staff, staff/invite, reports/sales, support, affiliates, providers, session) | GET/POST/PATCH | `requireStaff` / `requirePermission` | `session` |
| `/api/health` | GET | none | — |

**Entitlement observation:** every mutating route is wrapped by the `route()`
helper in `lib/http.ts`, which already threads `rateLimit` and `name`. That
wrapper is the natural single insertion point for a gate.

---

## 2. AI features

| Item | Reality |
|---|---|
| Provider | **None.** No network AI call exists. |
| Engine | `lib/domnerEngine.ts` (350 lines) — deterministic reply generation. |
| Classifier | `lib/intentClassifier.ts` + `lib/intentFeatures.js` + `data/intentModel.json` — a trained local model, shipped as JSON. |
| Knowledge | `lib/domnerBrain.ts` exports `DOMNER_FACTS`, built from `data/destinations.ts` + `data/esimPlans.ts`. It also exports a Claude system prompt that **nothing imports**. |
| Answers | `lib/intentAnswers.ts` — templated bilingual responses. |
| Endpoint | `POST /api/chat`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. |
| Streaming | No. Single JSON response. |
| Context size | History capped at 20 turns × 2,000 chars per message. |
| Frequency | Bounded only by the `chat` rate limit: 20/min per IP, per warm instance. |
| Marginal cost | **$0.** CPU only. |
| Failure mode | Cannot fail on billing; wrapped in a try/catch returning a canned bilingual reply. |

Training/eval scripts exist under `scripts/`: `intent-gap.mjs`, `seed-data.mjs`,
`generate-questions.mjs`, `train-intent.mjs` (`npm run intents:*`).

**`COSTS.md` §2 row 9 and §3b are stale** — they describe "AI chat — Claude via
OpenRouter … already wired to Claude Haiku" and an `OPENROUTER_API_KEY`. No such
key is read anywhere in `lib/env.ts` or the codebase. Logged in `FINDINGS.md`.

---

## 3. Itinerary system

| Question | Answer |
|---|---|
| Generation path | **Does not exist.** |
| Storage | `trip_plans.generated_itinerary JSONB` |
| Written by | Nothing. Zero writes in the repo. |
| Read by | `lib/travel/context.ts:97–118` (derives readiness), `lib/travel/insights.ts:150`, `components/travel/TripWorkspace.tsx`. |
| Expected shape (inferred from readers) | `{ stay \| hotel \| accommodation, places: [...] }` |
| Edit flow | None. |
| Trip create/update/delete | None — no route, no server action, no client insert. |

`components/travel/TripWorkspace.tsx` renders anchored sections (`#stay`,
`#places`, `#itinerary`, `#weather`) so notifications can deep-link into them,
but the sections display empty-state copy because nothing populates them.

---

## 4. Flight & travel data

| Provider | Auth | Used for | Cadence | Cost |
|---|---|---|---|---|
| `api.adsb.lol`, `api.airplanes.live`, `opendata.adsb.fi` | none | Live aircraft position/altitude/speed (`lib/liveFlight.ts`) | on demand, `flightData` limited | free, crowdsourced |
| `api.planespotters.net` | none | Aircraft photos | on demand | free |
| AeroDataBox via RapidAPI (`lib/aeroDataBox.ts`) | `RAPIDAPI_KEY` | Scheduled status: gate, terminal, published delay | `revalidate` 3600 (search) / 60 / 90 (status) | metered; **falls back to realistic mock data with no key** |
| `api.open-meteo.com` (`lib/live/weather.ts`) | none | Destination weather | `next.revalidate` | free |
| `open.er-api.com` (`lib/live/rates.ts`) | none | FX rates | `next.revalidate` | free |

Also: `lib/delayPrediction.ts` (local heuristic), `lib/airportCoords.ts`,
`data/airportGuides.ts`, `data/customsRules.ts`, `data/scamAlerts.ts`,
`data/emergencyPhrases.ts` — all static, all free.

---

## 5. Travel state machine

`lib/travel/state.ts` is pure and dependency-free. It is the closest thing the
app has to a context engine, and Phase 3 should treat it as the input to
entitlement decisions, not a competitor to them.

- **States:** `new_user` · `discovering` · `planning` · `booked` · `pre_trip` ·
  `at_airport` · `traveling` · `post_trip`
- **Readiness steps:** `flight` · `stay` · `esim` · `places` · `itinerary`
- **Assembled by:** `lib/travel/context.ts` (server-only) — reads `trip_plans`,
  `trip_checklist_items`, `saved_flights`, `esim_orders`.
- **Derived by:** `deriveTravelState(context)`
- **Surfaced at:** `GET /api/travel/state` (guest-safe) and
  `GET /api/travel/trips` (`requireUser`).
- **Copy/prompt layer:** `lib/travel/insights.ts` already prioritises nudges
  ("connectivity beats itinerary polish"). **This is the existing upgrade-prompt
  surface** — §0.3 forbids a parallel one, so Phase 5 must extend
  `insights.ts` rather than add a new prompt component.

---

## 6. Notifications

| Aspect | Detail |
|---|---|
| Channels | Web Push (W3C, `lib/push/webPush.ts`, VAPID) and FCM (`lib/firebase.ts`); one `push_subscriptions` table with a `provider` discriminator. Plus an in-app inbox (`notifications` table) and Telegram (`lib/telegram.ts`, `lib/telegramOps.ts`). |
| Catalogue | `lib/notifications/catalog.ts` — typed `NotificationKind`s with a fixed `category`, `level` (priority) and `preference` key. Unknown kinds are rejected. |
| Engine | `lib/notifications/engine.ts` — `notify()` checks preferences, quiet hours, a per-user push cooldown, and a `dedupeKey`. |
| Preferences | `notification_preferences` table + `lib/notifications/preferences.ts`; per-category booleans incl. `trip_itinerary`. |
| Entry point | `POST /api/notifications/dispatch`, `requireAdminOrService` only. Callers cannot set the level. |
| Cost | $0 (FCM free; web push self-hosted; Telegram free). |

---

## 7. eSIM

**Order flow.** `/esim/[country]` → `/cart` → `/esim/checkout` →
`POST /api/payments/{stripe|aba}` → `startPayment()` in
`lib/payments/pipeline.ts` prices the cart server-side (`lib/pricing.ts`),
creates the order + `order_items` (`lib/orders.ts`), returns a gateway session →
gateway redirect → `PUT /api/payments/{stripe|aba}` webhook →
`handlePaymentWebhook()` → `transitionOrder(..., 'paid')` → `announceOrder()` →
`fulfilOrder()`.

**Fulfilment** (`lib/fulfilment.ts`) is automated: it provisions through the
supplier registry (`lib/providers/esim`, `lib/gohub/*`) and falls back to
`queueForManualFulfilment()` if no supplier can deliver. It never marks an order
`fulfilled` without an actual eSIM.

**Delivery** (`lib/esimDelivery.ts`, server-only, **locked**): email is
unconditional when an address is held; Telegram is an additional opt-in channel
via a hashed connect token minted at checkout.

**GoHub** (`lib/gohub/`): `client.ts` (real, retrying, IP-whitelisted),
`catalog.ts`, `normalize.ts`, `errors.ts`, `apiLog.ts`,
`webhook.ts`. Webhook events: `b2b.order_sale`, `b2b.order_fulfill`; HMAC via
`x-hmac-signature`; in-memory replay guard (`webhookKey`/`markSeen`). A local
mock lives in `mock-gohub/` (`npm run mock`, `npm run test:contract`).

**Activation state — the gap.** `WebhookFulfilledSerial.activationExpiryDate`
is parsed in `lib/gohub/webhook.ts:135` and is not written to any column. There
is no `activated_at`, no `expires_at`, no supplier-side status poll. The only
time signals on an order are `created_at`, `paid_at`, `fulfilled_at`,
`updated_at`, plus the plan's `duration_days`.

---

## 8. Accounts, auth, session

- **Provider:** Supabase Auth. Browser client `lib/supabase.ts` (`getSupabase()`
  returns `null` when unconfigured); SSR client via `@supabase/ssr` in
  `middleware.ts` and `lib/serverAuth.ts:supabaseFromRequest()`.
- **Client-side helper:** `lib/auth.ts` (325 lines) — **locked area**.
- **Server helpers** (`lib/serverAuth.ts`): `getUser`, `requireUser`,
  `isAdminEmail`, `requireStaff`, `requirePermission`, `requireAdmin`,
  `verifyServiceToken`, `requireAdminOrService`.
- **Profile table:** `profiles` (id = `auth.users.id`).
- **Edge gate:** `middleware.ts` refreshes the session cookie on every
  non-static request and gates `/admin` + `/dashboard|/my-esims|/my-trips|/settings`
  before any HTML ships. Unconfigured Supabase in production *denies* rather
  than waves through.
- **Auth invariants (locked, `docs/LOCKED.md`):** phone verification is never
  required to sign up or buy; at least one sign-in path works with no cellular
  service; `recovery_codes` and `otp_attempts` back that up
  (migration `001_auth_methods.sql`).
- **Guests are first-class.** `esim_orders.user_id` is nullable;
  `saved_flights.guest_email` exists; migration `005_restore_guest_order_claim.sql`
  lets a guest order be claimed after sign-up.

---

## 9. Staff roles & permissions (existing gating)

`lib/staff.ts` — 5 roles over 9 named permissions, backed by `staff_users` and
audited to `staff_events`. Enforced at three layers: `middleware.ts` (edge),
`requireStaff`/`requirePermission` (route), RLS (`staff_read_own` — a staff user
can read only their own row). Bootstrap admin via `ADMIN_EMAIL`.

Roles: `viewer` · `support` · `ops` · `finance` · `admin`. Documented in
`docs/STAFF-ROLES.md`.

**This is staff authorization, not customer entitlement.** It should not be
extended to carry plans — but its shape (named capabilities, a role→capability
map, one server-side check per route) is the proven in-repo pattern the Phase 3
resolver should mirror.

**`lib/tier.ts` is not an entitlement system.** Despite the name, `Tier` there
means `full | reduced | static` — a *device rendering* tier for the WebGL globe.
Nothing in Phase 4 should touch it or reuse the name.

---

## 10. Database

Schema of record: `supabase/schema.sql` (577 lines) plus 7 migrations. Migration
order is documented in `docs/SUPABASE-PROJECTS.md`.

> **Row counts: not obtainable.** There is no `.env` in this container (only
> `.env.example`) and therefore no database connection. Every count below is
> unknown. If Ty wants real counts, they must come from the Supabase dashboard
> or a connection string.

| Table | Purpose | RLS | Policies |
|---|---|---|---|
| `profiles` | User profile, id = auth uid | ✅ | select own or admin; insert own; update own |
| `staff_users` | Staff role assignment | ✅ | `staff_read_own` (SELECT, own row) |
| `staff_events` | Staff audit trail | ✅ | none → default deny |
| `esim_orders` | Orders | ✅ | select own (incl. guest-claim path) |
| `order_items` | Line items → `esim_orders` | ✅ | select own via parent order |
| `order_events` | Append-only order audit | ✅ | admin read only |
| `saved_flights` | Tracked flights (user or guest email) | ✅ | all own; admin select |
| `flight_shares` | Public share tokens | ✅ | owner manage |
| `trip_plans` | Trips + `generated_itinerary` | ✅ | all own; public select when `is_public` |
| `trip_checklist_items` | Checklist | ✅ | all own |
| `trip_memories` | Post-trip photos | ✅ | all own |
| `push_subscriptions` | FCM + Web Push devices | ✅ | all own |
| `notification_preferences` | Per-category opt-outs | ✅ | own |
| `notifications` | In-app inbox | ✅ | select/update/delete own |
| `affiliates` | Affiliate accounts | ✅ | select own or admin; insert own; admin update |
| `affiliate_events` | Clicks / conversions | ✅ | admin select |
| `support_tickets` | Support log | ✅ | all own; admin select |
| `recovery_codes` | Offline sign-in codes (mig 001) | ✅ | select own |
| `otp_attempts` | Anti-abuse counter (mig 001) | ✅ | none → default deny |
| `telegram_links` | Telegram delivery link (mig 002) | ✅ | **service-role only — locked** |
| `esim_deliveries` | Delivery log (mig 002) | ✅ | **service-role only — locked** |

RLS is enabled on **every** table. Helper: `public.is_admin()`. There is no
`current_user_role()` and no `audit_log` table — those belong to the `CLAUDE.md`
§5 target state, not to what is shipped.

**Money:** `DECIMAL(10,2)` on `esim_orders` (`subtotal_usd`, `discount_usd`,
`price_usd`, `cost_usd`) and `order_items` (`unit_price_usd`,
`line_total_usd`). `packages/core/src/money.ts` implements minor units and is
the one real (non-placeholder) file in `packages/*` — it is not wired into the
storefront.

**Order status:** `TEXT CHECK (status IN ('pending','paid','fulfilled','cancelled','refunded'))`.
Not a Postgres enum. Extending it is an `ALTER … DROP CONSTRAINT` + re-add, which
is **not** additive under §0.3 — an entitlement-bearing order state must be a new
column or a new table.

---

## 11. Payments

| Aspect | Detail |
|---|---|
| Gateways | Stripe (international cards) and ABA PayWay / KHQR (`checkout.payway.com.kh`). |
| Abstraction | `lib/providers/payments` registry; `lib/payments/pipeline.ts` is gateway-agnostic. |
| Pricing | Server-side only, `lib/pricing.ts` (244 lines). The client never supplies a price. |
| Create | `startPayment(request, providerId)` — prices cart, writes order + items, returns gateway session. `checkout` rate limit 5/min. |
| Webhook | `handlePaymentWebhook()`. Verifies signature against the **raw body**; an unverified webhook is a 400, never a success. |
| Idempotency | Two layers: `esim_orders.idempotency_key UNIQUE` guards double checkout; `transitionOrder()` returns `changed:false` on a redelivered webhook, so exactly one confirmation email and one fulfilment attempt occur. |
| Amount reconciliation | Underpayment (`settledAmountCents < expected`) leaves the order pending and logs `payments.underpayment` for a human. A gateway that reports no amount is *not* treated as verified. |
| Refunds | Webhook-driven only (`transitionOrder(..., 'refunded')`). No admin-initiated refund flow, no cap, no approval queue. |
| Config guard | `lib/env.ts` — demo fallbacks are dev-only. In production a missing key is a 503 outage, never a free order. `DOMNER_ALLOW_DEMO` is the explicit staging opt-in. |

**State machine (shipped):**
`pending → paid → fulfilled`, with `pending → cancelled` and
`paid|fulfilled → refunded`. Transitions run through `transitionOrder()` in
`lib/orders.ts`, which writes an `order_events` row for every change.

---

## 12. Architecture

- **Next.js 14.2.35, App Router.** Route handlers only — **no server actions
  anywhere.** Every mutation is an HTTP route wrapped by `route()` in
  `lib/http.ts`, which applies the rate limit, names the operation for logging,
  and normalises errors (`ApiError`, `ok()`, `readJson()`).
- **Auth is checked in the route**, via `lib/serverAuth.ts`. Middleware is
  explicitly documented as defence in depth, not the boundary.
- **Two Supabase clients:** anon (`getSupabase()`) and service-role
  (`getSupabaseAdmin()`, server-only).
- **Shared libs:** `lib/http.ts`, `lib/env.ts`, `lib/logger.ts` (with
  `redactEmail`), `lib/rateLimit.ts`, `lib/i18n.tsx`.
- **Rate limiting** is in-memory and therefore **per serverless instance** — the
  file says so plainly. `UPSTASH_REDIS_REST_URL` is the documented upgrade path
  and is not currently wired. **A usage quota must not be built on this**; it
  needs a database counter.
- **i18n:** `lib/i18n.tsx`, `en` is the source of truth, `km` mirrors every key.
- **Degradation:** every external service no-ops when its env var is missing.
  The app runs with an empty `.env`.
- **Testing:** Vitest (`npm run test`), a GoHub contract suite
  (`npm run test:contract` against `npm run mock`), and `npm run verify`
  (typecheck + lint + test).
- **Workspaces:** `apps/{web,ops,worker}` and `packages/{core,supplier}` are
  Phase-1 shells. Boundary rules are enforced by `no-restricted-imports` and
  fail the build. Untouched by this audit.

---

## 13. Cost model at current and 10× traffic

Marginal cost per user action, from the code:

| Action | Marginal cost |
|---|---|
| AI chat message | **$0** — local engine, CPU only |
| Live flight lookup | **$0** — free ADS-B networks (ban risk, not billing risk) |
| Scheduled flight status | metered *only if* `RAPIDAPI_KEY` is set; mocked otherwise |
| Weather / FX | $0, ISR-cached |
| Push notification | $0 (FCM free tier; web push self-hosted) |
| Order confirmation email | $0 inside Resend's 3,000/mo free tier |
| eSIM sale | Stripe 2.9% + $0.30, or ABA per-transaction — paid out of revenue |
| Page render / API call | Vercel hosting only |

**Current:** ≈ $0–15/month fixed (domain, optional Vercel Pro).
**At 10×:** unchanged in kind. The first thresholds crossed are Resend's
3,000 emails/month and Supabase's free tier, not compute or AI. AeroDataBox is
the only line that can escalate, and only if a key is deliberately added.

**Consequence for Phase 2:** the §3.3 "AI cost tiers" framing has no cost basis
today. Feature placement must be argued on **user value, willingness to pay, and
the strength of the eSIM loop** — not on token spend. If Phase 2 wants a
cost-tiered model, that is a decision to *introduce* real AI spend, not a
description of the status quo, and it should be stated as such.

---

## 14. Permissions & flags that exist today

| Mechanism | Where | Applies to |
|---|---|---|
| Staff roles + 9 permissions | `lib/staff.ts`, `staff_users` | staff only |
| `ADMIN_EMAIL` bootstrap allowlist | `middleware.ts`, `lib/serverAuth.ts` | staff only |
| `DOMNER_SERVICE_TOKEN` | `verifyServiceToken()` | scheduled jobs |
| RLS `all own` policies | every user table | ownership, not tier |
| Rate limits | `lib/rateLimit.ts` | per IP, per instance, not per account |
| `is_public` on `trip_plans` | schema | sharing, not entitlement |

**There is no customer-facing plan, tier, subscription, entitlement, quota or
usage counter of any kind.** Every user has identical access. Phase 4 builds
this from zero — which is good news for §0.3: there is no parallel system to
avoid duplicating.

---

## 15. Documentation cross-reference

`docs/INVENTORY.md` (the `CLAUDE.md` Step A report), `docs/LOCKED.md`,
`docs/STAFF-ROLES.md`, `docs/AUTH.md`, `docs/DELIVERY.md`, `docs/GOHUB.md`,
`docs/TRAVEL-OS.md`, `docs/OPS-CONSOLE.md`, `docs/SUPABASE-PROJECTS.md`,
`COSTS.md`, `STRATEGY.md`, `DEPLOY.md`, `LAUNCH-CHECKLIST.md`.

`CLAUDE.md` §12 lists four unresolved owner decisions (the `esim_orders` name,
the role matrix, support's access, decimal vs minor units). **Conflict #4
(money representation) and the missing order-expiry model are on the critical
path for Phase 3** and are flagged again in §0 above.

---

## 16. Locked areas this work must not touch without sign-off

Per `docs/LOCKED.md` and `CLAUDE.md` §7:

- `lib/auth.ts`, the `(auth)` route group — sign-in/sign-up
- `lib/esimDelivery.ts` and the locked sections of `app/api/payments/*/route.ts`
- `telegram_links`, `esim_deliveries` — service-role only, no bulk read, no
  export endpoint, ever
- `/esim/checkout` and the live purchase flow

**Phase 4 step 6 ("payment → entitlement, eSIM activation → Travel Mode")
lands directly on the locked payment routes.** It needs its own explicit
sign-off before it starts — a general approval of this audit is not that.
