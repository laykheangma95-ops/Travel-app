// ─────────────────────────────────────────────────────────────────────────────
// The intake's URL gate, attacked.
//
// Every case here is a string somebody would send deliberately. The module is
// pure, so all of it runs without a network — which is the point: an SSRF test
// that needs a socket is a test nobody runs.
//
// WHAT THIS SUITE DOES NOT CLAIM. This is intake validation, not the SSRF
// boundary. DNS rebinding and redirect chains are invisible to a string check
// and are defended at fetch time by the exact-match allowlists in
// lib/travel/linkPreview.ts and lib/travel/mapsResolve.ts. The last block below
// asserts those allowlists have not been widened, because the likeliest way
// Phase 3 could cause an incident is by someone deciding that classifying RED
// means fetching it.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { ipv4FromHostname, MAX_URL_LENGTH, parseSafeUrl } from '@/lib/travel/urlSafety';
import { allowedPreviewUrl } from '@/lib/travel/linkPreview';
import { allowedMapsUrl } from '@/lib/travel/mapsResolve';

const refused = (url: string) => {
  const verdict = parseSafeUrl(url);
  return verdict.ok ? `ACCEPTED (${url})` : verdict.code;
};

describe('the links a traveler actually pastes', () => {
  it('accepts the real ones', () => {
    const accepted = [
      'https://www.tiktok.com/@chef/video/7311122233344455566',
      'https://www.instagram.com/reel/CxYzAbCdEfG/',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.xiaohongshu.com/explore/64f0a1b2c3d4e5',
      'https://xhslink.com/aBcDeF',
      'https://www.facebook.com/watch/?v=123456789',
      'https://maps.app.goo.gl/abc123',
      'https://www.lonelyplanet.com/thailand/bangkok',
      'http://example.com/post',
    ];
    for (const url of accepted) {
      expect({ url, verdict: parseSafeUrl(url).ok }).toEqual({ url, verdict: true });
    }
  });
});

describe('protocols', () => {
  it('refuses everything that is not http or https', () => {
    expect(refused('javascript:alert(1)')).toBe('unsupported-protocol');
    expect(refused('data:text/html,<script>alert(1)</script>')).toBe('unsupported-protocol');
    expect(refused('file:///etc/passwd')).toBe('unsupported-protocol');
    expect(refused('ftp://example.com/x')).toBe('unsupported-protocol');
    expect(refused('gopher://example.com/')).toBe('unsupported-protocol');
    // A scheme nobody has invented yet is refused for the same reason: the
    // gate names the two it accepts rather than the ones it does not.
    expect(refused('futurescheme://example.com/')).toBe('unsupported-protocol');
  });

  it('is not fooled by case or leading whitespace', () => {
    expect(refused('  JavaScript:alert(1)')).toBe('unsupported-protocol');
    expect(parseSafeUrl('  https://example.com/x  ').ok).toBe(true);
  });
});

describe('malformed input', () => {
  it('refuses what is not a URL at all', () => {
    expect(refused('')).toBe('empty');
    expect(refused('   ')).toBe('empty');
    expect(refused('not a url')).toBe('malformed');
    expect(refused('example.com/post')).toBe('malformed'); // no scheme
    expect(refused('https://')).toBe('malformed');
    expect(refused('http://')).toBe('malformed');
  });

  it('refuses a URL longer than a person would paste', () => {
    expect(refused(`https://example.com/${'a'.repeat(MAX_URL_LENGTH)}`)).toBe('too-long');
  });
});

describe('credentials and ports', () => {
  it('refuses credentials in the URL', () => {
    // `https://trusted.com@evil.test/` is the classic — the part before the @
    // is a username, and the host is evil.test.
    expect(refused('https://user:pass@example.com/')).toBe('credentials-in-url');
    expect(refused('https://www.tiktok.com@evil.test/')).toBe('credentials-in-url');
  });

  it('refuses a port that is not a web port', () => {
    expect(refused('http://example.com:6379/')).toBe('blocked-port');
    expect(refused('http://example.com:22/')).toBe('blocked-port');
    expect(refused('http://example.com:8080/')).toBe('blocked-port');
    expect(parseSafeUrl('http://example.com:80/').ok).toBe(true);
    expect(parseSafeUrl('https://example.com:443/').ok).toBe(true);
  });
});

