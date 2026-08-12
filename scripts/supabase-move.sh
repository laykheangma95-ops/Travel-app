#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Move a Supabase project to another region — Tokyo → Singapore.
#
# Supabase cannot move a project between regions. The only route is a new
# project in the target region and a full dump/restore into it. This script is
# that dump and restore, written so it can be rehearsed as many times as you
# like before the real cutover.
#
# THREE MODES:
#   ./scripts/supabase-move.sh dump      Dump the old project to a folder. Safe,
#                                        read-only, and the backup this project
#                                        does not currently have. Run it alone.
#   ./scripts/supabase-move.sh restore   Load the newest dump into the NEW
#                                        project. Refuses a target that already
#                                        holds rows unless --force.
#   ./scripts/supabase-move.sh verify    Compare row counts, old versus new.
#
# WHAT YOU NEED (both from Supabase → Project Settings → Database → Connection
# string → URI, with the password filled in):
#
#   export OLD_DB_URL='postgresql://postgres.tmythlbtxokxucorvpst:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
#   export NEW_DB_URL='postgresql://postgres.NEWREF:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
#
# Use the SESSION pooler (port 5432) or the direct connection — NOT the
# transaction pooler on 6543. A restore needs prepared statements and a single
# long transaction, and the transaction pooler supports neither.
#
# This script never touches the old project except to read from it.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

MODE="${1:-}"
FORCE="${2:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_ROOT="$REPO_ROOT/.supabase-dumps"

# The dumps contain every customer record in the database. Keeping them out of
# git is not a nicety — docs/LOCKED.md treats this dataset as the company's most
# sensitive asset.
if [ -d "$REPO_ROOT/.git" ] && ! grep -qs '^\.supabase-dumps' "$REPO_ROOT/.gitignore"; then
  echo "FATAL: .supabase-dumps is not in .gitignore. Refusing to write customer data next to a git repo."
  exit 1
fi

die() { echo "ERROR: $*" >&2; exit 1; }

need_tool() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is not installed. $2"
}

