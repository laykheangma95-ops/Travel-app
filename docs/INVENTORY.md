# Step A — Inventory

**Read-only report. No code, schema or configuration was changed to produce it.**

Written against `CLAUDE.md` §5 Step A. It answers six questions: what the site
does today, what is in the database, where auth lives, how checkout and
fulfilment work, where the codebase violates §2 rules 1–10, and what each of
Steps 1–9 still needs.

One limitation, stated up front: **row counts are not in this report.** This
session has no Supabase credentials and no network path to the project, so every
count would be a guess. Everything below is read from the migration files in
`supabase/`, which is the schema in git — the schema that is actually deployed
could differ if anything was ever applied by hand through the dashboard
(§2 rule 7 forbids that, but the report cannot verify it). The count query is
at the end of this document; run it and paste the output back and I will fold it
in.

---

## 1. Folder structure, routing, and what the public site does

Two trees, as `CLAUDE.md` §8 describes. **This report covers the live root
storefront only.** `apps/` and `packages/` are Phase-1 shells and contain no
orders, no auth and no checkout.

```
app/          routes (App Router)      lib/          server + shared modules
components/   React components         data/         static catalogue content
supabase/     schema.sql + 5 migrations   docs/      the written record
types/        domain types             mock-gohub/   local supplier mock
```

### Public routes

| Route | What it does |
|---|---|
| `/` | Homepage (v3) |
| `/esim`, `/cart` | eSIM catalogue and cart — the cart lives in `localStorage` |
| `/flights`, `/airport-board/[code]`, `/arrival/[flightNumber]` | Live flight tracking and FIDS boards |
| `/airport-guide`, `/checklist`, `/emergency`, `/trips` | Travel guidance |
| `/affiliate` | Affiliate signup and referral links |
| `/(auth)/sign-in`, `/sign-up`, `/forgot-password` | Account access |
| `/(dashboard)/dashboard`, `/my-esims`, `/my-trips`, `/settings` | Signed-in customer area |
| `/(legal)/terms`, `/privacy`, `/refunds` | Legal |

### Admin routes — a staff console already exists

`app/admin/` with seven screens: `page.tsx` (dashboard), `orders`, `support`,
`reports`, `providers`, `affiliates`, `staff`, plus `generate-esim`. Backed by
seven API routes under `app/api/admin/`.

This matters for Step 3. The admin shell is **not** missing; it is built, it is
permission-gated, and it does not sit at the `app/(admin)/admin/` path §5 Step 3
specifies.

### API surface

23 route handlers. The ones that carry money or identity: `api/orders`,
`api/payments/stripe`, `api/payments/aba`, `api/webhooks`, `api/esim`,
`api/telegram/webhook`, and the seven `api/admin/*` routes.

---

## 2. The database

15 tables in `supabase/schema.sql`, plus 5 migrations. Every table has RLS
enabled — verified by grep across `supabase/`; 34 policies total.

| Table | Columns | Notes |
|---|---|---|
| `profiles` | id, full_name, email, phone, passport_country, preferred_language, telegram_username, avatar_url, role, created_at, updated_at | Customer identity. `role` here is separate from `staff_users.role` |
| `staff_users` | id, user_id, email, full_name, role, is_active, mfa_enrolled, invited_by, last_seen_at, created_at, updated_at | Staff authority. RLS: read **own row only** |
| `staff_events` | id, staff_email, event_type, from_role, to_role, actor, detail, created_at | Append-only. RLS on, **no policy at all** → service role only |
| `esim_orders` | 33 columns incl. order_number, subtotal_usd, discount_usd, price_usd, cost_usd, status, qr_code_url, esim_iccid, customer_email, customer_phone, idempotency_key | **The rule-1 violation.** Live order table |
| `order_items` | id, order_id, plan_id, country_slug, country_name, plan_name, tier, duration_days, data_gb_daily, unit_price_usd, quantity, line_total_usd | Line items exist, but are eSIM-shaped: no `product_type`, no `fulfillment_status` |
| `order_events` | id, order_id, event_type, from_status, to_status, actor, detail, created_at | Append-only order audit. SELECT policy only |
| `saved_flights`, `flight_shares` | — | Flight alerts and share links |
| `trip_plans`, `trip_checklist_items`, `trip_memories` | — | Trip planner |
| `push_subscriptions` | — | FCM tokens |
| `affiliates`, `affiliate_events` | — | Referral programme, IP stored as a one-way hash |
| `support_tickets` | id, user_id, order_id, subject, message, status, priority, created_at | A stub next to §4's `tickets` model: no category, tier, root_cause, no `ticket_messages` |
| `recovery_codes`, `otp_attempts` | migration 001 | Auth methods |
| `telegram_links`, `esim_deliveries` | migration 002 | **Locked** (`docs/LOCKED.md`). RLS on, no policy → service role only |

