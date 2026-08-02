# 🔒 Locked: accounts, verification & eSIM delivery

**Status: LOCKED — do not modify without the repository owner's explicit,
written permission on the specific change.**

These files carry authentication, customer identity, and the customer contact
dataset. They were reviewed and signed off as a unit; a change to one can
silently weaken another. Locked means locked for everyone — human contributors
and AI agents alike.

## What is locked

### Authentication & identity
```
lib/auth.ts
lib/phone.ts
data/countries.ts
components/auth/AuthCard.tsx
components/auth/PhoneField.tsx
components/auth/PhoneVerifyCard.tsx
components/auth/OtpInput.tsx
components/ui/CountryPicker.tsx
app/(auth)/sign-in/page.tsx
app/(auth)/sign-up/page.tsx
app/(auth)/forgot-password/page.tsx
app/auth/callback/page.tsx
supabase/migrations/001_auth_methods.sql
```

### eSIM QR delivery & customer contact data
```
lib/esimDelivery.ts
lib/telegram.ts
components/esim/DeliveryOptions.tsx
components/esim/TelegramConnectCard.tsx
app/api/telegram/webhook/route.ts
supabase/migrations/002_esim_delivery.sql
```

### Partially locked
These files have non-locked responsibilities too. **The delivery and customer
contact sections within them are locked**; unrelated edits are fine.
```
app/esim/checkout/page.tsx        — delivery choice, phone field, E.164 conversion
app/api/payments/stripe/route.ts  — delivery_channel persistence, connect token
app/api/payments/aba/route.ts     — delivery_channel persistence, connect token
app/api/esim/route.ts             — the deliverEsim() call in PATCH
lib/resend.ts                     — sendEsimQrEmail
types/index.ts                    — DeliveryChannel, EsimOrder delivery fields
```

## Invariants that must not be broken

Any change that violates one of these is a regression, not an improvement:

1. **Phone verification is never required** to create an account or to buy an
   eSIM. Our customers are abroad with roaming off; an SMS gate locks out the
   people we most want. See `docs/AUTH.md`.
2. **At least one no-cellular sign-in path stays available** — Google, Apple,
   email+password, and email OTP all work on wi-fi alone.
3. **Email delivery of the QR always happens** when we hold an address, whatever
   else the customer chose.
4. **`telegram_links` and `esim_deliveries` stay service-role only.** No RLS
   policy granting anon or authenticated access. No list, search, or export
   endpoint. No importing `lib/esimDelivery.ts` from a client component.
5. **Connect tokens are stored hashed** and never travel in a URL path, query
   string, or log line.
6. **The bot webhook refuses to run without `TELEGRAM_WEBHOOK_SECRET`.**
7. **Phone numbers are stored in E.164.**

## The customer contact dataset

The email, phone, and Telegram identity we collect is a company asset. It is
not for sale, not for export, and not reachable by anyone outside the service
role. Treat any proposal to add bulk read access to these tables as a change
that needs the owner's sign-off, no matter how convenient the reason.

The realistic leak path is not an attacker — it is a helpful new endpoint: an
admin list view missing an auth check, a CSV export, a debug route left in.
Anything that reads customer contact data in bulk requires explicit approval.

## To unlock

The repository owner must state, per change:

1. Which file or invariant is being opened.
2. What the change is.
3. That they accept the consequence for the invariants above.

"Go ahead" on an unrelated task is **not** authorisation to touch these files.
If a task appears to require a change here, stop and ask first.
