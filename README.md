# Domner App ✈️ 🇰🇭

**Cambodia's first Khmer-language travel super app** — eSIM store, real-time flight tracking,
step-by-step airport guidance, travel checklists, and emergency phrases. Built with Next.js 14,
TypeScript, Tailwind CSS, and Supabase.

> Travel Confidently. Stay Connected.

## Features

| Area | What it does |
| --- | --- |
| 🛒 **eSIM Store** | 20 destinations, 3 plan tiers each, cart + checkout with Stripe & ABA PayWay |
| ✈️ **Flight Guardian** | Live flight dashboard, 90-second polling, Khmer/English alerts, public share links (`/track/[token]`) |
| ✅ **Am I Ready? Checklist** | 3-step wizard that generates a personalized pre-flight checklist per destination |
| 🛫 **Airport Companion** | Step-by-step departure & arrival walkthroughs for 10 airports, scam warnings included |
| 🆘 **Emergency Phrases** | Tap-to-copy phrases in Vietnamese, Thai, Chinese, Japanese — cached for offline use |
| 🎉 **Arrival Experience** | Auto-triggered welcome card with exchange rate, baggage, and safe-taxi info |
| 📸 **Trip Memories** | Shareable trip summary cards with photos and stats |
| 🤝 **Affiliate Program** | 30% commission, referral links with auto-applied discounts |
| 🔐 **Admin Panel** | Live orders, eSIM delivery, affiliate approvals, revenue dashboard |

## Architecture rules

Three rules hold the commerce side together. Breaking any of them is a bug, not a preference.

**1. The server owns every price.** The browser sends intent — `{ planId, quantity }` — and
nothing else. `lib/pricing.ts` is the only module permitted to decide what a customer pays, and it
prices from the catalog. A `totalUsd` arriving from a client is logged as a possible tampering
signal and then discarded.

**2. Demo fallbacks never run in production.** `lib/env.ts` is the single place that answers "is
this service configured?". Outside production an unconfigured service degrades to a labelled
demo. In production `assertConfigured()` throws and the request fails with a 503. A missing key
is an outage, never a free order.

**3. Authorization is decided on the server.** `middleware.ts` gates `/admin` before any HTML is
sent, and every `/api/admin/*` route independently calls `requireAdmin()`. The React gate is
cosmetic — forcing it open reveals an empty panel.

**4. No supplier or gateway is load-bearing.** Nothing in the app calls an eSIM supplier or a
payment provider directly — everything goes through a port (`lib/providers/`). Adding a supplier
is one adapter file; switching supplier is one environment variable; a supplier failing mid-order
fails over to the next one automatically. See [docs/ADDING-A-SUPPLIER.md](docs/ADDING-A-SUPPLIER.md).

## Getting started

```bash
npm install
cp .env.example .env.local   # every key optional in dev — see Demo mode
npm run dev                  # http://localhost:3000
```

### Verify before you push

```bash
npm run verify   # typecheck + lint + test
npm run build
```

CI runs the same four steps on every push (`.github/workflows/ci.yml`).

### Demo mode

In development the app runs without any API keys: payments complete in a sandbox, flight data
comes from a realistic mock, and the admin panel shows a "not configured" banner instead of live
data. Add keys to `.env.local` one service at a time to go live.

**This does not apply in production.** A production build with a missing payment key returns 503
rather than completing the order. `GET /api/health` reports exactly what is missing and returns
503 while anything critical is unconfigured — point your uptime monitor at it.

| Service | Variables | Used for |
| --- | --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Auth, orders, saved flights |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | International card payments |
| ABA PayWay | `ABA_MERCHANT_ID`, `ABA_API_KEY`, `ABA_WEBHOOK_SECRET` | KHQR / ABA payments |
| AeroDataBox | `RAPIDAPI_KEY`, `AEROBOX_HOST` | Scheduled flight status |
| Firebase | `FIREBASE_ADMIN_SDK`, `NEXT_PUBLIC_FIREBASE_CONFIG` | Push notifications |
| Resend | `RESEND_API_KEY` | Order + eSIM delivery emails |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | Admin order alerts |
| Admin | `ADMIN_EMAIL` | Gates `/admin` (empty = nobody) |
| Jobs | `DOMNER_SERVICE_TOKEN` | Authenticates the flight-alert sender |

Live ADS-B flight tracking needs no key at all.

### Database setup

**New project:** run `supabase/schema.sql` in the Supabase SQL editor.

**Existing project:** apply `supabase/migrations/` in order instead — `schema.sql` will conflict.

Then promote your first admin:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'you@domnerapp.com';
```

Set `ADMIN_EMAIL` to the same address. Both are required: the middleware checks the env
allowlist, and the database policies check the role.

## Order lifecycle

```
checkout  →  POST /api/payments/{provider}             ← one route, any gateway
             ├─ prices the cart from the catalog       (lib/pricing.ts)
             ├─ creates the order + line items         (lib/orders.ts)
             └─ returns a client secret / redirect / signed form

payment   →  PUT /api/payments/{provider}              ← signature verified
             ├─ reconciles the settled amount against the order total
             ├─ pending → paid                         (single transition)
             ├─ emails the customer, alerts ops on Telegram
             └─ triggers automatic fulfilment          (lib/fulfilment.ts)

delivery  →  supplier registry                         ← failover + circuit breaker
             ├─ first configured supplier that carries the plan
             ├─ on failure, the next one, within the same request
             ├─ success → paid → fulfilled, customer emailed the QR
             └─ all failed → stays `paid`, ops alerted, manual queue
```

Every transition is recorded in `order_events`, and a redelivered webhook is a no-op — a customer
gets exactly one confirmation email and one fulfilment attempt however many times the gateway fires.

**An order is only ever marked `fulfilled` when a real eSIM exists.** If every supplier is down
the order stays `paid` and lands in the ops queue; the customer is never told their eSIM is ready
when it is not. When a supplier recovers, **Auto** on the order row re-runs provisioning and the
backlog clears itself.

## Supplier independence

`/admin/providers` shows routing live: who is primary, who is configured, whose circuit is open,
and whether automatic delivery is currently active.

| Concern | Answer |
| --- | --- |
| Supplier has an outage | Failover to the next one, mid-request. After 3 failures they are suspended for 60s, then re-probed. |
| Supplier drops a country | No SKU mapped → skipped automatically for that plan only. |
| Supplier changes terms | Reorder `ESIM_PROVIDER_ORDER`. No deploy. |
| Add a second supplier | One adapter file + SKU rows + registry line. |
| Add a payment gateway | One adapter file + registry line. `/api/payments/{id}` already routes. |
| Nobody can fulfil | Order stays `paid`, ops alerted, manual delivery from the admin queue. |

## Project structure

```
app/            Pages (App Router) + API routes
  (legal)/      Privacy, Terms, Refunds
  api/          Payments, admin, orders, flights, chat, health
components/     ui / layout / esim / flights / trips / admin / auth
lib/            env, pricing, orders, auth, http, rateLimit, logger + integrations
data/           Destinations, plans, airport guides, phrases, customs, scam alerts
hooks/          useCart, useSession, useFlightTracking, useNotifications
middleware.ts   Session refresh + route gating
supabase/       schema.sql + migrations/
tests/          Vitest suites for pricing, config, webhooks, auth, rate limiting
types/          Shared TypeScript types
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint
- `npm run test` — Vitest suite
- `npm run verify` — all three, the same as CI
