// The SSRF gate on the link importer, and the model-output parser.
//
// The gate is the whole defence on an endpoint that turns a user's string into
// an outbound connection from our server. Every one of these cases is a way in
// that a suffix match or a "validate the first URL only" check would have let
// through.

import { describe, expect, it } from 'vitest';
import { allowedPreviewUrl, metaContent } from '@/lib/travel/linkPreview';
import { parseModelJson } from '@/lib/travel/placeAgent';

describe('allowedPreviewUrl', () => {
  it('accepts the hosts the importer actually needs', () => {
    for (const url of [
      'https://www.tiktok.com/oembed?url=x',
      'https://vt.tiktok.com/ZSdabc/',
      'https://www.instagram.com/reel/abc/',
      'https://www.facebook.com/reel/1234',
      'https://www.youtube.com/watch?v=abc',
      'https://youtu.be/abc',
    ]) {
      expect(allowedPreviewUrl(url), url).not.toBeNull();
    }
  });

  it('refuses a host that merely ends with an allowed one', () => {
    // The reason the allowlist is an exact-match Set and not `.endsWith()`.
    expect(allowedPreviewUrl('https://nottiktok.com/x')).toBeNull();
    expect(allowedPreviewUrl('https://tiktok.com.evil.tld/x')).toBeNull();
    expect(allowedPreviewUrl('https://eviltiktok.com/x')).toBeNull();
  });

  it('refuses the addresses an SSRF is actually aimed at', () => {
    expect(allowedPreviewUrl('http://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(allowedPreviewUrl('http://localhost:3000/admin')).toBeNull();
    expect(allowedPreviewUrl('http://127.0.0.1/')).toBeNull();
    expect(allowedPreviewUrl('https://10.0.0.5/internal')).toBeNull();
  });

  it('refuses credentials in the URL', () => {
    // `https://www.tiktok.com@evil.example/` parses with hostname evil.example,
    // so the allowlist already stops it — but a URL we are about to fetch has
    // no legitimate use for credentials either way.
    expect(allowedPreviewUrl('https://user:pass@www.tiktok.com/x')).toBeNull();
    expect(allowedPreviewUrl('https://www.tiktok.com@evil.example/')).toBeNull();
  });

  it('refuses a non-443 port on an allowed host', () => {
    // Not something these hosts serve; it is someone reaching for a service
    // pinned behind that name.
    expect(allowedPreviewUrl('https://www.tiktok.com:8080/x')).toBeNull();
  });

  it('refuses non-https schemes, including the ones that are not network at all', () => {
    expect(allowedPreviewUrl('http://www.tiktok.com/x')).toBeNull();
    expect(allowedPreviewUrl('file:///etc/passwd')).toBeNull();
    expect(allowedPreviewUrl('javascript:alert(1)')).toBeNull();
    expect(allowedPreviewUrl('data:text/html,<script>')).toBeNull();
  });

  it('returns null rather than throwing on junk', () => {
    expect(allowedPreviewUrl('')).toBeNull();
    expect(allowedPreviewUrl('not a url')).toBeNull();
  });
});

describe('metaContent', () => {
  const head = `<html><head>
    <meta property="og:title" content="Bangkok in 2 days" />
    <meta property="og:description" content="&#128205; Wat Pho &amp; Jodd Fairs — go early" />
    <meta name="twitter:image" content="https://cdn.example.com/a.jpg">
  </head><body>irrelevant</body></html>`;

  it('reads og and twitter tags, in the order asked for', () => {
    expect(metaContent(head, ['og:title'])).toBe('Bangkok in 2 days');
    expect(metaContent(head, ['og:image', 'twitter:image'])).toBe('https://cdn.example.com/a.jpg');
  });

  it('decodes the entities that actually appear in captions', () => {
    expect(metaContent(head, ['og:description'])).toBe('📍 Wat Pho & Jodd Fairs — go early');
  });

  it('returns null when the tag is absent or empty', () => {
    expect(metaContent(head, ['og:video'])).toBeNull();
    expect(metaContent('<html><head></head></html>', ['og:title'])).toBeNull();
  });
});

describe('parseModelJson', () => {
  it('reads a clean answer', () => {
    const places = parseModelJson('{"places":[{"name":"Wat Pho","confidence":0.9}]}');
    expect(places).toHaveLength(1);
    expect(places?.[0].name).toBe('Wat Pho');
  });

  it('tolerates the two things models do to JSON anyway', () => {
    expect(parseModelJson('```json\n{"places":[{"name":"A"}]}\n```')).toHaveLength(1);
    expect(parseModelJson('Here you go:\n{"places":[{"name":"A"}]}')).toHaveLength(1);
  });

  it('reads an empty list as an answer, not a failure', () => {
    // null and [] mean different things to the caller: null falls back to the
    // deterministic extractor, [] is the model saying there is nothing here.
    expect(parseModelJson('{"places":[]}')).toEqual([]);
  });

  it('returns null for anything unparseable, and never throws', () => {
    expect(parseModelJson('I could not find any places.')).toBeNull();
    expect(parseModelJson('{"places": "not an array"}')).toBeNull();
    expect(parseModelJson('{broken')).toBeNull();
    expect(parseModelJson('')).toBeNull();
  });

  it('drops non-object entries rather than passing them on', () => {
    const places = parseModelJson('{"places":[{"name":"A"},null,"B",42]}');
    expect(places).toHaveLength(1);
  });
});
