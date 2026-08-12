# Account & verification strategy

> 🔒 **This area is locked** — see [`docs/LOCKED.md`](LOCKED.md) before changing anything described here.

How Domner handles sign-up, sign-in and verification — and why phone
verification is deliberately **optional**.

---

## The problem with phone verification for an eSIM business

Our customer is, by definition, someone whose phone connectivity is broken or
about to break. The moment they need us most — landed abroad, roaming off,
connected to airport wi-fi — is exactly the moment an SMS one-time code fails.

Ways SMS OTP fails for our actual customers:

| Situation | Why the SMS never arrives |
| --- | --- |
| Roaming not activated | Most Cambodian carriers require roaming to be enabled (and often a deposit) before departure. Travellers forget. |
| Roaming deliberately off | Standard advice to avoid bill shock. Data *and* SMS go with it. |
| Home SIM removed | They swapped to a local SIM or a travel eSIM — the physical SIM is in their wallet. |
| eSIM-only handset | An iPhone 14+ bought in the US has no SIM tray and may carry no home number at all. |
| A2P delivery failure | Cross-border OTP delivery into SE Asia is genuinely unreliable; 5–15% non-delivery is normal, and it is silent. |
| No number of their own | Shared family phone, a borrowed handset, a corporate travel booker buying for staff. |

On top of that, SMS OTP has a direct cost problem: **SMS pumping fraud**. An
open "send me a code" endpoint is a money tap — attackers trigger floods of
OTPs to premium ranges they control and take a cut of the termination fee. An
unprotected endpoint can burn thousands of dollars in a weekend.

## The principle

> **Authentication and contactability are different problems. Never gate the
> first on the second.**

A phone number is a *delivery and recovery channel*. It is not identity. So:

- Nobody can be blocked from creating an account, or from buying an eSIM,
  because an SMS did not arrive.
- Phone is collected as **optional** at sign-up and can be verified at any
  later time from Settings — including after our own eSIM has given them data.
- Verification effort **scales with risk**, it is not a flat gate at the door.

---

## What we ship

### Sign-in methods (any one creates a full account)

| Method | Works with no cellular service? | Notes |
| --- | --- | --- |
| **Google** | Yes | Dominant on Android in Cambodia. Whole handshake runs over wi-fi. |
| **Apple** | Yes | Required by App Store review once we ship iOS with any other social login. Watch out for Private Relay addresses — see below. |
| **Email + password** | Yes | Classic path, plus reset by email. |
| **Email one-time code** | Yes | **The traveller-safe default.** Six digits, works on any wi-fi. |
| **Phone + SMS code** | No | Offered as a convenience, never required. |

Implemented in `lib/auth.ts`; UI in `app/(auth)/sign-in` and
`app/(auth)/sign-up`.

**Why a 6-digit email code and not just a magic link.** Magic links break in
exactly our conditions: the mail app opens the link in its own in-app browser,
which is a different browser session than the tab holding the cart, so the user
signs in to a window that then vanishes. Captive-portal wi-fi mangles the
redirect too. A code can be read in one app and typed into the other. We send
both — the link for convenience, the code as the reliable path — which requires
`{{ .Token }}` in the Supabase magic-link email template.

### Phone number capture

Full ISO country list with E.164 calling codes in `data/countries.ts` (~240
entries), rendered by `components/ui/CountryPicker.tsx` — searchable by country
name, ISO code, or dial code, with our core markets pinned to the top.

One subtlety worth keeping: the default country comes from the user's
**passport country or browser locale, never their IP**. A Cambodian standing in
Narita still carries a `+855` number. Geo-locating the device would pick the
wrong dial code for precisely the travellers we serve.

---

## Fallbacks when someone abroad genuinely needs verification

Ordered by how well they fit our customer:

1. **Email code** — full substitute for SMS in every flow. Already shipped.
2. **WhatsApp / Telegram OTP** — delivered over *data*, not the cellular
   voice/SMS network, so it works on airport wi-fi with the SIM removed
   entirely. This is the single highest-value addition on the roadmap. Telegram
   is especially strong for us: penetration in Cambodia is very high, we
   already have `lib/telegram.ts` for flight alerts, and the Telegram Login
   Widget doubles as a sign-in method *and* our notification channel.
3. **Voice call OTP** — a robocall reading the digits. Sometimes lands where
   SMS does not, but still needs the network, so it is a weak fallback.
4. **Passkeys (WebAuthn)** — Face ID / fingerprint, no network round-trip for a
   code at all, phishing-proof. Best long-term answer for re-authentication and
   the strongest recovery signal we can hold. Roadmap.
5. **Recovery codes** — eight single-use codes issued at sign-up, downloadable.
   Works with no network of any kind. Table shipped in
   `supabase/migrations/001_auth_methods.sql`.
6. **Order number + email lookup** — a "find my eSIM" page needing no login,
   so a locked-out customer can still retrieve their QR code.

### The two things that matter most in practice

