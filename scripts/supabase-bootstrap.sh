#!/usr/bin/env bash
#
# Bring a Supabase project up to the current schema.
#
#   ./scripts/supabase-bootstrap.sh "postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres"
#   ./scripts/supabase-bootstrap.sh "$DATABASE_URL" --dry-run
#
# WHY THIS EXISTS
#   There are two SQL entry points in this repo and running the wrong one at
#   the wrong time is destructive:
#
#     supabase/schema.sql   bare CREATE TABLE. Fresh projects only. On a
#                           project that already has tables it errors out
#                           partway, leaving the database half-applied.
#     supabase/migrations/  ALTER-based and idempotent, but they do NOT create
#                           the base tables. On a fresh project they fail with
#                           'relation "esim_orders" does not exist'.
#
#   Neither one bootstraps a project on its own. The order is schema.sql first,
#   then every migration, and this script is the only place that order is
#   executable rather than remembered.
#
#   It also pins the migration order explicitly. The directory mixes a
#   four-digit prefix (0001_) with three-digit ones (001_), and "0001_" sorts
#   BEFORE "001_" because '0' < '1' at the third character. That happens to be
#   the intended order, but it reads backwards to everyone who sees it, so the
#   order is printed on every run instead of being inferred.
#
# SAFETY
#   Detects an already-provisioned project and skips schema.sql rather than
#   failing into a half-applied state. Every migration is idempotent, so
#   re-running against a live project is a no-op, not a rewrite. Nothing here
#   drops or truncates anything.

set -euo pipefail

DB_URL="${1:-}"
DRY_RUN=""
[ "${2:-}" = "--dry-run" ] && DRY_RUN=1

if [ -z "$DB_URL" ]; then
  cat >&2 <<'USAGE'
usage: scripts/supabase-bootstrap.sh <postgres-connection-string> [--dry-run]

Get the connection string from the Supabase dashboard:
  Project Settings -> Database -> Connection string -> URI

That string contains the database password. Do not paste it into a commit,
a ticket, or a chat message, and do not add it to .env.example.
USAGE
  exit 64
fi

command -v psql >/dev/null || { echo "psql not found. Install the postgresql-client package." >&2; exit 69; }

cd "$(dirname "$0")/.."

# Explicit order. Do not replace this with a glob — see the note above.
MIGRATIONS=(
  supabase/migrations/0001_order_integrity_and_roles.sql
  supabase/migrations/001_auth_methods.sql
  supabase/migrations/002_esim_delivery.sql
  supabase/migrations/003_cost_and_reporting.sql
  supabase/migrations/004_staff_roles.sql
  supabase/migrations/005_restore_guest_order_claim.sql
)

# Every migration on disk must be listed above, or a new one silently never
# runs on a new project and the two databases drift apart.
for f in supabase/migrations/*.sql; do
  listed=""
  for m in "${MIGRATIONS[@]}"; do [ "$m" = "$f" ] && listed=1; done
  [ -n "$listed" ] || { echo "ERROR: $f is not listed in MIGRATIONS[] in $0. Add it, in the position it should run." >&2; exit 78; }
done

psql_run() {
  if [ -n "$DRY_RUN" ]; then echo "  [dry-run] would apply $1"; return; fi
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$1"
  echo "  applied  $1"
}

echo "Checking what is already there..."
EXISTING=$(psql "$DB_URL" -X -qAt -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('profiles','esim_orders');")

if [ "$EXISTING" = "0" ]; then
  echo "Fresh project. Applying the base schema, then every migration."
  psql_run supabase/schema.sql
else
  echo "Project already has tables. Skipping schema.sql; applying migrations only."
  echo "(Migrations are idempotent — already-applied ones are a no-op.)"
fi

for m in "${MIGRATIONS[@]}"; do psql_run "$m"; done

[ -n "$DRY_RUN" ] && { echo; echo "Dry run. Nothing was written."; exit 0; }

echo
echo "Verifying..."
psql "$DB_URL" -X -qAt <<'SQL'
SELECT 'tables: ' || count(*) FROM information_schema.tables WHERE table_schema='public';
SELECT 'RLS off on: ' || COALESCE(string_agg(tablename, ', '), 'none — good')
  FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;
SELECT CASE WHEN prosrc LIKE '%esim_orders%'
            THEN 'handle_new_user: claims guest orders — correct'
            ELSE 'handle_new_user: NOT claiming guest orders — 005 did not land' END
  FROM pg_proc WHERE proname='handle_new_user' AND pronamespace='public'::regnamespace;
SQL

echo
echo "Done. Next: put the project's URL and keys into the Vercel environment"
echo "for this deployment. See docs/SUPABASE-PROJECTS.md."
