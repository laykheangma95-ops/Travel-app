# GoHub — the B2B eSIM supplier layer

GoHub sells us eSIMs wholesale. This document covers the client
(`lib/gohub/`), the local mock (`mock-gohub/`), and the contract suite that
holds the two to the same behaviour.

Nothing here is wired into checkout, Stripe or the database yet. This is the
supplier layer and its tests.

---

## Switching between the mock and production

Five environment variables, no code change:

```bash
# Local development — run `npm run mock` in another terminal
GOHUB_BASE_URL=http://localhost:4000/api
GOHUB_PARTNER_ID=domner-mock-partner
GOHUB_API_KEY=domner-mock-key
GOHUB_HMAC_SECRET=domner-mock-hmac-secret
GOHUB_TIMEOUT_MS=15000
```

```bash
# Production — the values GoHub issue us
GOHUB_BASE_URL=https://api.gohub.example/api
GOHUB_PARTNER_ID=…
GOHUB_API_KEY=…
GOHUB_HMAC_SECRET=…
```

That is the whole migration. The client reads the environment at call time, so
nothing is baked in at build.

---

## The catalog and how it is priced

`data/gohubCatalog.ts` is **generated** from GoHub's dealer price list:

```bash
node scripts/build-gohub-catalog.mjs ~/Downloads/GOHUB_PRICE_US_SILVER1.xlsx
```

Re-run it whenever GoHub reissue the sheet, then read the diff. A changed
`costUsd` against an unchanged `priceUsd` is a margin moving under you.

The sheet holds ~3,900 SKUs. The script picks **three per destination** and
prices them. Both decisions live at the top of the script:

| Knob | Value | What it does |
| --- | --- | --- |
| `MARKUP` | 2.8 | headline retail multiple |
| `TIER_MARKUP` | 3.0 / 2.8 / 2.45 | per-tier, so the bigger pack is visibly better value |
| `PRICE_FLOOR_USD` | 2.99 | below this the payment fee eats the margin |
| `FIXED_DATA_PREFERENCE` | 1.5 | how much cheaper fixed data must be to beat daily |
| `MIN_EFFECTIVE_GB_PER_DAY` | 0.4 | thinner than this is not a usable travel plan |

### The three tiers, and why

Three options, not five. A third choice lifts conversion by giving the middle
one something to be the middle *of*; a fourth mostly produces hesitation.

- **Basic** — the entry anchor, so the page never looks expensive at a glance.
- **Standard** — a full week, marked popular. The one we want sold.
- **Premium** — twice the trip. Its real job is making standard look sensible.

The tier markups descend on purpose. A traveller does not compare $7.99 to
$13.99 — they divide by days. So the bigger pack takes deliberately less margin
and shows a real saving:

```
Thailand   3d 1GB/day  $3.99   $1.33/day
           7d 1GB/day  $7.99   $1.14/day   ← popular
          15d 1GB/day  $13.99  $0.93/day
```

Average gross margin across the catalog is **65%**, minimum 54%. The floor
matters: `MAX_DISCOUNT_PCT` caps stacked promos at 30%, and
`tests/gohubCatalog.test.ts` fails the build if any plan's margin drops near it.

### Daily vs fixed data

Each destination commits to **one** allowance model. "1GB/day" next to
"3GB total" is not a ladder a customer can read without doing arithmetic, and a
customer doing arithmetic is not buying.

Daily wins by default — it cannot be exhausted on day one. Fixed is chosen only
where GoHub have priced daily out of the market. Never describe a fixed plan in
GB/day; `describeAllowance()` in `data/esimPlans.ts` is the single place that
decides the wording.

### Destinations served by a regional SKU

France, Germany, the UK and Europe all fulfil from GoHub's single Europe
product, and Canada from the USA/Mexico/Canada one. The same `gohubSku` under
several plan ids is correct. Within one destination it would be a bug, and the
test suite enforces that distinction.

### Where the money is

`costUsd` never reaches the browser. `data/esimPlans.ts` deliberately does not
re-export it or `gohubSku` — margin is not the customer's business and a SKU on
a product page is a SKU in someone's scraper. Server code imports
`data/gohubCatalog.ts` directly.

`lib/providers/esim/skuMap.ts` derives GoHub's mapping from the same generated
file, so a plan and its SKU cannot drift apart.

---

## The client

```ts
import { gohub, sellableItems, sellableListings } from '@/lib/gohub';

const listings = await gohub.getListings({ simType: 'eSIM', categoryCode: 'KH' });
const items = await gohub.getItems({ listingCode: listings.rows[0].code });

const forSale = sellableItems(items.rows, listings.rows);
```

