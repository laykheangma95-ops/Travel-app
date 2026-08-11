# mock-gohub

A local stand-in for the **GoHub B2B eSIM API**, contract-compatible with their
published spec — including the parts of it that are wrong.

The point is not convenience. It is that when GoHub issues production
credentials, the only thing that changes is environment variables:

```bash
GOHUB_BASE_URL=http://localhost:4000/api   # this server
GOHUB_BASE_URL=https://api.gohub.example/api  # the real thing
```

The same client (`lib/gohub/`) and the same contract test suite run against
both, unchanged.

---

## Running it

```bash
npm run mock          # http://localhost:4000
```

Works with an empty `.env`. Defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MOCK_PORT` | `4000` | |
| `MOCK_PARTNER_ID` | `domner-mock-partner` | must equal `GOHUB_PARTNER_ID` |
| `MOCK_API_KEY` | `domner-mock-key` | must equal `GOHUB_API_KEY` |
| `MOCK_HMAC_SECRET` | `domner-mock-hmac-secret` | must equal `GOHUB_HMAC_SECRET` |
| `MOCK_STARTING_BALANCE` | `5000000` | VND |
| `MOCK_FULFILL_DELAY_MS` | `5000` | per fulfilment stage (there are two) |
| `MOCK_SLOW_FULFILL_DELAY_MS` | `60000` | for `_SLOW` items |
| `MOCK_WEBHOOK_URL` | `http://localhost:3000/api/webhooks/gohub` | |
| `MOCK_WEBHOOK_DUPLICATE` | `false` | send every webhook twice |
| `MOCK_201_RATE` | `0.3` | fraction of order creations answered `201` |
| `MOCK_PERSIST` | `true` | snapshot state to `mock-gohub/.state.json` |

Every request needs all three headers, including on GETs:

```bash
curl http://localhost:4000/api/listings \
  -H 'X-Partner: domner-mock-partner' \
  -H 'X-Authorization: domner-mock-key' \
  -H 'Content-Type: application/json'
```

State (orders, balance, issued ICCIDs) survives a restart via
`mock-gohub/.state.json`. Delete that file, or `POST /dev/reset`, to start over.
Orders left mid-fulfilment when the process dies stay stuck — timers are not
restored, which is realistic enough for the reconciliation path.

