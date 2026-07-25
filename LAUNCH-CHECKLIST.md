# 🚀 Domner — Launch Checklist

> Companion to `COSTS.md` (what we spend) and `STRATEGY.md` (what we build & who pays).
> This is the go-live runbook: the exact steps to get Domner in front of real travelers.
>
> **Verified on the current build:** production build passes, TypeScript strict passes,
> all 29 pages + 12 API routes render at 200, and mobile + PWA (add-to-home-screen) is
> configured. The blockers below are config, legal, and QA — not broken code.

---

## Your goal for this launch

Experience Domner **on a real phone** — mobile browser + installed to the home screen
(PWA). Everything below gets you there safely.

---

## 1. 🟢 Ship-blockers — do these before real users

- [ ] **Buy the domain** (`domnerapp.com` per `.env.example`). ~$1/mo. Skip registrar upsells.
- [ ] **Deploy to hosting** (Vercel free/hobby tier). Connect the domain, enable HTTPS.
- [ ] **Add legal pages** — Privacy Policy + Terms of Service. **Required** before taking any
      real Stripe/ABA payment. (Can start from a generator; a lawyer review comes later.)
- [ ] **Set the launch env keys** (see `COSTS.md` §6 for the exact $0 set):
  - [ ] Supabase (auth + DB) — free tier
  - [ ] Stripe + ABA PayWay — no fixed fee, per-transaction
  - [ ] Resend, Telegram, Firebase — free tiers
  - [ ] `ANTHROPIC_API_KEY` for the AI Copilot (Claude, from console.anthropic.com) —
        **turn this ON at launch**; set a monthly spend limit in the Anthropic Console
        first. Without it the Copilot falls back to the free keyword engine.
  - [ ] Leave `RAPIDAPI_KEY` **empty** — free ADS-B tracking covers launch (defer to Pro)
- [ ] **Run the Supabase schema** — `supabase/schema.sql` in the SQL editor.
- [ ] **Set `ADMIN_EMAIL`** so `/admin` is gated to you.

## 2. 📱 Mobile & home-screen (PWA) check — your main goal

The PWA is already configured (manifest, 192/512 + maskable icons, apple-touch-icon, service
worker, standalone display, theme `#14263F`). To experience it:

- [ ] Open the live site on your phone's browser (Safari on iOS, Chrome on Android).
- [ ] **iOS:** Share → *Add to Home Screen* → confirm the Domer icon + name appear.
- [ ] **Android:** menu → *Install app* / *Add to Home Screen*.
- [ ] Launch from the home-screen icon — it should open **full-screen (no browser bars)**,
      navy splash, portrait-locked.
- [ ] Test offline: emergency phrases are built to work without internet — confirm.
- [ ] Tap the **gold ✦ Copilot button** (bottom-right) and ask a question in Khmer + English.

> Note: this is a **PWA (installable web app)**, not a native iOS/Android store app. That's
> why you can launch and iterate instantly — no app-store review. A true home-screen *widget*
> (iOS/Android widget on the wallpaper) needs a native app; that's a later phase. The PWA gives
> you the installed-icon, full-screen app feel today.

## 3. ✅ Pre-launch QA click-through (on a real phone)

- [ ] Home → Get Your eSIM → pick a country → Add to Cart → Checkout (sandbox) → confirmation
- [ ] Track a flight (try `QH215`) → live status renders
- [ ] "Am I Ready?" checklist wizard completes
- [ ] Airport guide + emergency phrases (audio + copy buttons work)
- [ ] Sign up / sign in / dashboard loads
- [ ] Admin panel opens for your `ADMIN_EMAIL`
- [ ] Switch language EN ↔ KM everywhere
- [ ] Send yourself a real order → confirm Resend email + Telegram alert fire

## 4. 🔒 Before taking real money

- [ ] Switch Stripe + ABA from sandbox to **live** credentials.
- [ ] Do one real end-to-end purchase yourself (small amount) and confirm fulfillment.
- [ ] **Confirm the eSIM fulfillment flow** — the admin "generate-eSIM" page is **manual**
      today. Fine for launch volume; know it needs a human per order until automated.

## 5. 📣 Nice-to-have (not blockers)

- [ ] Configure ESLint (currently unconfigured) — run `next lint`, pick "Strict".
- [ ] Add a couple of smoke tests for the checkout + flight API (no test suite yet).
- [ ] Basic analytics (privacy-friendly) to learn what people actually use.
- [ ] Social/OG preview image check (metadata is already set in `app/layout.tsx`).

---

## After launch — remember

- **You can edit anytime.** It's a web app — push a change, it redeploys in minutes, no store
  review. Launch is the *start* of iteration. Keep using the branch → PR flow so a bad change
  can't take the site down.
- **Turn on paid flight data (AeroDataBox) only in Phase 2**, funded by Domner Pro subscribers
  (see `STRATEGY.md`). Not now.
- **Watch what people come back for** — that tells you what to build next, cheaper than guessing.
