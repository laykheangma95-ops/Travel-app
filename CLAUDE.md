# Domner — Project Context & Build Plan

Read this fully before any task. It defines the architecture, the rules, and the
build order.

> **Two documents were merged into this one.** §1–§6 are the owner's build plan.
> §7–§11 are the repo facts that were already here — locked areas, the two app
> trees, commands, boundary rules, conventions. Both halves are binding.
> Where they disagree, the disagreement is written down rather than resolved
> silently: see §12.

---

## 1. What Domner is

An eSIM platform for **outbound Cambodian travelers**. Tours, hotels and flights
will be added later, so nothing may be hardcoded to eSIM.

- **Stack:** Next.js (App Router) + Supabase + Vercel
- **Customer UI:** Khmer primary, English secondary
- **Staff UI:** English, information-dense, usable on a phone
- **Team:** one non-technical founder. Explain changes in plain language.

**Three layers.** Supabase is the data and auth layer. The Next.js server side
(route handlers, server actions, jobs) is the backend. The admin UI at `/admin`
is a client of that backend. Staff never touch the Supabase dashboard — it
bypasses row-level security.

### This is an existing codebase, not a new project

The customer-facing site is already built and may already be live. This document
describes the **target state**, not a from-scratch build.

- **Inventory before you build.** Never create something that already exists.
  Check the repo and the database first.
- **Extend and improve what exists.** Rename, refactor and add to current
  tables, routes and components rather than replacing them.
- **Migrate, don't recreate.** If a table exists with the wrong shape, write an
  additive migration that reshapes it and backfills the data. Never drop a table
  with real rows in it.
- **The public site must keep working at every step.** No commit may break
  checkout or the customer experience. If a change requires touching the live
  purchase flow, tell me first and describe the blast radius.
- **Where something already meets the target, leave it alone** and say so.
  "Already correct, no change needed" is a valid and useful answer.

---

## 2. Non-negotiable rules

Apply to every task, without being asked.

1. **Product-type agnostic.** An order has typed line items. Never create an
   `esim_orders` table.
2. **Prices are computed server-side** from the database. Never accept price,
   total, or product config from the client.
3. **`service_role` key is server-side only.** Never reachable from browser code.
4. **RLS on every table, default deny.**
5. **`audit_log` is append-only.** No UPDATE or DELETE policy for any role,
   including owner.
6. **Every server action re-checks the role.** Hiding a button is not a
   permission.
7. **Schema changes are migration files in git.** Never applied via the
   dashboard.
8. **Never invent GoHub or ABA API endpoints.** Define the interface, mark
   `TODO`, and tell me what you need.
9. **Business logic lives in `lib/` server modules** (`lib/orders/`,
   `lib/fulfillment/`, `lib/refunds/`), not inside components.
10. **Never auto-refund.** Alert a human; a human decides.
11. **Never rebuild what exists.** Search the codebase before creating any file,
    table, route or component.
12. **Never drop or truncate a table containing real data.** Additive migrations
    with backfill only.
13. **Never break the public customer site.** It takes priority over any admin or
    refactor work.
14. **Preserve existing conventions.** Match the current folder structure,
    naming, styling approach and component patterns unless they violate rules
    1–10.

**Known standing exception to rule 1:** `esim_orders` already exists and holds
live orders. Rule 12 forbids dropping it. The path out is Step 1 — an additive
rename plus typed line items — and it is not yet done. See §12 and
`docs/INVENTORY.md`.

---

## 3. Roles

`owner` · `ops` · `support` · `finance` · `content` · `developer`

| Capability | owner | ops | support | finance | content |
|---|---|---|---|---|---|
| View orders | ✅ | ✅ | ✅ | ✅ | ❌ |
| View customer PII | ✅ | ✅ | ✅ | masked | ❌ |
| See `cost_price` / margin | ✅ | ✅ | ❌ | ✅ | ❌ |
| Resend credentials | ✅ | ✅ | ✅ | ❌ | ❌ |
| Retry fulfilment | ✅ | ✅ | ❌ | ❌ | ❌ |
| Refund ≤ cap | ✅ | ✅ | ✅ | ❌ | ❌ |
| Refund > cap | ✅ | ❌ | ❌ | ❌ | ❌ |
| Products & pricing | ✅ | edit only | ❌ | ❌ | ❌ |
| Destination content | ✅ | ❌ | ❌ | ❌ | ✅ |
| Payments & reports | ✅ | ✅ | ❌ | ✅ | ❌ |
| Assign roles · view audit log | ✅ | ❌ | ❌ | ❌ | ❌ |

