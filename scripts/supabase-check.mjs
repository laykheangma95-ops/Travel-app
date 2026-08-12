// ─────────────────────────────────────────────────────────────────────────────
// Supabase reality check — does the live database match what the code expects?
//
// WHY THIS EXISTS:
//   The Supabase dashboard shows a success rate and an error count, but not
//   which call failed or why. Meanwhile the project reports "No migrations",
//   which means the SQL in supabase/migrations was never applied through the
//   CLI — so the live schema is whatever was typed into the dashboard, and it
//   can drift from the repo without anything turning red until a customer hits
//   the missing table at checkout.
//
//   This script asks the database directly, once per table the code queries,
//   and prints the answer in plain language.
//
// It is READ-ONLY. It selects zero rows (`head: true`), writes nothing, and
// creates nothing.
//
//   node scripts/supabase-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every table the application code reads or writes, gathered from the
 * `.from('…')` calls in lib/ and app/.
 *
 * `serviceOnly` marks the two tables docs/LOCKED.md requires to be unreachable
 * with the anon key. They hold the customer contact dataset, so the check is
 * not "does it work" but "is it still shut".
 */
const TABLES = [
  { name: 'esim_orders', critical: true },
  { name: 'order_items', critical: true },
  { name: 'order_events', critical: true },
  { name: 'staff_users', critical: true },
  { name: 'staff_events', critical: false },
  { name: 'profiles', critical: false },
  { name: 'affiliates', critical: false },
  { name: 'affiliate_events', critical: false },
  { name: 'saved_flights', critical: false },
  { name: 'push_subscriptions', critical: false },
  { name: 'esim_deliveries', critical: true, serviceOnly: true },
  { name: 'telegram_links', critical: true, serviceOnly: true },
];

/** Reads .env.local without a dependency — same format Next.js loads. */
async function loadEnvFile() {
  for (const file of ['.env.local', '.env']) {
    try {
      const text = await readFile(join(repoRoot, file), 'utf8');
      for (const line of text.split('\n')) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[match[1]]) process.env[match[1]] = value;
      }
    } catch {
      // Absent file is fine — the variables may come from the shell.
    }
  }
}

function explain(error) {
  if (!error) return null;
  const code = error.code ?? '';
  const map = {
    '42P01': 'TABLE MISSING — the migration that creates it was never applied.',
    PGRST205: 'TABLE MISSING — PostgREST cannot see it in the schema cache.',
    '42703': 'COLUMN MISSING — the live schema has drifted from the repo.',
    PGRST204: 'COLUMN MISSING — PostgREST cannot see a column the code selects.',
    '42501': 'PERMISSION DENIED — RLS or grants refused even the service role.',
    '57014': 'TIMED OUT — the query was too slow for the instance.',
    '53300': 'NO CONNECTION SLOTS — the instance is out of connections.',
  };
  return map[code] ?? `${code || 'no code'} — ${error.message}`;
}

async function main() {
  await loadEnvFile();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY. Put them in .env.local, or export them, then run again.'
    );
    process.exit(2);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = anonKey
    ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  console.log(`\nChecking ${new URL(url).host}\n`);

  const problems = [];
  const leaks = [];

  for (const table of TABLES) {
    const started = Date.now();
    const { count, error } = await admin
      .from(table.name)
      .select('*', { count: 'exact', head: true });
    const ms = Date.now() - started;

    if (error) {
      const reason = explain(error);
      console.log(`  ✗ ${table.name.padEnd(20)} ${reason}`);
      if (table.critical) problems.push(`${table.name}: ${reason}`);
      continue;
    }

    console.log(`  ✓ ${table.name.padEnd(20)} ${String(count ?? 0).padStart(7)} rows   ${ms}ms`);

    // docs/LOCKED.md invariant 4: the contact dataset stays service-role only.
    // A policy added later "just to make the dashboard work" would show up here.
    if (table.serviceOnly && anon) {
      const probe = await anon.from(table.name).select('*', { count: 'exact', head: true });
      if (!probe.error) {
        leaks.push(table.name);
      }
    }
  }

  if (leaks.length > 0) {
    console.log('\n  ⚠  READABLE WITH THE ANON KEY — this breaks docs/LOCKED.md invariant 4:');
    for (const name of leaks) console.log(`     ${name}`);
  }

  if (problems.length === 0 && leaks.length === 0) {
    console.log('\nEvery table the code uses exists and is reachable.\n');
    return;
  }

  if (problems.length > 0) {
    console.log('\nTables the checkout and admin panel depend on are unusable:');
    for (const problem of problems) console.log(`  • ${problem}`);
    console.log('\nApply the SQL in supabase/migrations to this project, in filename order.');
  }

  console.log('');
  process.exit(1);
}

main().catch((error) => {
  console.error('Check failed to run:', error.message);
  process.exit(2);
});
