# ABA PayWay setup

How to switch Domner's checkout from demo mode to real ABA payments.

## How the code decides demo vs. live

`lib/aba.ts` checks `isAbaConfigured()` — true only when **both** `ABA_MERCHANT_ID`
and `ABA_API_KEY` are set. With them unset, checkout creates the order, marks it
`paid`, and sends the confirmation email without any bank call. That is the demo
behaviour, and it is the safe default: an accidental deploy without credentials
never charges anyone.

## What to ask ABA for

When the merchant account is approved, ask for:

1. **Sandbox** merchant ID + API key (test here first — never go straight to live).
2. The **integration specification PDF** for the Purchase API. This matters: it
   defines the exact field order used to build the request signature.
3. The **pushback payload format** — which fields ABA sends and which of them are
   signed.
4. Registration of these URLs on the merchant account:
   - Pushback / callback URL: `https://domnerapp.com/api/payments/aba/callback`
   - Success URL: `https://domnerapp.com/order-confirmation/...`
   - Cancel URL: `https://domnerapp.com/cart`

## The one thing to verify against their PDF

`HASH_FIELD_ORDER` in `lib/aba.ts` lists the fields whose values are concatenated
and signed with HMAC-SHA512. The order in the code follows the common PayWay v1
spec, but **it varies between API versions**, and a mismatch fails at checkout
with an invalid-hash error rather than anything more descriptive.

If ABA's PDF lists a different order, edit that one array — nothing else needs to
change. `PUSHBACK_HASH_FIELD_ORDER` just below it does the same job for the
callback signature.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ABA_MERCHANT_ID` | yes | Enables live mode together with the API key |
| `ABA_API_KEY` | yes | Signs requests; also verifies pushbacks by default |
| `ABA_WEBHOOK_SECRET` | no | Only if ABA issued a separate pushback secret |
| `ABA_CHECKOUT_URL` | no | Point at the sandbox host while testing |
| `ABA_PAYMENT_OPTION` | no | Blank shows every enabled method; set `abapay_khqr` to force KHQR only |

Sandbox checkout URL:

```
ABA_CHECKOUT_URL=https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase
```

## Payment flow

1. Browser posts the cart to `POST /api/payments/aba`.
2. The route creates the order in Supabase with status `pending` and returns the
   signed `fields`.
3. The checkout page **POSTs those fields as a form** to ABA's gateway
   (`postToGateway` in `app/esim/checkout/page.tsx`). A plain redirect will not
   work — the endpoint only accepts POST.
4. The shopper pays on ABA's hosted page.
5. ABA POSTs the result to `/api/payments/aba/callback`, which verifies the
   signature, flips the order to `paid`, and fires the Telegram + email
   notifications. The update is scoped to `status = 'pending'` so ABA's retries
   cannot send duplicate emails.
6. The shopper's browser lands on the order-confirmation page.

The order is only marked paid by step 5, so a shopper who closes the tab still
gets fulfilled once the bank confirms.

## Testing before launch

- [ ] Sandbox credentials set, `ABA_CHECKOUT_URL` pointing at sandbox.
- [ ] Complete a sandbox purchase — confirm you reach ABA's page (not a 404 or
      hash error).
- [ ] Confirm the order flips `pending` → `paid` in Supabase after payment.
- [ ] Confirm the Telegram alert and confirmation email arrive exactly once.
- [ ] Cancel a payment and confirm the order stays `pending`.
- [ ] Swap to live credentials and run one small real transaction.