`developer` has no admin data access; dev/staging only, production read-only
logs.

**What is actually shipped today is a different, narrower matrix** — five roles
(`viewer` `support` `ops` `finance` `admin`) over nine named permissions in
`lib/staff.ts`, documented in `docs/STAFF-ROLES.md`. The two matrices conflict
on three points, listed in §12. Do not quietly migrate one into the other.

---

## 4. Data model

**Enums:** `user_role` · `product_type` (esim, tour, hotel, flight, insurance) ·
`order_status` (pending_payment, paid, fulfilling, completed, partially_failed,
failed, refunded) · `fulfillment_status` (pending, processing, fulfilled,
failed, refunded) · `refund_status` (pending_approval, approved, processing,
completed, declined)

**Identity:** `profiles` (role, is_active) · `audit_log` (actor, action, entity,
before/after jsonb) · `access_grants`

**Catalogue:** `suppliers` · `destinations` (name_en, name_km,
intelligence_content_km) · `products` (type, sku, name_en, name_km,
supplier_plan_ref, cost_price, retail_price, is_active, sales_paused) ·
`product_esim_details` (data_amount_mb, validity_days, coverage_networks, apn)

**Transactions:** `customers` · `orders` (order_number `DMN-YYYY-NNNNN`, status,
totals, travel_start_date) · `order_items` (product_type, fulfillment_status,
supplier_reference, fulfillment_payload jsonb) · `payments` · `refunds` ·
`fulfillment_attempts`

**Support:** `tickets` (category, tier, root_cause, timestamps) ·
`ticket_messages` · `supplier_escalations`

Money in integer minor units, never floats. Store transaction and settlement
currency separately.

> The live database stores money as `DECIMAL(10,2)`, not integer minor units.
> Changing that touches the live checkout, so it is a Step 1 decision, not a
> drive-by fix.

---

## 5. Build order

Execute in sequence. Stop after each step.

Every step below means **"bring the current codebase to this state"** — not
"build this from nothing." Start each step by checking what already exists, then
report what's missing, what needs changing, and what is already fine.

**Step 0 — Foundations** *(I do this, no code)*
Root accounts under founder email with MFA · three Supabase projects
(dev/staging/prod) · secrets in Vercel env vars only · branch protection on
`main`.

**Step A — Inventory** *(first Claude Code task, read-only, no changes)*
Produce a written report covering:
- Current folder structure, routing, and what the public site does today
- Every existing Supabase table and column, with approximate row counts
- Where auth is handled today, and whether any admin or staff interface already
  exists
- Current checkout and payment flow, and whether fulfilment is automated at all
- Every violation of rules 1–10, with file and line, ranked by severity
- A gap analysis: for each of Steps 1–9, what exists · what needs changing ·
  what is missing

*Done when:* I have the report. **Change nothing in this step.**
**Status: delivered — [`docs/INVENTORY.md`](docs/INVENTORY.md).**

**Step 1 — Schema reconciliation.** Bring the existing database to the §4 model.
- Keep existing tables that already fit; add missing columns rather than new
  parallel tables
- Reshape mismatched tables with additive migrations plus data backfill, then
  deprecate old columns in a later migration — never in the same one
- If orders are currently eSIM-specific, migrate to the order + typed line-item
  model and backfill existing orders into `order_items`
- Add missing enums, indexes, `updated_at` triggers, order-number sequence
- RLS not yet enabled

*Done when:* the migration applies to a copy of production data without loss,
existing orders still render correctly on the public site, and you have shown me
the before/after table shapes.

**Step 2 — Audit log + RLS.** Audit triggers on orders, order_items, refunds,
products, profiles. `current_user_role()` helper. Policies matching §3. A SQL
test file asserting one permitted and one forbidden operation per role.
*Done when:* all tests pass; support cannot read `cost_price`; nobody can modify
`audit_log`.

**Step 3 — Admin shell.** Route group `app/(admin)/admin/`, separate from the
public site. Middleware with server-side session check. `requireRole()` helper
called by every page. Nav filtered by role. Owner-only user management writing to
audit_log.
*Done when:* a support user hitting `/admin/finance` by URL is rejected
server-side.

**Step 4 — Orders.** List with filters, search, server pagination, failures
pinned to top. Detail page: customer, order, payment, items
(QR/ICCID/codes/APN for eSIM), fulfilment history, activity log. Actions: resend
credentials (rate-limited), retry fulfilment (owner/ops), copy escalation
package.
*Done when:* support can work a ticket from one screen and cannot see cost price.

