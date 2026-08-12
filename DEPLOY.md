# 🚀 Deploy Domner to Vercel — get it on your phone today

A one-page walkthrough tailored to this repo. Goal: a live HTTPS URL you can open on
your iPhone and **Add to Home Screen**. ~15 minutes. Free tier.

> This app runs fully in **demo mode with zero keys** (per the README), so you can deploy
> and experience it on mobile *before* wiring up any paid service. Add keys later.

---

## Step 1 — Push your branch (already done)

Your work is on `claude/app-feature-costs-34r40w`. For a first deploy you can either merge it
to your default branch or point Vercel straight at this branch (Step 3 covers both).

## Step 2 — Create the Vercel project

1. Go to **vercel.com** → sign up / log in **with GitHub**.
2. **Add New… → Project** → **Import** your `laykheangma95-ops/travel-app` repo.
3. Vercel auto-detects **Next.js** — leave the defaults:
   - Framework Preset: **Next.js**
   - Build Command: `next build` (default)
   - Output: `.next` (default)
   - Install Command: `npm install` (default)
4. **Don't add any environment variables yet** — deploy in demo mode first.
5. Click **Deploy**. In ~2 minutes you get a URL like `travel-app-xxxx.vercel.app`.

## Step 3 — Which branch deploys

- By default Vercel deploys your **production branch** (usually `main`) and gives every other
  branch a **preview URL** automatically.
- To experience *this* branch immediately: open the branch's **Preview Deployment** from the
  Vercel dashboard (Deployments tab) — it has its own shareable HTTPS URL.
- When you're happy, merge the branch to `main` and it becomes the production URL.

## Step 4 — Open it on your iPhone (the part you wanted)

1. Open the Vercel URL in **Safari** on your iPhone.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch from the new **Domer** icon — it opens **full-screen, no browser bars**, navy splash,
   portrait. That's the PWA (it's already configured: manifest, icons, service worker).
4. Try the **Liquid Glass touch feel**: press and drag on the gold **Get Your eSIM** button and
   the **✦ Copilot** button — you'll see the highlight follow your finger and the button settle
   with a soft spring.
5. Emergency phrases work **offline** — test it in airplane mode.

> Android: Chrome → menu → **Install app / Add to Home Screen**.

## Step 5 — Go live for real (when ready)

Add environment variables in **Vercel → Project → Settings → Environment Variables**, using the
**"$0 fixed cost" set from `COSTS.md` §6**. Minimum to take real orders:

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ABA_MERCHANT_ID, ABA_API_KEY, ABA_WEBHOOK_SECRET
RESEND_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID
FIREBASE_ADMIN_SDK, NEXT_PUBLIC_FIREBASE_CONFIG
OPENROUTER_API_KEY     # turn the AI Copilot ON — cheap (Claude Haiku via OpenRouter), set a spend limit first
ADMIN_EMAIL            # gates /admin to you
NEXT_PUBLIC_APP_URL    # your final domain, e.g. https://domnerapp.com
# leave RAPIDAPI_KEY empty — free ADS-B tracking covers launch (see COSTS.md)
```

- Set each variable's scope to **Production** (and Preview if you want previews live too).
- After adding keys, **redeploy** (Deployments → ⋯ → Redeploy) so they take effect.
- Run `supabase/schema.sql` in the Supabase SQL editor (creates tables + RLS).

### The two Supabase keys are not optional

Without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, **accounts
do not exist**. There is nowhere to store a customer, nothing to check a password
against, and no session to issue.

A production deploy missing them now **says so** — sign-in and sign-up show an
error, and `/dashboard`, `/my-esims`, `/my-trips`, `/settings` and `/admin` are
refused. That is deliberate. It used to fall through to demo mode instead: the
click "succeeded", no account was created, and the visitor landed on a dashboard
of fake data that looked exactly like being logged in. An outage must not look
like a working login.

The public storefront and checkout are unaffected either way.

**Check it in one click:** open `https://<your-domain>/api/health` and look at
`services.supabase` and `services.supabaseAdmin`. `true` on both means accounts
work. The endpoint returns HTTP 503 while anything critical is missing, so an
uptime monitor pointed at it will catch this before a customer does.

> `DOMNER_ALLOW_DEMO=true` (plus `NEXT_PUBLIC_DOMNER_ALLOW_DEMO=true` for the
> browser half) forces demo mode back on for a staging deploy that runs without
> real credentials on purpose. **Never set either on production.**

## Step 6 — Custom domain

1. Buy `domnerapp.com` from any registrar (~$12–15/yr).
2. Vercel → **Settings → Domains → Add** → enter the domain → follow the DNS instructions
   (add the A / CNAME record Vercel shows you at your registrar).
3. HTTPS is automatic. Set `NEXT_PUBLIC_APP_URL` to the domain and redeploy.

---

## Notes for this repo

- **Node/build:** standard Next.js 14 — no special config needed; `next.config.mjs` is already set.
- **After launch you can edit anytime** — push to the branch, Vercel auto-redeploys in minutes.
  No app-store review (it's a PWA). Keep using branch → PR so a bad change can't take prod down.
- **The home-screen *icon* works today; a wallpaper *widget* needs a native app** — a later phase.
- Full go-live checklist (legal pages, QA, real-money steps): see `LAUNCH-CHECKLIST.md`.
