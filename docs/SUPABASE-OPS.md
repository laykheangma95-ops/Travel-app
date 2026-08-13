# Supabase: reading the errors, and where the database should live

Written for the owner, not a DBA. Two subjects: what the red **ERRORS** number on
the Supabase dashboard means and how to find out what it is, and whether the
database belongs in Tokyo or Singapore.

---

## 1. Why the error count was unreadable

The Supabase dashboard tells you *how many* requests failed. It does not tell
you *which* call failed, or why. Matching a red number there to a line in the
Vercel log was impossible, because the app was throwing most of that information
away:

- **The middleware** — which runs on nearly every page load — asked Supabase
  "who is this user?" and kept only the answer, discarding the error. A Supabase
  outage and a signed-out visitor looked identical to us.
- **The staff lookup** in the same file did the same thing. A broken permission
  policy showed a real colleague a 404 page, and left nothing in the log to say
  why.
- **Nine order and affiliate queries** dropped their error and returned `null`,
  which every caller reads as "no such record". A failed read looked like a
  missing order.

Every one of those now writes a classified line to the log. Nothing about the
customer's experience changed.

## 2. What a failure now looks like in the log

Each Supabase failure is classified by the code the database itself returns, and
the log line says what to do about it:

```
{"level":"error","event":"order.read_failed","orderNumber":"DMN-2026-00412",
 "dbKind":"missing_table","dbCode":"42P01",
 "dbHint":"The table does not exist in this Supabase project. Apply supabase/migrations…"}
```

The kinds worth knowing:

| `dbKind` | What it means | Whose problem |
|---|---|---|
| `missing_table` / `missing_column` | The live database does not match the code | **Ours — deploy blocker** |
| `rls_denied` | A permission policy refused | **Ours** |
| `duplicate` | A webhook fired twice, or a form was double-submitted | Usually nobody's — expected |
| `stale_session` | A browser replaying a session that no longer exists | Nobody's — handled |
| `bad_credentials` | Someone typed the wrong password or code | The customer's |
| `timeout` / `unavailable` | The database was slow or unreachable | Retry, then investigate |

Errors are logged at `error` level only when the cause is our schema, our
configuration or our code. A customer mistyping a password no longer looks like
an incident.

**Customer row values never reach the log.** Postgres pastes the offending value
into its own error text — `Key (customer_email)=(sokha@example.com) already
exists` — so those values are stripped before anything is written.

## 3. Two likely sources of the errors you are seeing

### a. Stale sessions replaying on every request

A browser holding a Supabase cookie for a session the server has forgotten sends
that cookie on *every* request. Each one is a failed auth call on your
dashboard. One old tab left open can account for a steady drip of errors on a
site with almost no traffic.

The middleware now recognises that specific failure and clears the dead cookie,
so the browser stops asking. It also skips the auth call entirely for visitors
who carry no session cookie at all — most storefront traffic — which cuts both
the request count and the noise.

### b. The schema may never have been migrated

The dashboard reports **"No migrations"**. The repo contains five migration
files in `supabase/migrations/`. If those were never applied to this project,
any table they create is missing, and every query against it fails — which is
exactly what a persistent error rate on an idle project looks like.

To find out, with the project's keys in `.env.local`:

```bash
npm run supabase:check
```

It reads only — it selects zero rows and writes nothing — and prints one line
per table:

```
  ✓ esim_orders              1,204 rows   41ms
  ✗ staff_events             TABLE MISSING — the migration that creates it was never applied.
```

It also checks that `esim_deliveries` and `telegram_links` are still unreadable
with the public key, which `docs/LOCKED.md` requires.

## 4. Also visible on that dashboard: no backups

**"Last backup: No backups"** is a larger risk than anything above. There are
live orders in this database and no way to recover them. Worth fixing before any
of the region work below.

---

## 5. Tokyo or Singapore?

**Recommendation: Singapore (`ap-southeast-1`) is the better home for this
database — but check the Vercel side first, because it is probably costing you
more than the region choice, and it is free to fix.**

### Why Singapore beats Tokyo for this business

Round-trip time from Phnom Penh, approximate:

| Database region | From Cambodia |
|---|---|
| Singapore `ap-southeast-1` | ~25–40 ms |
| Tokyo `ap-northeast-1` | ~75–100 ms |

Cambodian networks reach the world mostly through Singapore and Bangkok;
Singapore is the regional interconnection hub. Tokyo is a detour.

That gap is per database round trip, and a page rarely makes just one. A
checkout or admin screen making four sequential queries carries the difference
four times — roughly a quarter of a second of pure waiting, on every load, for
customers and for your ops staff in Phnom Penh.

Traffic argues the same way: purchases are made in Cambodia before departure,
and the admin panel is used in Cambodia all day. Travellers already in Japan are
a minority of requests, and once the eSIM is delivered they mostly stop making
them.

### The Vercel side mattered more, and is now fixed

The live deployment was running its functions in **Washington DC (`iad1`)** —
Vercel's default, because no region was set anywhere in this repo. Every
database query was going Cambodia → USA → Tokyo and back, around 200 ms of
transit per query, which dwarfed the Tokyo-versus-Singapore difference.

`vercel.json` now pins the functions to Singapore (`sin1`). It applies on the
next deploy, and it is reversible by editing that one file.

### What moving the database would actually cost

Supabase cannot move an existing project between regions. It means creating a
new project in Singapore, moving the data, and repointing everything at it:

- a database dump and restore, during which orders must not be taken;
- new keys in the Vercel environment variables;
- new auth redirect URLs, including at Google and Apple;
- every signed-in customer being signed out, because the JWT secret changes;
- a period where a mistake means a customer pays and receives nothing.

Stripe and ABA webhook URLs do **not** change — they point at the Vercel app,
not at Supabase.

The full runbook, including the parts only the account owner can do, is in
[`docs/SUPABASE-REGION-MOVE.md`](SUPABASE-REGION-MOVE.md). Take the backup in
Step 1 today regardless of what you decide about the region — it is read-only
and this project currently has none.
