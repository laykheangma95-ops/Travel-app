# 💰 Domner App — Monthly Cost Audit (Founder View)

> Goal: know exactly what bleeds cash **every month**, what only costs money **when we earn**,
> and what we can **switch off** until we have real paying customers.
> Prices below are list prices as of the last review — always confirm on the provider's site.

**Bottom line: you can run the entire app in production for ~$0–15/month.** Nothing here forces a
fixed monthly bill except a domain and (optionally) hosting. Every "expensive" service either has a
free tier we stay inside, only charges per-transaction (so it's paid out of revenue), or has a free
substitute already built into the codebase.

---

## 1. The three cost buckets

| Bucket | Meaning | Founder rule |
| --- | --- | --- |
| 🟢 **Free / free-tier** | $0 until we hit real scale | Keep — no reason to cut |
| 🔵 **Pay-as-you-earn** | Only charges a % / fee **per sale** | Keep — it's paid out of revenue, never out of pocket |
| 🔴 **Fixed or usage-metered spend** | Real money each month regardless of sales | **Cut or cap until profitable** |

---

## 2. Every service in the app, costed

| # | Feature / Service | Env keys | Cost model | Monthly cost at low volume | Bucket |
| --- | --- | --- | --- | --- | --- |
| 1 | **Supabase** (auth, orders, DB, saved flights) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Free tier → $25/mo Pro | **$0** | 🟢 |
| 2 | **Stripe** (international cards) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 2.9% + $0.30 per charge, no monthly fee | **$0** | 🔵 |
| 3 | **ABA PayWay** (KHQR / Cambodia) | `ABA_MERCHANT_ID`, `ABA_API_KEY`, `ABA_WEBHOOK_SECRET` | Per-transaction merchant fee | **$0** fixed | 🔵 |
| 4 | **Firebase Cloud Messaging** (push notifications) | `FIREBASE_ADMIN_SDK`, `NEXT_PUBLIC_FIREBASE_CONFIG` | Free, effectively unlimited | **$0** | 🟢 |
| 5 | **Telegram Bot** (admin order alerts) | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | Free | **$0** | 🟢 |
| 6 | **Resend** (order confirmation emails) | `RESEND_API_KEY` | Free tier 3,000 emails/mo (100/day) → $20/mo | **$0** | 🟢 |
| 7 | **Live flight tracking** (ADS-B: adsb.lol, airplanes.live, adsb.fi + planespotters photos) | *none — no key needed* | Open / crowdsourced, free | **$0** | 🟢 |
| 8 | **AeroDataBox** (scheduled flight status: gate, delay, times) | `RAPIDAPI_KEY`, `AEROBOX_HOST` | RapidAPI: small free quota → paid tiers ($ monthly) | **$0 now, real risk later** | 🔴 |
| 9 | **Anthropic / Claude** (Domer Trip Copilot AI chat) | `ANTHROPIC_API_KEY` | Pay-per-token usage | **$0 now, scales with use** | 🔴 |
| 10 | **Domain** (`domnerapp.com`) | `NEXT_PUBLIC_APP_URL` | ~$12–15 / **year** | **~$1/mo** | 🔴 (tiny, unavoidable) |
| 11 | **Hosting** (Next.js — e.g. Vercel) | *deployment, not in env* | Free hobby tier → $20/mo Pro | **$0** on hobby | 🟢 → 🔴 if upgraded |

---

## 3. 🔴 The only things that can actually cost us money — and the call on each

### 3a. AeroDataBox (RapidAPI) — **CAP IT, don't pay yet**
- **Why it's risky:** Flight Guardian polls every 90 seconds. At that rate a single actively-tracked
  flight can burn hundreds of API calls per hour and blow through RapidAPI's small free quota in a
  day, tipping you into a paid monthly plan.
- **The good news:** the codebase **already ships a 100% free alternative.** `lib/liveFlight.ts`
  pulls live aircraft position, altitude, speed and photos from the open ADS-B network with **no API
  key at all**. AeroDataBox is only needed for *scheduled* data (official gate numbers, published
  delay minutes, terminal). Without a key, `lib/aeroDataBox.ts` **falls back to realistic mock data**
  — the feature keeps working end-to-end.
- **Founder call:** **Do NOT buy a RapidAPI plan.** Leave `RAPIDAPI_KEY` empty. Run on free ADS-B live
  data + mock scheduled data. Only subscribe once flight tracking is a proven driver of eSIM sales and
  you've decided real gate/delay data is worth paying for. When you do, add a monthly call cap.

### 3b. Anthropic Claude — Trip Copilot — **KEEP but cap spend**
- **Why it's risky:** it's metered per token. Every chat costs money, and there's no per-day budget.
- **The good news:** with no `ANTHROPIC_API_KEY` it falls back to a canned bilingual reply, so the
  feature never breaks — it just isn't "smart." It's already wired to **`claude-haiku-4-5`**, a
  fraction of the cost of Opus.
- **Founder call — pick one:**
  1. **Cheapest:** leave the key empty → $0, canned answers only.
  2. **Recommended:** keep AI on (already on the cheap Haiku model in `app/api/chat/route.ts`) and
     set a hard monthly spend limit in the Anthropic console. Great UX for cents, not dollars.
  3. Bump the model in `app/api/chat/route.ts` to `claude-opus-4-8` only once Copilot demonstrably
     converts users to paying customers.

### 3c. Domain — **PAY IT, it's ~$1/month**
- You cannot run a real brand on a random URL. ~$12–15/year is the one genuinely unavoidable cost.
  Buy the `.com`, skip the domain-registrar upsells (privacy is usually free, don't buy "premium DNS").

### 3d. Hosting — **stay on the free tier**
- Deploy on a free hobby tier (e.g. Vercel) until traffic actually needs the $20/mo Pro plan. Don't
  pre-pay for scale you don't have.

---

## 4. 🔵 Payments — costs, but ONLY out of money customers already paid you

Stripe and ABA PayWay have **no fixed monthly fee**. They take a cut of each sale. That fee comes out
of revenue you just earned — it is never money out of your pocket before you're profitable. **Keep
both** (Stripe for foreign cards, ABA for local Cambodian KHQR — you need both for this market).

---

## 5. 🟢 Keep as-is — free and doing real work

Supabase (backbone — auth + database), Firebase push, Telegram alerts, Resend emails, and the open
ADS-B live-tracking network all sit comfortably in free tiers at launch volume. **No action needed.**
Watch two meters as you grow: Supabase (500MB DB / 50k monthly users) and Resend (100 emails/day).
Both are months-away problems and both signal you're already succeeding when you hit them.

---

## 6. Recommended launch configuration (the "$0 fixed cost" setup)

Fill in **only** these keys in `.env.local` to go live for free (plus the ~$1/mo domain):

```bash
# Backbone — free tier
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...

# Get paid — no fixed fee, cut taken per sale
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
ABA_MERCHANT_ID=...
ABA_API_KEY=...
ABA_WEBHOOK_SECRET=...

# Free ops
RESEND_API_KEY=...            # free tier
TELEGRAM_BOT_TOKEN=...        # free
TELEGRAM_ADMIN_CHAT_ID=...    # free
FIREBASE_ADMIN_SDK=...        # free
NEXT_PUBLIC_FIREBASE_CONFIG=...

# --- LEAVE EMPTY until profitable ---
# RAPIDAPI_KEY=              # AeroDataBox — free ADS-B + mock covers us
# ANTHROPIC_API_KEY=         # Copilot — canned replies, or switch model to haiku first
```

**Result: ~$1/month (domain only) to run the whole app in production.** Every "expensive" feature is
either free-tier, paid-from-revenue, or switched off until it earns its keep. Turn on AeroDataBox and
Opus-tier AI only when the data proves they drive paying customers.