| Method | Notes |
| --- | --- |
| `getCategories` / `getListings` / `getItems` | paginated; returns `{ rows, pagination }` |
| `createOrder` | creates in `pending`; nothing is charged |
| `confirmOrder` / `cancelOrder` | confirmation charges the balance and starts fulfilment |
| `getOrders` / `getOrderBySalesCode` / `getOrderByReference` | |
| `getDataUsage` | |
| `getBalance` | |
| `createTopup` | |

**Server only.** The client carries the API key; never import it from a
`'use client'` component.

### Errors

| Class | Status | Retried? |
| --- | --- | --- |
| `GohubValidationError` | 400, 405, 422 | no |
| `GohubAuthError` | 401, 403 | no |
| `GohubNotFoundError` | 404 | no |
| `GohubDuplicateError` | 409, 430 | no |
| `GohubServerError` | 5xx | yes, 3 attempts |
| `GohubTimeoutError` | timeout / network | yes, 3 attempts |
| `GohubProtocolError` | unparseable 2xx | no |

Backoff is 500ms, 1s, 2s with jitter. `200` and `201` are both success — GoHub
returns either for a created order.

`GohubDuplicateError` deserves a second look: it is not really a failure. It
means the order already exists, so the recovery is
`getOrderByReference(reference)`, never a new reference. Generating a fresh one
is how a customer gets charged twice.

### The exchange log

Every request and response is recorded through `lib/gohub/apiLog.ts` — one
structured line per exchange, with the API key redacted and customer email and
phone masked. When a customer says "I paid and got nothing", this is the only
record that settles it.

Set `GOHUB_API_LOG_PATH` to also append JSONL locally. To write to a
`gohub_api_log` table instead, call `setApiLogSink()` once at startup; nothing
else changes.

---

## What the normalizer fixes

`lib/gohub/normalize.ts` is the only place allowed to know GoHub's shapes.
Everything downstream gets numbers, booleans and nulls.

- `price` strings → integers (VND has no minor unit)
- `days` `"03"` → `3`
- `"UN"` / `"UNLI"` / `"UNGB"` → `{ unlimited: true }`
- `fulfillmentStatus` **or** `fulfilmentStatus`, whichever is present
- `saleCode` **or** `salesCode`
- all status comparisons lowercased
- `specifications[]` flattened to keyed fields, `S21` parsed to a number
- `""` → `null`
- balance read out of the array envelope

And the one with a customer consequence: **data usage cases 3.1 and 4.2 return
a fully zeroed package for a working eSIM.** The telco did not answer; the zeros
are the absence of an answer, not an answer of zero. Both normalize to
`usageAvailable: false` so the UI says "usage unavailable" rather than
"0 MB remaining". See `mock-gohub/README.md` for all seven states.

---

## Webhooks

GoHub calls back twice per order: `b2b.order_sale`, then `b2b.order_fulfill`
carrying the serials.

```ts
import { ingestWebhook } from '@/lib/gohub';

const rawBody = await request.text();          // the RAW bytes, not a re-serialized object
const { event, fresh } = ingestWebhook(rawBody, request.headers.get('x-hmac-signature'));
if (!fresh) return new Response('ok');          // already processed
```

Three rules:

1. **Verify against the raw body.** The HMAC is over the exact bytes sent.
   Re-serializing the parsed object reorders keys and the signature fails.
2. **Be idempotent.** GoHub retries on any non-2xx and can redeliver
   spontaneously. `ingestWebhook` de-duplicates in process, which is enough for
   one instance; the production guarantee must be a unique constraint on the
   ICCID, because two instances never share memory.
3. **An empty `orderDetails` on a `Failed` fulfilment is a real event.** A
   customer has paid and has nothing. It must raise, not return 200 quietly.

---

## Contract tests

The suite in `tests/contract/` runs against whatever `GOHUB_BASE_URL` points at.
Every test passes unchanged against the mock and against real staging.

```bash
npm run mock            # terminal 1
npm run test:contract   # terminal 2
```

### Pointing it at staging

```bash
GOHUB_BASE_URL=https://staging.gohub.example/api \
GOHUB_PARTNER_ID=… \
GOHUB_API_KEY=… \
GOHUB_HMAC_SECRET=… \
npm run test:contract
```

Tests that need supplier-side setup — dropping the balance to zero, redirecting
webhooks at a local receiver, forcing a data-usage state — go through the mock's
`/dev` routes and **skip themselves** when those routes are absent. Everything
else runs for real: catalog paging, filtering, order creation, duplicate
rejection, validation, confirm, cancel, balance.

Against staging the suite creates and confirms real orders and spends real
balance. Check the balance first, and expect the webhook assertions to be
skipped — staging delivers to the deployed endpoint, not to your laptop.

`npm run test:contract` is deliberately not part of `npm run verify`; it needs a
server on the other end. The default gate stays `npm run typecheck && npm run
lint && npm run test`, and `tests/gohubNormalize.test.ts` covers the
normalization layer there with no network.
