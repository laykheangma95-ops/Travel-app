// ─────────────────────────────────────────────────────────────────────────────
// The connector output boundary, attacked.
//
// A ConnectorExtraction is untrusted input — see lib/travel/connectorBoundary.ts
// header. Every case here is a shape a misbehaving or compromised connector
// could hand back; the boundary must turn it into something small and honest
// rather than pass it through.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { sanitizeConnectorResult } from '@/lib/travel/connectorBoundary';
import type { ConnectorExtraction } from '@/lib/connectors/places/types';

function base(overrides: Partial<ConnectorExtraction> = {}): ConnectorExtraction {
  return {
    connectorId: 'link-preview',
    platform: 'tiktok',
    sourceUrl: 'https://www.tiktok.com/@chef/video/1',
    externalId: null,
    title: 'A trip to Bangkok',
    captionText: '📍 Wat Pho\n📍 Chatuchak Market',
    candidateNames: [],
    locationHint: { city: null, country: null },
    coordinates: null,
    media: { thumbnailUrl: 'https://p16.tiktokcdn.com/thumb.jpg' },
    confidence: 0.5,
    connectorMetadata: {},
    extractedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('the honest cases', () => {
  it('passes a well-formed extraction through unchanged in substance', () => {
    const out = sanitizeConnectorResult(base());
    expect(out.title).toBe('A trip to Bangkok');
    expect(out.captionText).toContain('Wat Pho');
    expect(out.thumbnailUrl).toBe('https://p16.tiktokcdn.com/thumb.jpg');
    expect(out.confidence).toBe(0.5);
  });
});

describe('oversized fields', () => {
  it('caps a caption rather than storing a novel', () => {
    const out = sanitizeConnectorResult(base({ captionText: 'x'.repeat(50_000) }));
    expect(out.captionText?.length).toBeLessThanOrEqual(6_000);
  });

  it('caps a title', () => {
    const out = sanitizeConnectorResult(base({ title: 'x'.repeat(10_000) }));
    expect(out.title?.length).toBeLessThanOrEqual(300);
  });

  it('caps the number and length of candidate names', () => {
    const many = Array.from({ length: 200 }, (_, i) => `Place ${i} ${'y'.repeat(500)}`);
    const out = sanitizeConnectorResult(base({ candidateNames: many }));
    expect(out.candidateNames.length).toBeLessThanOrEqual(25);
    for (const name of out.candidateNames) expect(name.length).toBeLessThanOrEqual(200);
  });

  it('drops a one-character candidate name as noise, not a place', () => {
    const out = sanitizeConnectorResult(base({ candidateNames: ['a', 'Wat Pho'] }));
    expect(out.candidateNames).toEqual(['Wat Pho']);
  });
});

describe('coordinates', () => {
  it('accepts a real pair', () => {
    const out = sanitizeConnectorResult(base({ coordinates: { lat: 13.7563, lng: 100.5018 } }));
    expect(out.coordinates).toEqual({ lat: 13.7563, lng: 100.5018 });
  });

  it('refuses a latitude or longitude outside the physical range', () => {
    expect(sanitizeConnectorResult(base({ coordinates: { lat: 900, lng: 0 } })).coordinates).toBeNull();
    expect(sanitizeConnectorResult(base({ coordinates: { lat: 0, lng: -200 } })).coordinates).toBeNull();
  });

  it('refuses NaN and non-finite values a hostile or buggy connector might send', () => {
    expect(
      sanitizeConnectorResult(base({ coordinates: { lat: Number.NaN, lng: 0 } })).coordinates
    ).toBeNull();
    expect(
      sanitizeConnectorResult(base({ coordinates: { lat: Number.POSITIVE_INFINITY, lng: 0 } })).coordinates
    ).toBeNull();
  });
});

describe('confidence', () => {
  it('clamps to [0,1]', () => {
    expect(sanitizeConnectorResult(base({ confidence: 5 })).confidence).toBe(1);
    expect(sanitizeConnectorResult(base({ confidence: -5 })).confidence).toBe(0);
  });

  it('treats a non-numeric confidence as zero rather than throwing', () => {
    expect(sanitizeConnectorResult(base({ confidence: 'high' as unknown as number })).confidence).toBe(0);
  });
});

describe('the thumbnail URL', () => {
  it('refuses anything that is not https', () => {
    expect(sanitizeConnectorResult(base({ media: { thumbnailUrl: 'http://evil.test/x.jpg' } })).thumbnailUrl).toBeNull();
    expect(
      sanitizeConnectorResult(base({ media: { thumbnailUrl: 'javascript:alert(1)' } })).thumbnailUrl
    ).toBeNull();
    expect(
      sanitizeConnectorResult(base({ media: { thumbnailUrl: 'data:text/html,<script>1</script>' } }))
        .thumbnailUrl
    ).toBeNull();
  });

  it('refuses a URL a browser would choke on', () => {
    expect(sanitizeConnectorResult(base({ media: { thumbnailUrl: `https://x.test/${'a'.repeat(3000)}` } })).thumbnailUrl).toBeNull();
  });
});

describe('connector metadata — the vendor-payload smuggling case', () => {
  it('keeps a small bag of primitives', () => {
    const out = sanitizeConnectorResult(base({ connectorMetadata: { oembed: true, hops: 2, note: 'ok' } }));
    expect(out.connectorMetadata).toEqual({ oembed: true, hops: 2, note: 'ok' });
  });

  it('drops nested objects and arrays rather than storing them', () => {
    const out = sanitizeConnectorResult(
      base({
        connectorMetadata: {
          safe: 'kept',
          rawResponse: { headers: {}, body: 'x'.repeat(10_000) },
          list: [1, 2, 3],
        },
      })
    );
    expect(out.connectorMetadata).toEqual({ safe: 'kept' });
  });

  it('refuses a metadata bag that does not fit in the size cap', () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 20; i += 1) big[`k${i}`] = 'y'.repeat(300);
    const out = sanitizeConnectorResult(base({ connectorMetadata: big }));
    expect(out.connectorMetadata).toEqual({});
  });

  it('ignores a non-object metadata value entirely', () => {
    expect(sanitizeConnectorResult(base({ connectorMetadata: 'not an object' as unknown as Record<string, unknown> })).connectorMetadata).toEqual({});
  });
});

describe('malformed connector output does not throw', () => {
  it('survives every field being the wrong type', () => {
    const hostile = base({
      title: 12345 as unknown as string,
      captionText: { evil: true } as unknown as string,
      candidateNames: 'not an array' as unknown as string[],
      coordinates: 'nope' as unknown as ConnectorExtraction['coordinates'],
      extractedAt: 'not a date',
    });
    expect(() => sanitizeConnectorResult(hostile)).not.toThrow();
    const out = sanitizeConnectorResult(hostile);
    expect(out.title).toBeNull();
    expect(out.captionText).toBeNull();
    expect(out.candidateNames).toEqual([]);
    expect(out.coordinates).toBeNull();
    expect(out.extractedAt).toEqual(expect.any(String));
  });
});
