// ─────────────────────────────────────────────────────────────────────────────
// The reuse key.
//
// THE PROPERTY UNDER TEST: two people who share the same post must produce the
// same hash, and two different posts must not. Everything the importer saves on
// repeat imports rests on that, and it is a pure function, so it is cheap to
// pin precisely.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { hashNormalized, importKeyFor, normalizeForHash } from '@/lib/travel/urlHash';

describe('normalizeForHash', () => {
  it('agrees across the ways one TikTok link gets shared', () => {
    const forms = [
      'https://www.tiktok.com/@chef/video/7311122233344455566',
      'https://tiktok.com/@chef/video/7311122233344455566',
      'https://m.tiktok.com/@chef/video/7311122233344455566/',
      'https://www.tiktok.com/@chef/video/7311122233344455566?is_from_webapp=1&_t=8abc',
      'https://www.TikTok.com/@chef/video/7311122233344455566#anchor',
    ];

    const hashes = new Set(forms.map((form) => normalizeForHash(form)));
    expect(hashes.size).toBe(1);
  });

  it('does not collapse two different posts', () => {
    expect(normalizeForHash('https://www.tiktok.com/@chef/video/111')).not.toBe(
      normalizeForHash('https://www.tiktok.com/@chef/video/222')
    );
  });

  it('ignores query parameter order but not query parameter meaning', () => {
    const a = normalizeForHash('https://example.com/post?b=2&a=1');
    const b = normalizeForHash('https://example.com/post?a=1&b=2');
    const c = normalizeForHash('https://example.com/post?a=9&b=2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('finds the link inside a share blob, the way Google Maps hands it over', () => {
    const blob = 'Wat Pho\nhttps://maps.app.goo.gl/abc123';
    expect(normalizeForHash(blob)).toBe(normalizeForHash('https://maps.app.goo.gl/abc123'));
  });

  it('returns null for text with no link in it', () => {
    // A caption paste has no stable identity, so it is recorded without a hash
    // and never replayed. Null is the answer, not an empty string.
    expect(normalizeForHash('📍 Wat Pho — go before 9am')).toBeNull();
    expect(importKeyFor('just some words')).toBeNull();
  });
});

describe('hashNormalized', () => {
  it('is stable, hex, and 64 characters', () => {
    const hash = hashNormalized('tiktok.com/@chef/video/111');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashNormalized('tiktok.com/@chef/video/111')).toBe(hash);
  });

  it('keys the normalized form, so importKeyFor carries both halves', () => {
    const key = importKeyFor('https://www.tiktok.com/@chef/video/111?_t=x');
    expect(key).not.toBeNull();
    expect(key!.urlHash).toBe(hashNormalized(key!.normalizedUrl));
    // Stored alongside the hash so a collision or a bug is debuggable.
    expect(key!.normalizedUrl).toContain('tiktok.com');
    expect(key!.normalizedUrl).not.toContain('_t=');
  });
});
