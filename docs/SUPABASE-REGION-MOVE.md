# Moving the database from Tokyo to Singapore

Supabase cannot change a project's region. The region field in Project Settings
is display-only. Moving means **a new project in Singapore and a full copy of
the data into it**, then repointing the app.

This document is the runbook. `scripts/supabase-move.sh` does the data half;
the rest is dashboard work only the account owner can do.

---

## What is already done

**Vercel is set to Singapore.** `vercel.json` now pins the functions to `sin1`:

```json
{ "regions": ["sin1"] }
```

It takes effect on the next deploy. Before this, the deployment was running in
`iad1` — Washington DC — so every database query went Cambodia → USA → Tokyo →
USA → Cambodia. That was the larger share of the delay, and it is fixed
independently of anything below.

With functions in Singapore and the database still in Tokyo you are already most
of the way there. **Check the site works after that deploy before starting the
database move.** One change at a time.

---

## Before you start: the one thing that will affect customers

Moving to a new Supabase project means a new JWT secret, and **every signed-in
customer is signed out**. There is no way around it — sessions are signed by a
key that does not exist in the new project.

`docs/AUTH.md` states the principle this collides with: *"Do not log travellers
out mid-trip."* A customer in Bangkok with roaming off, holding an eSIM they
already bought, will be asked to sign in again.

Three things make that survivable, and all three must be true before cutover:

1. **The order-number + email lookup keeps working without a login.** That is
   the documented safety net for exactly this situation — a customer can still
   retrieve their QR code while signed out. Test it on the new project first.
2. **Cut over at the lowest-traffic hour** — early morning Cambodia time.
3. **Do not cut over the day before a holiday**, when the most people are
   travelling on eSIMs they just bought.

Passwords, email addresses and accounts all survive; `auth.users` comes across
in the dump. It is only the active sessions that die.

---

## Step 1 — Take the backup (do this today, whatever you decide)

This project has **no backups at all**. That is a bigger risk than the region.
The dump step is read-only and safe to run at any time:

```bash
export OLD_DB_URL='postgresql://postgres.tmythlbtxokxucorvpst:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'

./scripts/supabase-move.sh dump
```

Get the URL from **Project Settings → Database → Connection string → URI**, and
fill in your database password. Use the session pooler on port **5432**, not the
transaction pooler on 6543 — a restore needs a single long transaction and the
transaction pooler cannot hold one.

The dump lands in `.supabase-dumps/<timestamp>/` (git-ignored, and the script
refuses to run if that ignore rule is missing — those files contain every
customer record you have). **Copy it somewhere off your laptop.**

You can stop here. Everything below is the actual move.

## Step 2 — Create the Singapore project

In the Supabase dashboard: **New project**, same organisation.

- **Region:** Southeast Asia (Singapore) — `ap-southeast-1`
- **Database password:** generate a new strong one and save it
- Do not create any tables. The restore brings the whole schema.

Turn on **Point-in-Time Recovery or daily backups** while you are in there. It
is the reason the old project had none.

## Step 3 — Restore into it

```bash
export NEW_DB_URL='postgresql://postgres.NEWREF:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'

./scripts/supabase-move.sh restore
./scripts/supabase-move.sh verify
```

`restore` refuses a target that already holds rows, because restoring twice
gives you two of every order. `verify` compares exact row counts table by table,
including `auth.users`. **If verify reports a mismatch, stop — do not change any
environment variable.**

## Step 4 — Rehearse against the new project

Still with production pointed at Tokyo. Put the new keys in a **preview**
deployment's environment variables, or in your local `.env.local`, and check:

- [ ] `npm run supabase:check` — every table present, and `esim_deliveries` /
      `telegram_links` still unreadable with the anon key
- [ ] Sign in with email + password
- [ ] Sign in with Google (needs Step 5 done first)
- [ ] An existing order appears in the customer dashboard
- [ ] The order-number + email lookup returns a QR without signing in
- [ ] `/admin` loads for your admin account and the staff list renders

## Step 5 — Re-enter the settings that do not travel in a dump

A dump carries tables, data, RLS policies, functions and triggers. It does **not
carry project configuration**. Each of these must be set by hand in the new
project, and each one breaks something if you skip it:

| Setting | Where | Breaks if skipped |
|---|---|---|
| Site URL + Redirect URLs | Auth → URL Configuration | Every email link and OAuth return lands on the wrong host |
| Google sign-in keys | Auth → Providers | Google sign-in fails |
| Apple sign-in keys | Auth → Providers | Apple sign-in fails |
| SMTP / email sender | Auth → Emails | No password resets, no confirmation mail |
| Email templates | Auth → Emails | Reset links point at `/auth/callback` again — see `docs/AUTH.md` |
| Backups / PITR | Settings → Database | You are back to no backups |

**Google and Apple also need updating on their side.** The OAuth redirect you
registered with them points at the *Supabase* project reference:

```
https://tmythlbtxokxucorvpst.supabase.co/auth/v1/callback   ← old
https://<new-ref>.supabase.co/auth/v1/callback              ← add this
```

Add the new one in the Google Cloud Console and the Apple Developer portal
**before** cutover, and leave the old one in place until you are sure. Both
providers allow more than one redirect URI, so there is no gap.

## Step 6 — Cutover

At a quiet hour:

1. **Pause checkout** if you have a way to. Anything paid during the switch can
   be written to the old database and lost.
2. Re-run `dump` → `restore` → `verify` so the new project has the orders placed
   since your rehearsal. Restore into a *fresh* project, not on top of the
   rehearsal data — or use `--force` knowing it will duplicate.
3. In Vercel → Settings → Environment Variables, replace all three:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
4. Redeploy.
5. Walk the Step 4 checklist again against production.
6. `GET /api/health` should report `status: "ok"`.

**Do not delete the Tokyo project.** Leave it running and untouched for at least
two weeks. It is your rollback: putting the three old environment variables back
and redeploying returns you to a working site in minutes.

## What does *not* change

Worth stating, because it is the part people over-plan:

- **Stripe and ABA webhook URLs stay exactly as they are.** They point at your
  Vercel app (`/api/payments/stripe`, `/api/payments/aba`), not at Supabase.
- **The Telegram webhook URL is unchanged**, for the same reason.
- **No code changes.** Every Supabase detail in this app comes from those three
  environment variables.
- **No Storage migration.** This project uses no Supabase Storage buckets.
- **No Edge Functions to redeploy.** There are none.

## Rollback

If anything is wrong after cutover: put the three old environment variables
back, redeploy, and you are on Tokyo again. Orders placed on the new project
during the window will not be in Tokyo — which is why the cutover happens when
almost nobody is buying, and why checkout is paused for it.
