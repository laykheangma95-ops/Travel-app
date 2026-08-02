// ─────────────────────────────────────────────────────────────────────────────
// Dependency audit gate.
//
// `npm audit --audit-level=high` is all-or-nothing: one advisory whose only fix
// is a major framework bump turns the gate permanently red, and a permanently
// red gate is one nobody reads. That is worse than no gate — a genuinely new,
// genuinely fixable vulnerability arrives into noise.
//
// So: every high/critical advisory fails the build EXCEPT packages listed in
// audit-allowlist.json with a written reason. Adding to that list is a review
// decision, visible in the diff. Anything else is a hard failure.
// ─────────────────────────────────────────────────────────────────────────────

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';

const FAIL_ON = new Set(['high', 'critical']);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `npm audit` exits non-zero when it finds anything, so a non-zero exit is not
 * an error here — only unparseable output is.
 */
function runAudit() {
  return new Promise((resolve, reject) => {
    execFile(
      'npm',
      ['audit', '--json'],
      { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        if (!stdout) return reject(error ?? new Error('npm audit produced no output'));
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error('Could not parse npm audit output'));
        }
      }
    );
  });
}

/** Advisory titles for one package, deduped — `via` mixes strings and objects. */
function advisoriesFor(vuln) {
  return [...new Set((vuln.via ?? []).filter((v) => typeof v === 'object').map((v) => v.title))];
}

const [report, allowlistRaw] = await Promise.all([
  runAudit(),
  readFile(join(repoRoot, 'audit-allowlist.json'), 'utf8'),
]);

const allowed = JSON.parse(allowlistRaw).packages ?? {};
const vulnerabilities = Object.values(report.vulnerabilities ?? {});

const blocking = [];
const accepted = [];

for (const vuln of vulnerabilities) {
  if (!FAIL_ON.has(vuln.severity)) continue;
  (allowed[vuln.name] ? accepted : blocking).push(vuln);
}

if (accepted.length > 0) {
  console.log(`Accepted (see audit-allowlist.json) — ${accepted.length} package(s):`);
  for (const vuln of accepted) {
    console.log(`  · ${vuln.name} [${vuln.severity}] → ${allowed[vuln.name].acceptedUntilUpgrade}`);
  }
  console.log('');
}

if (blocking.length === 0) {
  console.log('✔ No unreviewed high or critical advisories.');
  process.exit(0);
}

console.error(`✖ ${blocking.length} unreviewed high/critical advisor${
  blocking.length === 1 ? 'y' : 'ies'
}:\n`);

for (const vuln of blocking) {
  const fix = vuln.fixAvailable;
  const fixText =
    fix === true
      ? 'run `npm audit fix`'
      : fix
        ? `upgrade to ${fix.name}@${fix.version}${fix.isSemVerMajor ? ' (major)' : ''}`
        : 'no fix published yet';

  console.error(`  ${vuln.name} [${vuln.severity}] — ${fixText}`);
  for (const title of advisoriesFor(vuln)) console.error(`      ${title}`);
}

console.error(
  '\nFix these, or — if the only fix is a major upgrade that needs planning —' +
    '\nadd the package to audit-allowlist.json with a reason and re-run.'
);
process.exit(1);
