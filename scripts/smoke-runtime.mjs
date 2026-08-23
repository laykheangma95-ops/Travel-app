#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Does the app actually render, in a real browser?
//
// WHY THIS EXISTS:
//   `npm run verify` is a STATIC gate: typecheck, lint, unit tests. It passed
//   continuously while a UI path nobody had ever opened sat behind it. Unit
//   tests mock auth, mock fetch and mock the database, so they answer "is this
//   logic self-consistent?" — never "can a person use this?".
//
//   This is the second gate. It boots the real dev server, drives real
//   Chromium, and asserts on what a visitor actually sees. It only covers paths
//   reachable WITHOUT a backend, because those are the only ones honestly
//   provable on an unconfigured machine. Run `npm run env:check` to see which
//   those are here.
//
// HONEST LIMITS, STATED IN THE TOOL RATHER THAN IN A FOOTNOTE:
//   Every authenticated journey — sign in, save a place, see it on a trip — is
//   OUT OF SCOPE and reported as SKIPPED, not as passing. A green run of this
//   script never means "the feature works for a signed-in traveler".
//
// Usage:  npm run verify:runtime
// Exit:   0 all checks passed (or skipped for a stated reason) · 1 a real failure
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();

/**
 * Claim a port the OS says is free, rather than hoping a fixed one is.
 * A previous run that did not shut down cleanly used to make this script die
 * on EADDRINUSE and report it as a product failure — a fragile harness
 * inventing bad news about working code.
 */
