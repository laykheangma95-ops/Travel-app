# eSIM QR delivery

> 🔒 **This area is locked** — see [`docs/LOCKED.md`](LOCKED.md) before changing anything described here.

The customer chooses at checkout where their QR code goes: **email**,
**Telegram**, or **both** (default).

---

## The constraint that shapes this

**A Telegram bot cannot send a message to a phone number.** Telegram exposes no
API to resolve a number to a chat, and this is deliberate — it would make the
platform a spam vector. A bot only learns a `chat_id` when the user messages it
first.

So the phone number collected at checkout is **used for matching and support,
never as an address.** Delivery works by deep link:

```
1. Order paid
   → mint a single-use token, store only its SHA-256 hash in telegram_links

2. Confirmation page
   → shows https://t.me/<bot>?start=<token> as a "Connect Telegram" button

3. Customer taps Start
   → webhook receives "/start <token>", resolves it to the order,
     records chat_id

4. Bot asks them to share their contact
   → number is compared against the one on the order (last 8 digits)
   → mismatch means we do NOT deliver there, because the deep link is a
     bearer token and could have been forwarded

5. Ops marks the order fulfilled with a QR URL
   → deliverEsim() pushes to every channel the customer chose
```

## Email always goes out

Even for `delivery_channel = 'telegram'`, we email the QR whenever we hold an
address. A QR trapped behind a step the customer never completed is a support
ticket, and the email doubles as their receipt. Telegram is an *addition*, not
a replacement.

## Files

| File | Role |
| --- | --- |
| `components/esim/DeliveryOptions.tsx` | The three-way choice at checkout |
| `components/esim/TelegramConnectCard.tsx` | Deep-link button on the confirmation page |
| `lib/esimDelivery.ts` | Server-only orchestration; mints tokens, fans out, logs |
| `lib/telegram.ts` | Bot API calls, token hashing, deep-link builder |
| `lib/resend.ts` | `sendEsimQrEmail` |
| `app/api/telegram/webhook/route.ts` | Bot updates: `/start`, contact share |
| `supabase/migrations/002_esim_delivery.sql` | Schema + RLS |

## Token handling

- The raw token exists only in the deep link. Only its SHA-256 hash is stored.
- It is passed to the confirmation page through `sessionStorage`, never the
  URL — so it cannot leak via browser history, a `Referer` header, or analytics.
- 30-day expiry, and it is bound to one order.

## Data protection

The delivery tables hold the customer contact list, which is a company asset.

- `telegram_links` and `esim_deliveries` have **RLS enabled with no policies**
  — unreachable with the anon key, service role only.
- Both additionally `REVOKE ALL ... FROM anon, authenticated`, so a policy
  added by mistake later still would not open them up.
- No API route lists, searches, or exports these tables. `lib/esimDelivery.ts`
  is server-only and must never be imported from a client component.
- The bot webhook is authenticated by `TELEGRAM_WEBHOOK_SECRET` and returns 503
  rather than running unauthenticated if that variable is missing.

**Before adding any new endpoint that reads customer contact data, re-read this
section.** The most likely way this data escapes is a convenience endpoint —
an admin list view without an auth check, a CSV export, a debug route.

## Setup

1. Create the bot with @BotFather; set `TELEGRAM_BOT_TOKEN` and
   `TELEGRAM_BOT_USERNAME` (no `@`).
2. Generate a random `TELEGRAM_WEBHOOK_SECRET`.
3. Register the webhook:

   ```bash
   curl -F "url=https://<domain>/api/telegram/webhook" \
        -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
        https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
   ```

4. Run `supabase/migrations/002_esim_delivery.sql`.

Without these variables the app degrades cleanly: the delivery choice still
renders, Telegram options simply produce no deep link, and email carries the QR.

## Not built yet

- **Auto-fallback sweep.** If a customer picks Telegram and never connects, we
  log `chat not linked` but nothing chases it. A scheduled job could re-send by
  email after an hour and flag it for ops.
- **WhatsApp delivery.** Same shape as Telegram but via the Meta Cloud API,
  which *does* allow messaging a number — within a 24-hour window and using
  pre-approved templates.
- **Re-send from the customer's account.** `/my-esims` shows the QR but has no
  "send it to me again" button.