Helper functions: `is_admin()` (SECURITY DEFINER over `profiles.role`),
`current_user_email()`, `get_flight_share(token)`.

### Tables §4 asks for that do not exist

`audit_log` · `access_grants` · `suppliers` · `destinations` · `products` ·
`product_esim_details` · `customers` · `orders` · `payments` · `refunds` ·
`fulfillment_attempts` · `tickets` · `ticket_messages` · `supplier_escalations`

None of the §4 enums exist either. Products and destinations are **static files
in `data/`**, not database rows — which is why there is no `cost_price` per
product and no per-product sales pause today.

---

## 3. Where auth is handled

Supabase Auth, with three layers over it. `docs/AUTH.md` and
`docs/STAFF-ROLES.md` are the long version.

| Layer | File | Is it a boundary? |
|---|---|---|
| `AdminGate` component | `components/` | **No.** Cosmetic — renders a friendly message |
| Edge middleware | `middleware.ts` | Defence in depth. 404s `/admin` before any HTML ships, so an anonymous visitor cannot tell the panel exists |
| `requirePermission()` | `lib/serverAuth.ts:191` | **Yes.** Called by every `/api/admin/*` route |

`lib/serverAuth.ts` uses `supabase.auth.getUser()`, not `getSession()` — the JWT
is revalidated against Supabase rather than trusted locally
(`lib/serverAuth.ts:100`). The middleware reads `staff_users` with the caller's
**own** session against the anon key, so no service key is ever present at the
edge (`middleware.ts:81`).

Staff roles are `viewer` `support` `ops` `finance` `admin` over nine permissions
(`lib/staff.ts:24-73`). Routes ask for a permission, never a role name.
`ADMIN_EMAIL` is a break-glass allowlist that resolves to full admin without a
`staff_users` row (`lib/staff.ts:126-143`).

---

## 4. Checkout, payments, and fulfilment

The flow, end to end:

1. **Cart** — `localStorage`. The browser sends `{planId, quantity}` and a promo
   code. Nothing else about price is trusted.
2. **Pricing** — `lib/pricing.ts`. The single source of every charged number.
   Catalogue lookup, quantity caps (10/plan, 20 lines, $2000/order), discount
   resolution that never stacks past 30%. A price arriving from the browser is
   used **only** to detect tampering (`detectPriceMismatch`, `pricing.ts:240`).
3. **Pipeline** — `lib/payments/pipeline.ts`. Gateway-agnostic: price,
   authorize, persist, then hand off to the gateway. The Stripe and ABA routes
   are thin shells because their delivery-channel step is locked.
4. **Payment** — Stripe or ABA PayWay, via `lib/providers/payments/registry.ts`.
5. **Webhook** — only a signature-verified webhook may move an order to `paid`.
   ABA callbacks are verified in `lib/aba.ts:88` with a constant-time compare.
   The settled amount is reconciled against the order before fulfilment.
6. **Fulfilment** — `lib/fulfilment.ts`. **It is automated.**
   `provisionWithFailover()` walks the supplier registry. An order is marked
   `fulfilled` only when a real eSIM exists; if every supplier fails, the order
   stays `paid`, ops get a Telegram alert, and it lands in the admin queue.
   Multi-plan orders go to a human on purpose (`fulfilment.ts:46`).

**Refunds are not implemented.** `refunded` is a status an admin can set by hand
through `/api/admin/orders` PATCH; there is no refund record, no cap, no
approval queue, and no money movement. Nothing auto-refunds — rule 10 holds, by
absence rather than by design.

---

## 5. Violations of §2 rules 1–10, ranked

