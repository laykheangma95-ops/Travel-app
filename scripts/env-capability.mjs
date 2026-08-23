#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// What can this environment actually PROVE?
//
// WHY THIS EXISTS:
//   Three features were built and reported as complete before anyone checked
//   whether this machine had a backend to test them against. It did not. The
//   unit suite was green the whole time and stayed green, because every test
//   that touches auth mocks it away — so "505 tests pass" was true and told you
//   nothing about whether a traveler could sign in and save a place.
//
//   The failure was not the missing backend. It was reporting a number without
//   first establishing what the number could mean. This script establishes it,
//   in about a second, before any work starts.
//
// WHAT IT IS NOT:
//   Not a gate. It never fails a build and has no opinion about whether the
//   environment is "good". It answers one question — WHAT MAY I CLAIM HERE? —
//   and then gets out of the way.
//
// Usage:  npm run env:check
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const NETWORK_TIMEOUT_MS = 4000;

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;
const red = (s) => `[31m${s}[0m`;

/** Env vars can arrive from the shell or from a .env file Next would load. */
function envValue(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.local', '.env']) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, 'utf8')
      .split('\n')
      .find((row) => row.trim().startsWith(`${name}=`));
    if (line) {
      const value = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
      if (value) return value;
    }
  }
  return null;
}

async function reachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    // HEAD is enough to learn whether egress is permitted; the status does not
    // matter, only that a response came back rather than a refusal.
    await fetch(url, { method: 'HEAD', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const supabaseUrl = envValue('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnon = envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const supabaseService = envValue('SUPABASE_SERVICE_KEY');
const hasSupabase = Boolean(supabaseUrl && supabaseAnon);

const chromium = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? resolve(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
  : null;
const hasBrowserBinary = Boolean(chromium && existsSync(chromium));
const hasPlaywright =
  existsSync(resolve(root, 'node_modules/playwright-core')) ||
  existsSync(resolve(root, 'node_modules/playwright'));
const hasPglite = existsSync(resolve(root, 'node_modules/@electric-sql/pglite'));
const hasDeps = existsSync(resolve(root, 'node_modules/next'));

const [egressGeneral, egressSupabase] = await Promise.all([
  reachable('https://registry.npmjs.org/'),
  supabaseUrl ? reachable(supabaseUrl) : Promise.resolve(false),
]);

const rows = [
  ['Dependencies installed', hasDeps, 'unit tests, typecheck, lint, dev server'],
  ['PGlite (Postgres in WASM)', hasPglite, 'RLS policy tests against real Postgres'],
  ['Supabase URL + anon key', hasSupabase, 'sign-in, saving, any authenticated path'],
  ['Supabase service key', Boolean(supabaseService), 'admin/service-role paths'],
  ['Supabase reachable', egressSupabase, 'live reads and writes'],
  ['Browser binary', hasBrowserBinary, 'driving real UI'],
  ['Playwright package', hasPlaywright, 'scripted browser walk-throughs'],
  ['General network egress', egressGeneral, 'anything calling a third party'],
];

console.log(`\n${bold('Environment capability report')}`);
console.log(dim(`  ${new Date().toISOString()}  ·  node ${process.version}\n`));

const width = Math.max(...rows.map(([label]) => label.length));
for (const [label, ok, unlocks] of rows) {
  const mark = ok ? green('  yes') : red('   no');
  console.log(`  ${mark}  ${label.padEnd(width)}  ${dim(unlocks)}`);
}

// ── The part that actually matters: what may be claimed ─────────────────────
const provable = ['Pure logic and any route reachable without a backend', 'Typecheck, lint, unit tests'];
const unprovable = [];

if (hasPglite) provable.push('RLS policies, against real Postgres');
else unprovable.push('RLS policy behaviour');

if (hasSupabase && egressSupabase) {
  provable.push('Sign-in, saving, and authenticated end-to-end flows');
} else {
  unprovable.push('ANY authenticated flow — sign-in, saving, a real user journey');
}

if (hasBrowserBinary && hasPlaywright && hasDeps) {
  provable.push('What a real browser renders, for unauthenticated pages');
} else {
  unprovable.push('What the UI actually renders');
}

if (!egressGeneral) unprovable.push('Live calls to any third-party service');

console.log(`\n${bold('  Provable here')}`);
for (const item of provable) console.log(`    ${green('+')} ${item}`);

if (unprovable.length) {
  console.log(`\n${bold('  NOT provable here')} ${dim('— state this before reporting, not after')}`);
  for (const item of unprovable) console.log(`    ${yellow('-')} ${item}`);
}

console.log(`\n${dim('  Report static and runtime confidence separately. See docs/VERIFICATION.md.')}\n`);

// Informational by design: never fails a build.
process.exit(0);
