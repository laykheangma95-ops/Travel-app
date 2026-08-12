# Supabase projects — creating one, and getting the schema into it

How to stand up a Supabase project for Domner and bring it to the current
schema, including the Singapore-region project.

---

## 1. Why Singapore

Supabase projects are pinned to a region when they are created and **cannot be
moved afterwards.** Changing region means creating a second project and
migrating the data across, so this is the one setting worth getting right the
first time.

Pick **Southeast Asia (Singapore) · `ap-southeast-1`.**

- It is the closest Supabase region to Phnom Penh — roughly 20–40 ms, against
  200 ms+ from the US regions. Every page that reads the database pays that
  round trip, and our customers are in Cambodia.
- Cambodian consumer internet is mostly mobile. Latency hurts more than
  bandwidth there, and it compounds: a checkout doing several sequential
  queries pays the round trip each time.
- The eSIM supplier and payment rails we integrate with are also in the region.

There is no data-residency requirement forcing this — it is a latency decision.

---

## 2. Creating the project

**This part needs the owner.** Creating a Supabase project is an account-level
action against the Supabase dashboard, billed to the organisation. It is not
something the codebase can do, and there is no Supabase access token in the
repo or the deployment environment — by design.

In the Supabase dashboard:

1. **New project**, in the organisation that holds the founder's account.
2. **Name** — say `domner-prod-sg` (or `-dev-sg` / `-staging-sg`). Step 0 of the
   build plan calls for three separate projects; region them all the same.
3. **Region** — `Southeast Asia (Singapore)`. See §1. Not changeable later.
4. **Database password** — generate it, store it in the password manager. It is
   not recoverable, only resettable, and resetting it means updating everywhere
   it is configured.
5. Wait for provisioning (a couple of minutes).

Then copy three values out of the dashboard:

| Value | Where | Goes to |
|---|---|---|
| Project URL | Settings → API | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` public key | Settings → API | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | Settings → API | `SUPABASE_SERVICE_KEY` |
| Connection string (URI) | Settings → Database | the bootstrap script, below |

> The `service_role` key bypasses row-level security completely. It goes into
> the Vercel environment as `SUPABASE_SERVICE_KEY` and nowhere else. Never
> `NEXT_PUBLIC_`-prefix it, never put it in a client component, never paste it
> into a commit or a chat message. Same for the database password inside the
> connection string.

---

## 3. Getting the schema in

```bash
./scripts/supabase-bootstrap.sh "postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres"
```

Add `--dry-run` first to see what it would apply without writing anything.

The script exists because **neither SQL entry point in this repo bootstraps a
project on its own**, and running the wrong one at the wrong time leaves a
half-applied database:

- `supabase/schema.sql` — bare `CREATE TABLE`. Fresh projects only. Against a
  project that already has tables it errors partway through.
- `supabase/migrations/*.sql` — `ALTER`-based and idempotent, but they never
  create the base tables. On a fresh project the first one dies with
  `relation "esim_orders" does not exist`.

The order is schema.sql, then every migration. The script detects whether the
project is already provisioned and skips schema.sql if so, which makes it safe
to point at the live database — migrations are idempotent, so an already-current
project is a no-op.

It finishes by checking three things: table count, that no public table has RLS
switched off, and that `handle_new_user()` still claims guest orders (§4).

### Migration order is not alphabetical, and looks like it is

The directory mixes prefix widths:

```
0001_order_integrity_and_roles.sql   <- four digits
001_auth_methods.sql                 <- three
002_esim_delivery.sql
...
```

`0001_` sorts **before** `001_`, because `'0' < '1'` at the third character.
That is the intended order, but it reads backwards, so the bootstrap script
pins the order in an explicit list rather than globbing, and refuses to run if a
migration on disk is missing from that list.

**New migrations continue the three-digit sequence** — `006_`, `007_`. Do not
add more four-digit ones.

---

## 4. The `handle_new_user()` conflict, and why 005 exists

Worth knowing before you touch either signup migration.

`public.handle_new_user()` was defined **twice**, in two migrations, both with
`CREATE OR REPLACE`:

| Migration | What its version does |
|---|---|
| `0001_order_integrity_and_roles.sql` | inserts `(id, full_name, email)`, then claims guest orders matching the new user's email |
| `001_auth_methods.sql` | inserts the full profile — phone, country, language, verification timestamps, auth providers — and claims nothing |

Postgres has no opinion about this. The last definition applied wins, silently,
with no error and no warning. Because `0001_` sorts first, `001_auth_methods`
always landed last, and the guest-order claim was overwritten and lost.

The effect: someone buys an eSIM as a guest, then signs up with the same email.
Their order keeps `user_id = NULL` and does not appear as theirs in "My eSIMs" —
the exact orphaned-order bug `0001` was written to fix, undone by a migration
that was not about orders at all.

`005_restore_guest_order_claim.sql` defines the function once, as the union of
both, and back-fills the orders orphaned in the meantime. It also restores the
`SET search_path = public` that `001` dropped — a `SECURITY DEFINER` function
without a pinned search path can be steered by the caller's — and asserts it
rather than leaving it to inspection.

The two earlier definitions are **left in place on purpose.** They have already
been applied to the live database; editing an applied migration would put the
files out of step with what the database actually ran. Later-wins is a property
of the ordering, so the correction belongs in a later file.

**If you add another `handle_new_user()` definition, it wins over 005 and the
guest-order claim disappears again.** Change 005, or add a 006 that carries both
halves forward.

---

## 5. Verifying it worked

Against a new project, after the bootstrap:

```sql
-- Every public table has row-level security on. Expect zero rows.
SELECT tablename FROM pg_tables
 WHERE schemaname = 'public' AND NOT rowsecurity;

-- The signup trigger claims guest orders. Expect one row.
SELECT proname FROM pg_proc
 WHERE proname = 'handle_new_user'
   AND pronamespace = 'public'::regnamespace
   AND prosrc LIKE '%esim_orders%';
```

The full schema + migration sequence has been verified end to end against
PostgreSQL 16: clean apply to an empty database, then a second full pass to
confirm every migration is genuinely idempotent.

---

## 6. Wiring the app to it

Set these in the Vercel environment for the target deployment — not in a
committed file:

```
NEXT_PUBLIC_SUPABASE_URL=https://REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
```

The app degrades to a demo no-op when these are missing (`getSupabase()`
returns `null`), so an unconfigured environment runs rather than crashes. That
also means **a misconfigured production deployment looks like a working one**
with an empty database — check §5 against the project you actually pointed at,
not the one you meant to.