Ranked by what would actually go wrong.

### 1. HIGH — rule 1: `esim_orders` exists

`supabase/schema.sql:72`, and referenced from `lib/orders.ts`,
`lib/payments/pipeline.ts`, `lib/reports/sales.ts`, `lib/support.ts`,
`app/api/admin/orders/route.ts`, `app/api/orders/route.ts`.

The table is not just named for eSIM, it is **shaped** for it: `country`,
`plan_name`, `duration_days`, `data_gb_daily`, `esim_iccid`,
`esim_activation_code` and `qr_code_url` are columns on the order itself.
`order_items` exists but carries no `product_type` and no per-item
`fulfillment_status`, so a tour and an eSIM cannot sit in one order.

Rule 12 forbids dropping it — it holds live orders. The fix is Step 1: additive
rename to `orders`, add `product_type` and `fulfillment_status` to
`order_items`, backfill, then deprecate the eSIM-specific columns in a **later**
migration. **This touches the live checkout, so it needs explicit approval
before any of it starts** (§6).

### 2. HIGH — rule 5: there is no `audit_log`

Two partial substitutes: `order_events` (order status changes) and
`staff_events` (role changes). Neither covers products, refunds or profiles, and
neither has the schema §4 specifies (actor, action, entity, before/after jsonb).

The good news: both are correctly immutable. `order_events` has a SELECT policy
and nothing else (`schema.sql:433`); `staff_events` has RLS on and **no policy
at all** (`004_staff_roles.sql:152`). No UPDATE or DELETE path exists for any
role. So the append-only half of rule 5 is satisfied — the coverage half is not.

### 3. MEDIUM — rule 4: RLS is on everywhere, but "default deny" is unverified

Every table in `supabase/` has `ENABLE ROW LEVEL SECURITY`. What this report
cannot confirm from files alone is that no permissive policy is wider than
intended, and that the deployed database matches git. Step 2 asks for a SQL test
file asserting one permitted and one forbidden operation per role; that test
does not exist yet, and it is the only thing that would actually prove this.

### 4. MEDIUM — rule 3, `service_role`: 12 files, all server-side, one to watch

`getSupabaseAdmin()` is imported by 12 modules — all `lib/` or `app/api/`, none
in a `'use client'` component. Verified by grep across `app`, `lib`,
`components`. So the key is not reachable from the browser today.

There is no automated guard preventing it in future. Step 8's `service_role`
audit should become a lint rule, not a one-off read.

### 5. LOW — rule 9: business logic is in `lib/`, with one gap

`lib/orders.ts`, `lib/fulfilment.ts`, `lib/pricing.ts`,
`lib/payments/pipeline.ts` all follow the rule. §2 rule 9 names
`lib/refunds/` — it does not exist because refunds do not exist.

### 6. LOW — rule 6: every admin route re-checks

Verified: each `/api/admin/*` route opens with `requirePermission(request, ...)`.
The UI gate is explicitly documented as cosmetic. This one is **already
correct** — recorded here so it is not re-litigated.

### Rules with no violations found

- **Rule 2** — prices computed server-side. `lib/pricing.ts` is exemplary; the
  file's own header documents the vulnerability it was written to close.
- **Rule 7** — 6 migration files in git, none applied via dashboard as far as
  the repo shows.
- **Rule 8** — GoHub is a real client against a documented spec with a contract
  suite (`docs/GOHUB.md`, `mock-gohub/`). ABA is real. Nothing invented.
- **Rule 10** — no auto-refund path exists.

---

## 6. Gap analysis, Steps 1–9

