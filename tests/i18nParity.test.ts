// ─────────────────────────────────────────────────────────────────────────────
// lib/i18n.tsx already enforces full English/Khmer key parity at compile time:
// `const completeKhmerCoverage: Record<keyof typeof dicts.en, string> = dicts.km`
// near the bottom of that file fails `npm run typecheck` the moment any `en`
// key lacks a `km` counterpart. `dicts` itself is not exported (LangProvider's
// internal state), so the smallest runtime check that does not require
// changing lib/i18n.tsx's public surface is the one this suite runs: read the
// source directly (the same technique tests/guideCatalogue.test.ts already
// uses for a cross-file contract) and confirm the two keys Phase 11 added
// exist, non-empty, on both sides of the `en: { ... }` / `km: { ... }` split.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PHASE_11_KEYS = ['place.openInMaps', 'saved.emptyCta'];

function splitDicts(source: string): { en: string; km: string } {
  const enStart = source.indexOf('  en: {');
  const kmStart = source.indexOf('\n  km: {');
  const kmEnd = source.indexOf('\nexport const LANG_COOKIE');
  if (enStart === -1 || kmStart === -1 || kmEnd === -1) {
    throw new Error('Could not locate the en/km dictionary boundaries in lib/i18n.tsx');
  }
  return {
    en: source.slice(enStart, kmStart),
    km: source.slice(kmStart, kmEnd),
  };
}

describe('i18n en/km parity for Phase 11 keys', () => {
  const source = readFileSync('lib/i18n.tsx', 'utf8');
  const { en, km } = splitDicts(source);

  it.each(PHASE_11_KEYS)('%s is defined with a non-empty value in the en dictionary', (key) => {
    const match = new RegExp(`'${key}':\\s*'([^']+)'`).exec(en);
    expect(match?.[1]?.trim()).toBeTruthy();
  });

  it.each(PHASE_11_KEYS)('%s is defined with a non-empty value in the km dictionary', (key) => {
    const match = new RegExp(`'${key}':\\s*'([^']+)'`).exec(km);
    expect(match?.[1]?.trim()).toBeTruthy();
  });
});