describe('loopback, private and metadata addresses', () => {
  it('refuses the obvious spellings', () => {
    for (const url of [
      'http://localhost/',
      'http://localhost:80/admin',
      'http://LOCALHOST/',
      'http://127.0.0.1/',
      'http://127.1.2.3/',
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/', // the metadata service
      'http://0.0.0.0/',
      'http://100.64.0.1/', // CGNAT
      'http://224.0.0.1/', // multicast
    ]) {
      expect({ url, code: refused(url) }).toEqual({ url, code: 'private-host' });
    }
  });

  it('refuses the encoded spellings of loopback', () => {
    // Every one of these reaches 127.0.0.1, and none contains "127.0.0.1".
    for (const url of [
      'http://2130706433/', // decimal
      'http://0x7f000001/', // hex
      'http://017700000001/', // octal
      'http://127.1/', // short form
      'http://0x7f.0.0.1/', // mixed hex octet
      'http://0177.0.0.1/', // mixed octal octet
    ]) {
      expect({ url, code: refused(url) }).toEqual({ url, code: 'private-host' });
    }
  });

  it('refuses the encoded spellings of the metadata service', () => {
    // 169.254.169.254 as one decimal integer, which is how it is usually
    // smuggled past a naive string check.
    expect(refused('http://2852039166/')).toBe('private-host');
    expect(refused('http://0xa9fea9fe/')).toBe('private-host');
  });

  it('refuses private and loopback IPv6', () => {
    for (const url of [
      'http://[::1]/',
      'http://[::]/',
      'http://[fc00::1]/',
      'http://[fd12:3456::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:127.0.0.1]/', // IPv4-mapped loopback
      'http://[::ffff:10.0.0.1]/', // IPv4-mapped RFC1918
      'http://[::ffff:7f00:1]/', // the same, in hex groups
    ]) {
      expect({ url, code: refused(url) }).toEqual({ url, code: 'private-host' });
    }
  });

  it('refuses internal-looking names', () => {
    expect(refused('http://intranet/')).toBe('private-host');
    expect(refused('http://wiki.internal/')).toBe('private-host');
    expect(refused('http://printer.local/')).toBe('private-host');
    expect(refused('http://app.lan/')).toBe('private-host');
    expect(refused('http://evil.localhost/')).toBe('private-host');
  });

  it('still accepts ordinary public addresses', () => {
    // The guard must not be so broad that it refuses the internet.
    expect(parseSafeUrl('http://8.8.8.8/').ok).toBe(true);
    expect(parseSafeUrl('http://93.184.216.34/').ok).toBe(true);
    expect(parseSafeUrl('http://[2606:2800:220:1:248:1893:25c8:1946]/').ok).toBe(true);
  });
});

describe('ipv4FromHostname', () => {
  it('reads every form inet_aton would', () => {
    const loopback = 0x7f000001;
    expect(ipv4FromHostname('127.0.0.1')).toBe(loopback);
    expect(ipv4FromHostname('2130706433')).toBe(loopback);
    expect(ipv4FromHostname('0x7f000001')).toBe(loopback);
    expect(ipv4FromHostname('127.1')).toBe(loopback);
    expect(ipv4FromHostname('127.0.1')).toBe(loopback);
  });

  it('returns null for things that are not addresses', () => {
    expect(ipv4FromHostname('example.com')).toBeNull();
    expect(ipv4FromHostname('999.1.1.1')).toBeNull();
    expect(ipv4FromHostname('1.2.3.4.5')).toBeNull();
    expect(ipv4FromHostname('')).toBeNull();
  });
});

describe('the outbound allowlists are not widened by Phase 3', () => {
  it('still refuses Xiaohongshu, which the classifier now recognises', () => {
    // THE POINT OF THIS TEST. Phase 3 teaches Domner to NAME a RED link. It
    // must not teach it to FETCH one: RED publishes no oEmbed endpoint, we do
    // not scrape, and no connector exists. Recognising a host and being willing
    // to open a socket to it are separate decisions.
    expect(allowedPreviewUrl('https://www.xiaohongshu.com/explore/abc')).toBeNull();
    expect(allowedPreviewUrl('https://xhslink.com/abc')).toBeNull();
    expect(allowedMapsUrl('https://www.xiaohongshu.com/explore/abc')).toBeNull();
  });

  it('still refuses everything else it refused before', () => {
    expect(allowedPreviewUrl('http://127.0.0.1/')).toBeNull();
    expect(allowedPreviewUrl('https://evil.test/')).toBeNull();
    expect(allowedPreviewUrl('https://www.tiktok.com@evil.test/')).toBeNull();
    expect(allowedPreviewUrl('https://tiktok.com.evil.test/')).toBeNull();
  });

  it('still accepts the hosts it accepted before', () => {
    expect(allowedPreviewUrl('https://www.tiktok.com/@chef/video/1')).not.toBeNull();
    expect(allowedMapsUrl('https://maps.app.goo.gl/abc')).not.toBeNull();
  });
});