| Step | Exists | Needs changing | Missing |
|---|---|---|---|
| **1 Schema** | 15 tables, RLS on all, 6 migrations, `order_items` + `order_events` | `esim_orders` → `orders`; `order_items` needs `product_type`, `fulfillment_status`, `supplier_reference`, `fulfillment_payload`; money `DECIMAL` → integer minor units | All §4 enums; `products`, `destinations`, `suppliers`, `customers`, `payments`, `refunds`, `fulfillment_attempts`, `access_grants`; order-number sequence (`DMN-YYYY-NNNNN` is generated in app code today) |
| **2 Audit + RLS** | `order_events`, `staff_events`, both immutable; `is_admin()` | `is_admin()` is binary — §3 needs `current_user_role()` | `audit_log`; audit triggers; per-role policies; **the SQL test file** — nothing proves the policies today |
| **3 Admin shell** | `app/admin/` with 7 screens, middleware gate, `requirePermission()` on every route, permission-filtered nav, owner-only staff management writing to `staff_events` | Path is `app/admin/`, not `app/(admin)/admin/`; helper is `requirePermission()`, not `requireRole()` | Nothing structural. **Closest step to done** |
| **4 Orders** | Order list + support console; `orders.read` withheld from support so cost price is not exposed to agents | List needs server pagination, filters, failures pinned to top | Order **detail** page (one screen with payment, items, fulfilment history, activity log); resend-credentials action; copy-escalation-package |
| **5 Refunds** | Nothing but a `refunded` status an admin can set by hand | — | `refunds` table, cap env var, auto-approve ≤ cap, `pending_approval` > cap, `/admin/refunds` queue, ABA `TODO`. **Whole step** |
| **6 Safety net** | Telegram ops alerts on fulfilment failure; automatic failover across suppliers | Alerts fire on failure, not on the ">5 min paid and unfulfilled" rule; no dedupe | Admin home tiles (stuck / paid-unfulfilled / unmatched payments / failures by destination); sales-pause toggle — impossible until products are database rows |
| **7 Support** | `support_tickets` (7 columns); ops console lookup | `support_tickets` → §4 `tickets` (category, tier, root_cause, timestamps) | `ticket_messages`, `supplier_escalations`, tier-1 runbook checkboxes, public `/help/esim` in Khmer working without JS, pre-departure job |
| **8 Hardening** | ABA signature verification with constant-time compare (`lib/aba.ts:88`); `lib/rateLimit.ts` used by 10 routes; PII redaction in `lib/logger.ts` | Confirm unsigned ABA callbacks return **401** specifically | Price-integrity audit job; `service_role` lint rule; security headers review; error monitoring; documented backup restore. **Report-only step — findings first, fixes only on approval** |
| **9 Reconciliation** | Sales report with margin (`lib/reports/sales.ts`), Excel export, unknown-cost orders counted separately rather than assumed zero | — | Daily ABA matching, three exception types, day-close blocking, margin by destination, refund root-cause analysis |

---

## 7. The row-count query

Run this in the Supabase SQL editor for the **production** project and paste the
result back:

```sql
select relname as table_name, n_live_tup as approx_rows
from pg_stat_user_tables
where schemaname = 'public'
order by n_live_tup desc;
```

`n_live_tup` is an estimate maintained by the statistics collector — it costs
nothing and is accurate enough to decide which tables carry real data and
therefore fall under rule 12.

While you are there, this confirms the deployed schema matches git:

```sql
select table_name, count(*) as columns
from information_schema.columns
where table_schema = 'public'
group by table_name
order by table_name;
```

---

## 8. What I need before Step 1

Four decisions, carried into `CLAUDE.md` §12. Step 1 cannot start without the
first two.

1. **The `esim_orders` rename.** Additive rename + backfill touches the live
   checkout. §6 requires explicit approval with the blast radius explained:
   every read path in `lib/orders.ts`, `lib/payments/pipeline.ts`,
   `lib/reports/sales.ts` and both order API routes changes in the same commit
   as the migration, or the site breaks.
2. **Money representation.** §4 says integer minor units; the live schema is
   `DECIMAL(10,2)`. Converting is a data migration over every money column in
   `esim_orders` and `order_items`. Keeping decimals means editing §4.
3. **The role matrix.** §3 lists six roles including `content` and `developer`;
   five are shipped. §3 also grants support "view orders" and "refund ≤ cap",
   both of which the shipped system withholds **deliberately** —
   `docs/STAFF-ROLES.md` explains that giving an agent the browsable order list
   makes every agent a copy of the contact dataset, which `docs/LOCKED.md`
   exists to prevent. Adopting §3 as written reverses a locked-area decision.
4. **Which tree.** §1–§6 never says whether it targets the root storefront or
   `apps/web`. This report assumes the root storefront, per `CLAUDE.md` §8.