latest_dump() {
  # shellcheck disable=SC2012
  ls -1d "$DUMP_ROOT"/*/ 2>/dev/null | sort | tail -1
}

# ── dump ─────────────────────────────────────────────────────────────────────
do_dump() {
  [ -n "${OLD_DB_URL:-}" ] || die "OLD_DB_URL is not set. See the header of this script."
  need_tool supabase "Install with: npm install -g supabase"

  local stamp dir
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dir="$DUMP_ROOT/$stamp"
  mkdir -p "$dir"

  echo "Dumping the old project into $dir"
  echo

  # Three separate dumps because they restore in a strict order: roles must
  # exist before the schema that grants to them, and the schema before the data
  # that fills it.
  echo "  1/3  roles"
  supabase db dump --db-url "$OLD_DB_URL" -f "$dir/roles.sql" --role-only

  echo "  2/3  schema (tables, RLS policies, functions, triggers)"
  supabase db dump --db-url "$OLD_DB_URL" -f "$dir/schema.sql"

  # --use-copy makes this a COPY stream rather than a million INSERTs. On a
  # Nano instance that is the difference between minutes and hours.
  echo "  3/3  data (includes auth.users — every customer account)"
  supabase db dump --db-url "$OLD_DB_URL" -f "$dir/data.sql" --use-copy --data-only

  chmod -R go-rwx "$dir"

  echo
  echo "Done. Sizes:"
  du -h "$dir"/*.sql | sed 's/^/  /'
  echo
  echo "This folder is now the backup this project did not have. Keep a copy"
  echo "somewhere off this machine before you touch anything else."
}

# ── restore ──────────────────────────────────────────────────────────────────
do_restore() {
  [ -n "${NEW_DB_URL:-}" ] || die "NEW_DB_URL is not set. See the header of this script."
  need_tool psql "Install the postgresql client, e.g. brew install libpq or apt install postgresql-client"

  local dir
  dir="$(latest_dump)"
  [ -n "$dir" ] || die "No dump found in $DUMP_ROOT. Run '$0 dump' first."

  for file in roles schema data; do
    [ -s "$dir/$file.sql" ] || die "$dir/$file.sql is missing or empty. Re-run the dump."
  done

  echo "Restoring $dir into the new project"
  echo

  # A restore into a project that already holds rows silently doubles them —
  # two of every order, two of every customer. Check before, not after.
  local existing
  existing="$(psql "$NEW_DB_URL" -tAc \
    "SELECT COALESCE(SUM(n_live_tup), 0) FROM pg_stat_user_tables WHERE schemaname = 'public'" 2>/dev/null || echo "unreachable")"

  [ "$existing" = "unreachable" ] && die "Cannot connect to NEW_DB_URL. Check the URL and password."

  if [ "$existing" != "0" ] && [ "$FORCE" != "--force" ]; then
    die "The target already holds ~$existing rows in public. Restoring on top would duplicate them.
       Use a genuinely new, empty project — or re-run with --force if you are certain."
  fi

  # --single-transaction: the restore either lands completely or not at all,
  #   so a network drop halfway leaves no half-migrated database.
  # session_replication_role = replica: suspends foreign keys and triggers for
  #   the data load, so table order does not matter and the audit triggers do
  #   not fire on a million backfilled rows.
  psql \
    --single-transaction \
    --variable ON_ERROR_STOP=1 \
    --file "$dir/roles.sql" \
    --file "$dir/schema.sql" \
    --command 'SET session_replication_role = replica' \
    --file "$dir/data.sql" \
    --dbname "$NEW_DB_URL"

  echo
  echo "Restore finished. Run '$0 verify' before pointing anything at it."
}

# ── verify ───────────────────────────────────────────────────────────────────
do_verify() {
  [ -n "${OLD_DB_URL:-}" ] || die "OLD_DB_URL is not set."
  [ -n "${NEW_DB_URL:-}" ] || die "NEW_DB_URL is not set."
  need_tool psql "Install the postgresql client."

  # Exact counts, not the planner's estimates — this is the check that decides
  # whether real customer orders arrived.
  local query="
    SELECT 'auth.users' AS table_name, count(*) FROM auth.users
    UNION ALL SELECT 'esim_orders', count(*) FROM public.esim_orders
    UNION ALL SELECT 'order_items', count(*) FROM public.order_items
    UNION ALL SELECT 'order_events', count(*) FROM public.order_events
    UNION ALL SELECT 'esim_deliveries', count(*) FROM public.esim_deliveries
    UNION ALL SELECT 'telegram_links', count(*) FROM public.telegram_links
    UNION ALL SELECT 'staff_users', count(*) FROM public.staff_users
    UNION ALL SELECT 'affiliates', count(*) FROM public.affiliates
    ORDER BY 1"

  echo "Comparing row counts."
  echo
  printf '  %-20s %10s %10s\n' "TABLE" "OLD" "NEW"

  local mismatch=0
  while IFS='|' read -r name old_count; do
    [ -z "$name" ] && continue
    local new_count
    new_count="$(psql "$NEW_DB_URL" -tAc "SELECT count(*) FROM ${name}" 2>/dev/null || echo "MISSING")"
    if [ "$old_count" = "$new_count" ]; then
      printf '  %-20s %10s %10s  ok\n' "$name" "$old_count" "$new_count"
    else
      printf '  %-20s %10s %10s  MISMATCH\n' "$name" "$old_count" "$new_count"
      mismatch=1
    fi
  done < <(psql "$OLD_DB_URL" -tA -F'|' -c "$query")

  echo
  if [ "$mismatch" = "1" ]; then
    echo "Counts do not match. Do NOT switch the environment variables over."
    exit 1
  fi
  echo "Every table matches. Safe to proceed to the cutover steps in"
  echo "docs/SUPABASE-REGION-MOVE.md."
}

case "$MODE" in
  dump) do_dump ;;
  restore) do_restore ;;
  verify) do_verify ;;
  *)
    echo "Usage: $0 {dump|restore|verify} [--force]"
    echo
    echo "  dump     Read the old project into .supabase-dumps/ (safe, read-only)"
    echo "  restore  Load the newest dump into NEW_DB_URL"
    echo "  verify   Compare row counts between old and new"
    exit 1
    ;;
esac