---

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/categories` | `parentCategoryCode`, `page`, `perPage` |
| GET | `/api/listings` | `categoryCode`, `simType`, paging |
| GET | `/api/items` | `listingCode`, `simType`, paging |
| POST | `/api/orders` | creates in `Pending` |
| PUT | `/api/orders/{salesCode}/confirmed` | charges the balance, starts fulfilment |
| PUT | `/api/orders/{salesCode}/canceled` | no charge |
| GET | `/api/orders` | `search`, `salesStatus`, `fromOrderDate`, `toOrderDate`, `orderType` |
| GET | `/api/orders/data-usage/{iccid}` | `?forceCase=` |
| GET | `/api/balance` | |
| POST | `/api/orders/topup` | |
| GET | `/mock-qr/{iccid}.png` | a real PNG, no auth |

`/dev/*` routes do not exist on the real API — see below.

---

## Triggering each failure case

### Auth failures

```bash
curl http://localhost:4000/api/categories            # no headers
# {"statusCode":401,"message":"Unauthorized"}
```

Wrong key, missing `X-Partner`, or a missing/incorrect `Content-Type` all give
the same 401 with no hint about which one was wrong. A wrong verb on a real path
gives `{"statusCode":405,"message":"Method not allowed"}`.

### Order validation

| Trigger | Response |
| --- | --- |
| unknown `itemCode` | `404` `Resource not found, item ID: {itemCode}` |
| `quantity` of `0`, `-1` or `1.5` | `400` `Invalid quantity` |
| `shippingEmail: "nope"` | `400` `Invalid email` |
| `shippingPhone: "call me"` | `400` `Invalid phone` |
| any unrecognised field, or malformed JSON | `400` `Wrong argument` |
| reusing a `partnerOrderReference` | `430` already-handled |
| confirming or cancelling twice | `430` already-handled |

### Insufficient balance — the one that matters most

```bash
curl -X POST http://localhost:4000/dev/balance \
  -H 'Content-Type: application/json' -d '{"balance":0}'
```

The next confirmation returns `400` `Insufficient balance` and leaves the order
in `Pending`. Restore with the same route.

### Fulfilment failures, by item code suffix

Deterministic, so tests never race:

| Item code | Behaviour |
| --- | --- |
| `EKHM3DPY01GB03D_FAIL` | `fulfillmentStatus: "Failed"`, webhook carries `orderDetails: []` |
| `EKHM3DPY01GB03D_SLOW` | 60 seconds per stage |
| `EKHM3DPY01GB03D_HANG` | no webhook ever fires; order sits in `Processing` |

Ordinary items complete in two stages: `Processing` (+ sale webhook), then
`Completed` (+ fulfilment webhook with serials).

### Data usage — all seven documented states

```bash
curl 'http://localhost:4000/api/orders/data-usage/8985203108005568xx?forceCase=4.2' -H ...
```

| `forceCase` | ICCID / package | What it means |
| --- | --- | --- |
| `1.0` | EXPIRED / UNAVAILABLE | plan finished; zeros are true |
| `2.0` | UNAVAILABLE / UNAVAILABLE | telco knows nothing about this ICCID |
| `3.0` | PREACTIVE / PREACTIVE | bought, not installed; dates are `null` |
| `3.1` | PREACTIVE / UNAVAILABLE | **zeros are noise, not a reading** |
| `4.0` | ACTIVE / ACTIVE | real numbers, raw floats |
| `4.1` | ACTIVE / PREACTIVE | line up, package not started |
| `4.2` | ACTIVE / UNAVAILABLE | **zeros are noise, not a reading** |

`forceCase` works on any ICCID, issued or not. Without it, a known ICCID gets a
stable case derived from its digits, and an unknown one is a `404`. An ICCID
starting `unsupported_` returns `422`.

**3.1 and 4.2 are the reason this mock exists.** They return a fully zeroed
package for an eSIM that is working. Rendering "0 MB remaining" from those tells
a customer standing in an airport that their data is gone, and they buy a second
eSIM or ask for a refund. `lib/gohub/normalize.ts` turns both into
`usageAvailable: false`.

### Webhooks

Sent to `MOCK_WEBHOOK_URL`, signed with `X-hmac-signature` — base64 SHA256 HMAC
of the **raw** body. Non-2xx responses are retried 3 times with backoff
(1s, 2s, 4s).

```bash
MOCK_WEBHOOK_DUPLICATE=true npm run mock   # every webhook sent twice
```

Redirect them at a local receiver without restarting:

```bash
curl -X POST http://localhost:4000/dev/webhook-url \
  -H 'Content-Type: application/json' -d '{"url":"http://127.0.0.1:5555/hook"}'
```

---

## Deliberately reproduced spec quirks

Every one of these is a real inconsistency in GoHub's API. They are here because
each has a plausible failure mode on our side, and a tidied-up mock would hide
all of them until production.

| Quirk | Failure it guards against |
| --- | --- |
| `price` is a **string** from `/items` (`"177415"`) but a **number** in order responses | string concatenation instead of arithmetic; `NaN` on a price |
| `days` is zero-padded (`"03"`) | `parseInt` without a radix; string sorting of durations |
| Unlimited is `"UNGB"` / `"UNLI"` with `dataAmountValue` `"UN"` / `"UNLI"` | advertising an unlimited plan as `0 GB` or `NaN GB` |
| `fulfillmentStatus` (two Ls) on some orders, `fulfilmentStatus` (one L) on others | every order reported as unfulfilled; eSIMs never delivered |
| `salesStatus` casing varies (`"processing"` / `"Processing"`) | `=== 'Processing'` silently never matching |
| Webhooks say `saleCode`; everything else says `salesCode` | webhook cannot be matched to an order |
| `/api/balance` returns `data` as an **array** with `balance` as a **string** | reading `data.balance`, concluding we have no money, blocking all orders |
| Specification values are `""`, never `null` or absent | `""` rendered as an empty spec row; falsy checks passing by accident |
| Order creation returns `200` **or** `201` at random | branching on `=== 200` and treating a real order as a failure |
| `serials[]` is absent until fulfilment completes | optimistic `serials[0].iccid` throwing mid-delivery |
| `Content-Type: application/json` required on GETs too | 401s that look like a credential problem |
| Active items can belong to an InActive listing | continuing to sell a withdrawn destination |
| Data-usage floats like `16.980000000000018` | assuming clean integers when formatting |

---

## Seed data

`src/seed/` holds the catalog in a compact authoring form, expanded at boot into
GoHub's verbose wire shapes (uuids, timestamps, nested category objects, the
full S1–S21 specification array on every listing).

- **`categories.ts`** — 14 Country Region rows led by our market (KH, TH, VN,
  SG, MY, ID, LA, PH, JP, KR, STA, ASI, GLO, SMT), one InActive (MMR), plus
  ProductType rows.
- **`listings.ts`** — 8 active listings (Cambodia, Thailand, Vietnam, Singapore,
  SEA regional, Asia regional, Japan, Global) and 1 InActive (Malaysia).
  Vietnam carries `S11: Yes` with a KYC link; Thailand carries a long `S13`
  dial-code instruction; Singapore carries an `S14` app restriction; SEA and
  Global carry `S16`/`S17` APN notes. `S21` is `30` on most, `60` on the
  fixed-data listings.
- **`items.ts`** — ~35 items across 3/5/7/10/15/30 days and 1GB/day through
  unlimited, two unlimited items using both spellings, one InActive item, one
  Active item under the InActive listing, and the three failure-injection items.

Specification codes not set in a seed are still emitted — as `""`, which is what
the real API does.

---

## `/dev` routes (not part of the API)

Mounted outside `/api` and outside the auth middleware, so it is obvious at a
glance which routes are real. The contract suite uses them for setup and skips
the tests that need them when they are absent — which is how the same suite runs
against staging.

| Route | Purpose |
| --- | --- |
| `GET /dev/capabilities` | "this is the mock" |
| `POST /dev/balance` | `{"balance": 0}` |
| `POST /dev/webhook-url` | `{"url": "..."}`, or `null` to restore |
| `POST /dev/config` | `{"fulfilDelayMs": 300}` |
| `POST /dev/reset` | wipe orders, ICCIDs, balance |

---

## What this mock is not

- **Not importable.** No production code may `import` from `mock-gohub` — an
  ESLint `no-restricted-imports` rule fails the build if it does. The app talks
  to it over HTTP, exactly as it talks to the real supplier.
- **Not a QR generator.** `/mock-qr/{iccid}.png` returns a genuine, correctly
  encoded 296×296 PNG so the delivery email and PDF pipeline have real bytes to
  fetch and embed. It will not scan.
- **Not wired into anything.** No Stripe, no database, no checkout. That is the
  next task.
