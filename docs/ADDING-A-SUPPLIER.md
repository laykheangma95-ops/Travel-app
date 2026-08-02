# Adding an eSIM supplier

The application never talks to a supplier directly. Everything goes through
`lib/providers/esim/types.ts`, so adding, replacing or failing over between
suppliers is a contained change.

**Adding a supplier touches three files. Nothing else in the codebase changes —
no route, no page, no order logic, no pricing.**

---

## 1. Write the adapter

Most suppliers are a token-authenticated REST API, which `HttpEsimProvider`
already implements — auth, timeouts, retries with backoff, idempotency, error
classification and health checks are all handled. You supply the two mapping
functions that are genuinely supplier-specific.

`lib/providers/esim/airalo.ts`:

```ts
import { HttpEsimProvider } from './httpProvider';

export const airalo = new HttpEsimProvider({
  id: 'airalo',                       // stored on orders — never rename one in use
  name: 'Airalo',
  baseUrl: process.env.AIRALO_BASE_URL,
  apiKey: process.env.AIRALO_API_KEY,
  authHeader: 'Authorization',
  authScheme: 'Bearer',
  orderPath: '/v2/orders',
  healthPath: '/v2/packages?limit=1',  // must be cheap and must not create anything
  idempotencyHeader: 'Idempotency-Key',

  // Our neutral request + their SKU → their request body
  toOrderBody: (request, sku) => ({
    package_id: sku,
    quantity: request.quantity,
    description: request.orderNumber,
  }),

  // Their response → our normalized shape
  fromOrderResponse: (json) => {
    const sim = (json as AiraloResponse).data.sims[0];
    return {
      providerOrderId: (json as AiraloResponse).data.id,
      iccid: sim.iccid,
      activationCode: sim.lpa,
      qrCodeUrl: sim.qrcode_url,
      smdpAddress: sim.apn ?? null,
      installByDate: null,
    };
  },
});
```

If a supplier is too unusual for `HttpEsimProvider` (SOAP, webhook-based
fulfilment, a vendor SDK), implement the `EsimProvider` interface directly.
The registry does not care how you satisfy the contract.

### The three rules an adapter must obey

1. **Idempotency.** `provision()` must not buy two eSIMs when called twice with
   the same `idempotencyKey`. Pass it to the supplier's idempotency mechanism;
   if they have none, look up the existing order by reference before creating.
2. **Honest error classification.** `retryable: true` means "another supplier
   could succeed" (5xx, timeout, rate limit, out of stock). `retryable: false`
   means the request itself is wrong. Getting this backwards either wastes
   failover attempts or, worse, trips the circuit breaker on our own bug.
3. **Never return an empty fulfilment.** If there is no activation code and no
   QR, the customer has nothing. Throw instead — `HttpEsimProvider` already does.

## 2. Map the SKUs

`lib/providers/esim/skuMap.ts`, or the `ESIM_SKU_MAP` environment variable so a
SKU correction needs no deploy:

```json
{
  "airalo": {
    "thailand-standard": "ARL-TH-7D-2GB",
    "vietnam-basic": "ARL-VN-3D-1GB"
  }
}
```

Our plan IDs are permanent and public — they appear in orders, emails and
support tickets. A supplier's SKU lives only in this map.

**Partial coverage is normal.** A supplier with no SKU for a plan is skipped
automatically, and the registry tries the next one. You can deliberately map
only Thailand to a cheaper supplier and let everything else fall through.

## 3. Register and prioritise

In `lib/providers/esim/registry.ts`:

```ts
import { airalo } from './airalo';
register(airalo);
```

Then set the order:

```bash
ESIM_PROVIDER_ORDER=airalo,esimgo,sandbox
```

That variable is the supplier switch. Reordering it changes who fulfils every
future order, with no deploy.

---

## What you get automatically

Once registered, an adapter inherits all of this without writing any of it:

| Behaviour | Where |
| --- | --- |
| Skip suppliers without coverage for the plan | `registry.eligibleProviders()` |
| Fail over to the next supplier mid-request | `registry.provisionWithFailover()` |
| Suspend a supplier after 3 consecutive failures, retry after 60s | circuit breaker |
| Retry with exponential backoff + jitter within one supplier | `HttpEsimProvider` |
| Fall back to the ops queue when everyone fails | `lib/fulfilment.ts` |
| Health probe + status row in `/admin/providers` | `healthCheck()` |
| Provider attribution on every order | `provider_name`, `provider_order_id` |

## Testing a new supplier safely

1. Point it at the supplier's sandbox credentials in `.env.local`.
2. Put it **last** in `ESIM_PROVIDER_ORDER`, behind `sandbox`, and confirm the
   admin page shows it configured and healthy.
3. Move it to first and place a test order end to end.
4. Rehearse its failure: set `ESIM_SANDBOX_FAILURE_RATE=1` with sandbox first
   and the new supplier second, and confirm failover reaches it.
5. Only then promote it to primary in production.

Run `npx vitest run tests/esimRegistry.test.ts` — the failover, coverage and
circuit-breaker behaviour is covered by 14 cases against fake suppliers.

---

## The safety property

An order is only ever marked `fulfilled` when a real eSIM exists.

If every supplier is unavailable, the order stays `paid`, ops get a Telegram
alert, and it appears in the admin queue for manual delivery. The customer is
never told their eSIM is ready when it is not.

When a supplier recovers, **Auto** on the order row re-runs provisioning — the
backlog clears itself without anyone pasting QR codes by hand.

---

# Adding a payment gateway

Identical pattern, in `lib/providers/payments/`.

1. Implement `PaymentProvider` (see `abaProvider.ts` — it is 60 lines).
2. `register(new WingPaymentProvider())` in `registry.ts`.
3. Add the option to the checkout page's payment method list.

`/api/payments/[provider]` already routes by id, so `/api/payments/wing` works
the moment the adapter is registered. There is no new route to write, and the
pricing and order pipeline are shared — a new gateway physically cannot
introduce a second, divergent copy of the checkout logic.

A gateway adapter returns one of three session shapes, all handled by the
checkout page:

- `client-secret` — confirm in-page (Stripe)
- `redirect` — send the browser to a hosted page
- `form-post` — POST a signed field set (ABA PayWay)
