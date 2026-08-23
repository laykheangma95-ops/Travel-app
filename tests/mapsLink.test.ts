import { describe, expect, it } from 'vitest';
import { firstUrlIn, parseGoogleMapsUrl } from '@/lib/travel/mapsLink';

describe('parseGoogleMapsUrl', () => {
  it('parses the @lat,lng,zoom segment', () => {
    const result = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z/data=!3m1!4b1'
    );
    expect(result).not.toBeNull();
    expect(result?.lat).toBeCloseTo(13.7465);
    expect(result?.lng).toBeCloseTo(100.4927);
    expect(result?.name).toBe('Wat Pho');
  });

  it('prefers the !3d!4d pin over the @ map-center segment when both are present', () => {
    const result = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Angkor+Wat/@13.4125,103.8670,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d13.4124693!4d103.8669857'
    );
    expect(result).not.toBeNull();
    expect(result?.lat).toBeCloseTo(13.4124693);
    expect(result?.lng).toBeCloseTo(103.8669857);
    expect(result?.name).toBe('Angkor Wat');
  });

  it('parses a bare !3d!4d pattern with no @ segment', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps?q=!3d16.6667!4d104.5000');
    expect(result).not.toBeNull();
    expect(result?.lat).toBeCloseTo(16.6667);
    expect(result?.lng).toBeCloseTo(104.5);
  });

  it('parses a q=lat,lng query param', () => {
    const result = parseGoogleMapsUrl('https://maps.google.com/maps?q=11.5564,104.9282');
    expect(result).not.toBeNull();
    expect(result?.lat).toBeCloseTo(11.5564);
    expect(result?.lng).toBeCloseTo(104.9282);
    expect(result?.name).toBeNull();
  });

  it('decodes dashes and plusses in the /place/ name segment', () => {
    const result = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Phnom-Penh+Night+Market/@11.5691,104.9211,16z'
    );
    expect(result?.name).toBe('Phnom Penh Night Market');
  });

  it('returns null for a URL with no coordinate pattern', () => {
    expect(parseGoogleMapsUrl('https://maps.app.goo.gl/xxxx')).toBeNull();
  });

  it('returns null for a completely unrelated URL', () => {
    expect(parseGoogleMapsUrl('https://example.com/not-maps-at-all')).toBeNull();
  });

  it('returns null, never throws, for malformed input', () => {
    expect(() => parseGoogleMapsUrl('not a url')).not.toThrow();
    expect(parseGoogleMapsUrl('not a url')).toBeNull();
    expect(() => parseGoogleMapsUrl('')).not.toThrow();
    expect(parseGoogleMapsUrl('')).toBeNull();
    expect(() => parseGoogleMapsUrl('   ')).not.toThrow();
    expect(parseGoogleMapsUrl('   ')).toBeNull();
  });

  it('returns null for out-of-range coordinates rather than a garbage value', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/@999,999,17z')).toBeNull();
  });

  it('returns null for malformed percent-encoding in the place name without throwing', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/place/%E0%A4/@13.0,100.0,17z');
    expect(result).not.toBeNull();
    expect(result?.lat).toBeCloseTo(13.0);
    expect(result?.name).toBeNull();
  });
});

// What the OS share sheet actually hands the /share/maps-link route.
describe('firstUrlIn', () => {
  it('pulls the link out of the text blob Google Maps shares', () => {
    // The real shape: a place name, a newline, then the short link.
    const shared = 'Wat Pho\nhttps://maps.app.goo.gl/BxT7q2mNc4vK1qEo8';
    expect(firstUrlIn(shared)).toBe('https://maps.app.goo.gl/BxT7q2mNc4vK1qEo8');
  });

  it('takes the first link when the blob carries more than one', () => {
    expect(firstUrlIn('see https://maps.app.goo.gl/aaa and https://example.com/bbb')).toBe(
      'https://maps.app.goo.gl/aaa'
    );
  });

  it('stops at whitespace rather than swallowing trailing words', () => {
    expect(firstUrlIn('https://maps.app.goo.gl/aaa shared via Maps')).toBe(
      'https://maps.app.goo.gl/aaa'
    );
  });

  it('handles a bare link with no surrounding text', () => {
    expect(firstUrlIn('https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z')).toBe(
      'https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z'
    );
  });

  it('returns null when the shared text carries no link at all', () => {
    expect(firstUrlIn('Wat Pho')).toBeNull();
    expect(firstUrlIn('')).toBeNull();
  });

  it('feeds the parser end to end, the way the share route does', () => {
    const shared = 'Angkor Wat\nhttps://www.google.com/maps/place/Angkor+Wat/@13.4125,103.8670,15z';
    const link = firstUrlIn(shared);
    expect(link).not.toBeNull();
    const parsed = parseGoogleMapsUrl(link as string);
    expect(parsed?.name).toBe('Angkor Wat');
    expect(parsed?.lat).toBeCloseTo(13.4125);
  });
});