**Guest checkout.** The real answer to "what if they are already abroad" is to
not ask them to prove anything before we take their money. Let them buy with an
email address alone, deliver the QR by email, and offer "claim your account"
from a link in that same mail. Zero SMS anywhere in the purchase path.

**Do not log travellers out mid-trip.** If a session expires in Tokyo and the
only way back in is an SMS to a Cambodian number with roaming off, we have
locked a paying customer out of the eSIM they already bought. Long refresh
token lifetime, trusted-device persistence, and never force re-auth for
read-only actions like "show me my QR code".

---

## Password reset

`/forgot-password` sends the mail; **`/reset-password` is the only page that can
set a new password.** Recovery links must point at it — they previously pointed
at `/auth/callback`, which only forwards an already-signed-in user onward, so
the reset silently did nothing and the customer landed on the dashboard with
their old password still in force.

The page accepts recovery three ways, because which one arrives depends on the
project's flow setting and the email template:

| Arrives as | Handled by |
| --- | --- |
| `?token_hash=…&type=recovery` | `verifyOtp({ type: 'recovery' })` |
| `?code=…` (PKCE) | `detectSessionInUrl` before `getSession()` resolves |
| `#access_token=…` (implicit) | same |

If none of them yields a session — spent link, expired link, or a link opened in
a different browser than the one that requested it — the page falls back to
asking for the email and a **6-digit code**, exactly as sign-in does. Same
reasoning as the magic-link decision above: the mail app opens links in its own
in-app browser, and a code can be read in one app and typed into another.

**That fallback needs `{{ .Token }}` added to the Supabase "Reset Password"
email template**, the same edit already required on the magic-link template. The
link path works without it; only the typed code depends on it.

The recovery token is stripped from the address bar with `replaceState` as soon
as it is consumed, so it never reaches history or a `Referer` header.

## Where verification *is* worth requiring

Phone verification earns its place on risk, not at the front door:

- High-value or unusual orders (bulk purchases, mismatched card/billing
  country, many orders in a short window).
- Changing the account email, or a password reset from a new device.
- Refund and chargeback disputes.

Note that **a successful payment is a stronger identity signal than an SMS
code.** A 3DS-authenticated card charge proves far more about a customer than
proving they hold a SIM. Weight it accordingly in any fraud rules.

## Anti-abuse for the OTP endpoints

`otp_attempts` in the migration exists for this. Minimum controls before SMS
goes live:

- Rate limit per IP, per account, and per destination number.
- Cap resends and apply exponential backoff.
- Turnstile/CAPTCHA in front of the send endpoint.
- **Block destination ranges we do not serve.** Most pumping fraud targets a
  handful of high-termination-cost country prefixes. An allowlist of the
  countries our customers actually come from removes most of the attack.
- Use a provider with built-in pumping protection (Twilio Verify Fraud Guard or
  equivalent) rather than raw SMS sends.
- Alert on cost per successful verification, not just on volume.

## Apple Sign In caveat

Apple's Private Relay gives us `something@privaterelay.appleid.com`. It
forwards mail correctly, but only while the user keeps the relay active, and it
is not a usable support contact. For Apple sign-ups, prompt for a real contact
email at first purchase — the eSIM QR code has to reach an inbox they will
still read next year.

## Data notes

- Store phone numbers in **E.164** (`+85512345678`), never in local format —
  it is the only representation that is unambiguous across borders.
- `phone_verified_at` is a timestamp, not a boolean: a support agent judging a
  recovery request months later needs to know *when* the number was proven.
- `otp_attempts` hashes both the destination and the IP, so the abuse log is
  not itself a customer directory.

## Implementation status

| Piece | Status |
| --- | --- |
| Google / Apple OAuth wired to Supabase | Done |
| Email + password | Done |
| Email one-time code | Done (needs `{{ .Token }}` in the Supabase email template) |
| Phone + SMS code sign-in | Done (needs an SMS provider configured in Supabase) |
| Full country dial-code picker | Done |
| Optional phone at sign-up | Done |
| Verify-later flow in Settings | Done |
| OAuth callback route | Done |
| Schema: verification columns, recovery codes, OTP log | Done (migration `001`) |
| Guest checkout (email-only purchase) | Not started — highest-value next step |
| eSIM QR delivery by email / Telegram | Done — see `docs/DELIVERY.md` |
| Telegram / WhatsApp OTP | Not started |
| Passkeys | Not started |
| Recovery code generation UI | Not started (table exists) |

## Configuration checklist

1. Supabase → Authentication → Providers: enable Google and Apple, set the
   redirect URL to `https://<domain>/auth/callback`.
2. Supabase → Authentication → Email Templates → Magic Link: include
   `{{ .Token }}` so the mail carries a 6-digit code as well as a link.
3. Supabase → Authentication → Providers → Phone: only enable once an SMS
   provider and the rate limits above are in place.
4. Run `supabase/migrations/001_auth_methods.sql`.