async function freePort() {
  if (process.env.SMOKE_PORT) return Number(process.env.SMOKE_PORT);
  const net = await import('node:net');
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 120_000;
/** First-request compilation budget per route — a build, not a page load. */
const COMPILE_TIMEOUT_MS = 120_000;

const green = (s) => `[32m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const bold = (s) => `[1m${s}[0m`;

const results = [];
const record = (state, name, detail) => {
  results.push({ state, name, detail });
  const mark = state === 'pass' ? green('PASS') : state === 'skip' ? yellow('SKIP') : red('FAIL');
  console.log(`  ${mark}  ${name}${detail ? dim(`\n         ${detail}`) : ''}`);
};

// ── Capability gate ─────────────────────────────────────────────────────────
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.log(`\n${bold('Runtime smoke')} ${yellow('SKIPPED')} — no Playwright package installed.`);
    console.log(dim('  Enable with:  npm i -D playwright-core'));
    console.log(dim('  A browser binary is already present when PLAYWRIGHT_BROWSERS_PATH is set.\n'));
    process.exit(0);
  }
}

const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? resolve(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
  : null;
const executablePath = browserPath && existsSync(browserPath) ? browserPath : undefined;

// ── Boot the dev server ─────────────────────────────────────────────────────
console.log(`\n${bold('Runtime smoke')} ${dim(`· ${BASE}`)}\n`);

const server = spawn('npx', ['next', 'dev', '--port', String(PORT)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'development' },
});

let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d.toString()));
server.stderr.on('data', (d) => (serverLog += d.toString()));

const shutdown = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

async function waitForServer() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`dev server exited early:\n${serverLog.slice(-800)}`);
    try {
      const response = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
      if (response.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server did not answer within ${BOOT_TIMEOUT_MS}ms:\n${serverLog.slice(-800)}`);
}

let browser;
try {
  await waitForServer();

  browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // Page-level crashes are failures even when the markup looks fine.
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));

  /**
   * `next dev` compiles a route on its first request, which on a cold .next can
   * take longer than any sane navigation timeout — the browser then times out
   * on what is really a build, and reports a flake as a failure. So each route
   * is compiled with a plain fetch on a generous budget first; the navigation
   * that follows is measuring the page, not the compiler.
   */
  const warm = async (path) => {
    try {
      await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS) });
    } catch {
      /* the navigation below will report it properly */
    }
  };

  const open = async (path) => {
    await warm(path);
    const response = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1200);
    return response;
  };
  const bodyText = () => page.locator('body').innerText();

  // ── 1. A destination guide renders for a guest ────────────────────────────
  {
    const response = await open('/destination/bangkok');
    const text = await bodyText();
    if (response.status() === 200 && /Bangkok/i.test(text)) {
      record('pass', 'Destination guide renders for a signed-out visitor');
    } else {
      record('fail', 'Destination guide renders for a signed-out visitor', `HTTP ${response.status()}`);
    }
  }

  // ── 2. The save control is present and reachable ──────────────────────────
  {
    // It lives inside the "Places worth going" fold, so a visitor has to open
    // that first. Encoded here because it is exactly the step that made a
    // manual walk-through look like a broken button.
    const trigger = page.locator('[aria-controls="places-panel"]');
    if (await trigger.count()) await trigger.first().click().catch(() => {});
    await page.waitForTimeout(900);

    const save = page.locator('button.v3-save').first();
    const visible = (await save.count()) > 0 && (await save.isVisible());
    const label = visible ? await save.getAttribute('aria-label') : null;

    if (visible && /save/i.test(label ?? '')) {
      record('pass', 'Save control is reachable once "Places worth going" is open', label);
    } else {
      record('fail', 'Save control is reachable once "Places worth going" is open', `visible=${visible}`);
    }
  }

  // ── 3. The OS share target reads a link out of shared text ────────────────
  {
    await open('/share/maps-link?text=Wat%20Pho%0Ahttps%3A%2F%2Fmaps.app.goo.gl%2Fabc123');
    const text = await bodyText();
    const showsLink = text.includes('https://maps.app.goo.gl/abc123');
    const androidCaveat = /Android\/Chrome/i.test(text) && /iOS Safari does not support/i.test(text);

    if (showsLink && androidCaveat) {
      record('pass', 'Share target extracts the link from a Maps-style text blob');
    } else {
      record('fail', 'Share target extracts the link from a Maps-style text blob', `link=${showsLink} caveat=${androidCaveat}`);
    }
  }

  // ── 4. The share target degrades honestly with nothing shared ─────────────
  {
    await open('/share/maps-link');
    const text = await bodyText();
    if (/No link in that share/i.test(text)) {
      record('pass', 'Share target explains itself when no link was shared');
    } else {
      record('fail', 'Share target explains itself when no link was shared');
    }
  }

  // ── 5. /trips is usable signed-out and never claims data loss ─────────────
  {
    const response = await open('/trips');
    const text = await bodyText();
    // "No trips yet" is correct for a guest with no backend; what would be
    // wrong is a crash or a blank screen.
    const ok = response.status() === 200 && /trips/i.test(text);
    record(ok ? 'pass' : 'fail', '/trips renders for a signed-out visitor', ok ? undefined : `HTTP ${response.status()}`);
  }

  // ── 6. maps-link refuses a link-local address over the real HTTP stack ────
  {
    // CARE IS NEEDED WITH WHAT THIS PROVES. The route calls requireUser BEFORE
    // assertAllowedHost, so on a machine with no Supabase the answer is 401 and
    // the SSRF branch is never reached. Asserting only "status >= 400" would
    // look like SSRF coverage while actually testing the auth gate — the exact
    // overclaiming this whole gate exists to stop. So the two cases are
    // distinguished and labelled by what was genuinely observed.
    //
    // Auth-before-allowlist is the right order: an anonymous caller cannot
    // reach the fetch path at all. The allowlist itself is pinned by
    // tests/mapsLinkRoute.test.ts, which is mutation-tested.
    const blocked = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/travel/maps-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://169.254.169.254/' }),
      });
      return { status: r.status, body: await r.text() };
    }, BASE);

    const leaked = /"lat"|"lng"/.test(blocked.body);
    if (leaked) {
      record('fail', 'maps-link never resolves a link-local address', `HTTP ${blocked.status} returned coordinates`);
    } else if (blocked.status === 401) {
      record(
        'pass',
        'maps-link refuses a link-local address (auth gate, before the allowlist)',
        'HTTP 401 — anonymous callers cannot reach the fetch path. Allowlist itself covered by unit tests.'
      );
    } else if (blocked.status === 400) {
      record('pass', 'maps-link refuses a link-local address (SSRF allowlist)', 'HTTP 400 from assertAllowedHost');
    } else {
      record('fail', 'maps-link refuses a link-local address', `unexpected HTTP ${blocked.status}`);
    }
  }

  // ── 7. No uncaught page errors anywhere above ─────────────────────────────
  if (pageErrors.length === 0) {
    record('pass', 'No uncaught client-side exceptions on any page visited');
  } else {
    record('fail', 'No uncaught client-side exceptions on any page visited', pageErrors.join(' | '));
  }

  // ── Out of scope, and said so plainly ─────────────────────────────────────
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!configured) {
    record(
      'skip',
      'Authenticated journey (sign in → save → trip → itinerary)',
      'No Supabase configured, so no sign-in can succeed. NOT covered by a green run.'
    );
  }
} catch (error) {
  record('fail', 'Smoke run completed', error instanceof Error ? error.message.slice(0, 400) : String(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  shutdown();
}

const failed = results.filter((r) => r.state === 'fail');
const passed = results.filter((r) => r.state === 'pass');
const skipped = results.filter((r) => r.state === 'skip');

console.log(
  `\n  ${bold('Runtime:')} ${green(`${passed.length} passed`)}` +
    (skipped.length ? `, ${yellow(`${skipped.length} skipped`)}` : '') +
    (failed.length ? `, ${red(`${failed.length} failed`)}` : '')
);
if (skipped.length) console.log(dim('  A skip is an unproven claim, not a passing one.\n'));
else console.log('');

process.exit(failed.length ? 1 : 0);