**Step 5 — Refunds.** Cap from env var (default $30). At or under cap →
auto-approved. Over cap → `pending_approval` regardless of role except owner.
`/admin/refunds` queue with owner approve/decline. ABA call left as a defined
`TODO`.
*Done when:* a crafted $500 request from support creates a pending record, never
an approved one.

**Step 6 — Fulfilment safety net.** Admin home showing stuck orders,
paid-but-unfulfilled, unmatched payments, failures by destination. Telegram alert
when an order is paid >5 min with items unfulfilled, no duplicates. Sales pause
toggle per product and per destination, owner/ops only, hides from public site
immediately.
*Done when:* a simulated supplier failure produces an alert within 5 minutes.

**Step 7 — Support layer.** Ticket log (a log, not a ticketing product — no inbox
integration or auto-assignment). Tier-1 runbook as per-ticket checkboxes, ending
in an escalation package. Public `/help/esim` in Khmer, deep-linkable per step,
works without JavaScript. Pre-departure job sending setup instructions the day
before travel, exactly once.
*Done when:* an agent can go from ticket to escalation package in under two
minutes.

**Step 8 — Hardening.** ABA webhook signature verification (reject unsigned with
401). Rate limits on login, checkout, resend. Server-side price integrity audit.
`service_role` usage audit. Security headers. Error monitoring with PII scrubbed.
Backup restore procedure documented.
**Report findings first, ranked by severity, with file and line. Fix only what I
approve. Do not fix and report in the same pass.**

**→ LAUNCH HERE**

**Step 9 — Reconciliation** *(post-launch)*. Daily ABA matching with three
exception types, day cannot close with unresolved exceptions. Monthly margin by
destination. Refund analysis by root cause.

---

## 6. How to work with me

- **One step at a time.** After each, show the diff, explain in plain language
  what changed and what could break, then wait for my confirmation.
- **Before coding, always report first:** what already exists, what you will
  change, what you will add, and what you will leave alone. Wait for my
  go-ahead.
- **Flag ambiguity, don't guess.** Especially anything involving GoHub or ABA.
- **Never bundle unrelated changes** into one commit.
- **If you find an existing violation of §2**, stop and tell me before
  continuing.
- **Anything touching the live checkout or payment flow needs my explicit
  approval first**, with the risk explained in plain language.
- **Prefer the smallest change that reaches the target.** A rewrite is a last
  resort, and you must justify it before starting.

---

## 7. 🔒 Locked areas — read before editing

Authentication, customer identity, and eSIM QR delivery are **locked**. Do not
modify the files listed in **[`docs/LOCKED.md`](docs/LOCKED.md)** without the
repository owner's explicit permission for that specific change.

If a task seems to require touching them, **stop and ask first.** A general
"go ahead" on another task is not authorisation.

The short version of the invariants — the full list is in `docs/LOCKED.md`:

- Phone verification is never required to sign up or to buy.
- At least one sign-in path always works with no cellular service.
- The QR is always emailed when we hold an address.
- `telegram_links` and `esim_deliveries` are service-role only — no bulk read
  access, no export endpoint, ever.

This section outranks §5. Several build steps land on locked files; each one
needs its own sign-off before it starts.

## 8. ⚠️ Two app trees right now — read this first

The repo is mid-migration to the Domner platform monorepo. There are two trees,
and they are not the same app:

- **The repo root** (`app/`, `lib/`, `components/`) is the live storefront —
  Next.js 14, still the thing that ships. Unchanged.
- **`apps/` and `packages/`** are the new npm-workspaces scaffold from the
  platform build prompt: `apps/web`, `apps/ops`, `apps/worker`,
  `packages/core`, `packages/supplier`. Phase 1 only — empty shells.

**Two decisions are still open.** Do not guess at them:

1. Whether the root storefront moves into `apps/web`. It would relocate files
   listed in `docs/LOCKED.md`, so it needs the owner's sign-off.
2. Where the backend implementation comes from. The build prompt expects a
   reviewed `_staging/` directory that is not in this repo and never has been.
   Phase 2 cannot start without it.

`packages/*/src/*.ts` are mostly documented placeholders that export nothing.
`money.ts` is the exception — it is real. Do not treat a placeholder as an
implementation, and do not invent one for `crypto.ts`.

**§5 does not say which tree it targets.** Everything in §1–§6 is written for the
live root storefront unless the owner says otherwise.

## 9. Commands

```bash
npm run dev        # local dev server (root storefront)
npm run build      # production build (root storefront)
npm run typecheck  # tsc --noEmit (root storefront)
npm run mock       # fake GoHub supplier API on :4000 (mock-gohub/)
npm run test:contract  # GoHub contract suite; needs `npm run mock` running

npm run build:workspaces      # build apps/* and packages/*
npm run typecheck:workspaces  # typecheck apps/* and packages/*
npm run lint:workspaces       # boundary rules — see below
npm run dev:ops               # staff console on :3001
npm run dev:worker            # fulfilment worker
```

There is no test suite for the root app; `npm run build` and `npm run typecheck`
are the gates.

## 10. Platform boundary rules

Enforced by `no-restricted-imports` in `.eslintrc.json`, and they fail the build
rather than warn:

- `apps/web` and `apps/ops` must never import `@domner/supplier`. GoHub
  authorises by IP whitelist; the credentials live only on the worker VM. A
  leaked Vercel env var must not be able to spend the prepaid balance.
- `packages/core` must not import from any app, nor from `@domner/supplier`.
- The Stripe webhook marks orders `paid` and returns. It does not call the
  worker — the worker polls Postgres. Do not turn that into an HTTP call.

`packages/core` does **not** use `import 'server-only'`: that package throws
under plain Node and `apps/worker` is plain Node. Secret-touching core modules
are kept off the `@domner/core` barrel so a client component cannot reach them by
accident; import them by subpath.

## 11. Conventions

- Path alias `@/` maps to the repo root.
- Every external service degrades to a demo/no-op when its env var is missing
  (`getSupabase()` returns `null`, `getResend()` returns `null`, and so on).
  Preserve that — the app must run with an empty `.env`.
- Static content lives in `data/`, domain types in `types/index.ts`.
- Bilingual UI strings go through `lib/i18n.tsx` (`en` is the source of truth,
  `km` mirrors every key).
- Server-only modules must never be imported from a `'use client'` component.

---

## 12. Open conflicts between §1–§6 and what is shipped

Four disagreements. Each needs an owner decision; none may be resolved by
guessing. Full evidence in [`docs/INVENTORY.md`](docs/INVENTORY.md).

| # | §1–§6 says | The repo does | Decision needed |
|---|---|---|---|
| 1 | Never an `esim_orders` table (rule 1) | `esim_orders` exists with live rows; `order_items` hangs off it | Rename-and-backfill in Step 1, or accept the name |
| 2 | Roles are owner/ops/support/finance/content/developer | Roles are viewer/support/ops/finance/admin | Add `content` + `developer`, rename `admin`→`owner`, or keep |
| 3 | support can view orders and refund ≤ cap | support has neither `orders.read` nor any refund permission — deliberate, see `docs/STAFF-ROLES.md` | §3 widens support's access; that reverses a locked-area decision |
| 4 | Money in integer minor units | `DECIMAL(10,2)` throughout the live schema | Convert in Step 1 (touches checkout) or keep decimals |

**Rule for all four:** until the owner decides, the shipped behaviour stands.

## 13. Documentation

| Doc | Contents |
| --- | --- |
| `docs/INVENTORY.md` | Step A report — what exists, rule violations, Step 1–9 gaps |
| `docs/TRAVEL-OS.md` | Travel states, capsules, the notification priority engine, web push, PWA |
| `docs/STAFF-ROLES.md` | Staff accounts, the five roles, and the permission matrix |
| `docs/OPS-CONSOLE.md` | Staff support lookup and the Excel sales statement |
| `docs/AUTH.md` | Sign-in methods, why phone verification is optional, anti-abuse |
| `docs/DELIVERY.md` | eSIM QR delivery by email/Telegram, data protection |
| `docs/LOCKED.md` | The locked file list, invariants, and unlock procedure |
| `docs/GOHUB.md` | GoHub supplier client, normalization, webhooks, contract tests |
| `docs/SUPABASE-OPS.md` | Reading Supabase failures in the log, the schema check, database region |
| `docs/SUPABASE-REGION-MOVE.md` | Runbook for moving the database Tokyo → Singapore |
| `docs/SUPABASE-PROJECTS.md` | Creating a Supabase project (Singapore region), applying the schema, migration order |
| `mock-gohub/README.md` | The local GoHub mock: running it, failure cases, spec quirks |
| `DEPLOY.md` | Deployment |
| `STRATEGY.md` | Product strategy |
