// Reading places out of a caption, and — more importantly — refusing to.
//
// The failure mode this suite exists to prevent is an importer that files eight
// fragments of somebody's caption onto a traveler's map. So roughly half of
// these assert that something is NOT extracted.

import { describe, expect, it } from 'vitest';
import {
  AUTO_SELECT_CONFIDENCE,
  dedupeCandidates,
  extractFromCaption,
  guessDestination,
  inferCategory,
  MAX_CANDIDATES,
  normaliseCandidate,
  type PlaceCandidate,
} from '@/lib/travel/placeExtraction';

describe('extractFromCaption', () => {
  it('reads a pinned list, with the note beside each place', () => {
    const found = extractFromCaption(
      [
        'Bangkok in 2 days 🇹🇭',
        '📍 Wat Pho — get there before 9am',
        '📍 Jodd Fairs Rama 9 — volcano pork ribs',
        '📍 ICONSIAM',
        '#bangkok #thailand',
      ].join('\n')
    );

    expect(found.map((place) => place.name)).toEqual([
      'Wat Pho',
      'Jodd Fairs Rama 9',
      'ICONSIAM',
    ]);
    expect(found[0].description).toBe('get there before 9am');
    // Pinned lines are confident enough to arrive pre-ticked; that is the whole
    // point of the threshold.
    expect(found[0].confidence).toBeGreaterThanOrEqual(AUTO_SELECT_CONFIDENCE);
  });

  it('reads a numbered list', () => {
    const found = extractFromCaption(
      ['Tokyo food guide', '1. Ichiran Shibuya', '2. Tsukiji Outer Market', '3) Afuri Ramen'].join('\n')
    );
    expect(found.map((place) => place.name)).toEqual([
      'Ichiran Shibuya',
      'Tsukiji Outer Market',
      'Afuri Ramen',
    ]);
  });

  it('resolves the country from the caption so the place can find a trip', () => {
    const [place] = extractFromCaption('Bangkok eats\n📍 Yaowarat Chinatown');
    expect(place.city).toBe('Bangkok');
    expect(place.country).toBe('Thailand');
  });

  it('does not treat prose as a list of places', () => {
    // A paragraph. Every one of these lines is a sentence, and an importer that
    // turned them into map pins would be worse than useless.
    const found = extractFromCaption(
      [
        'We landed late and everything was closed, so we just walked around.',
        'The next morning was much better and we finally got some proper food.',
        'Honestly one of the best trips we have ever taken, would go again.',
      ].join('\n')
    );
    expect(found).toEqual([]);
  });

  it('ignores hashtag and mention lines', () => {
    const found = extractFromCaption('#taipei #台北美食\n@some.creator\n📍 Din Tai Fung');
    expect(found.map((place) => place.name)).toEqual(['Din Tai Fung']);
  });

  it('returns nothing for an empty or junk caption, and never throws', () => {
    expect(extractFromCaption('')).toEqual([]);
    expect(extractFromCaption('   ')).toEqual([]);
    expect(extractFromCaption(null as unknown as string)).toEqual([]);
  });

  it('marks a bare list of short lines as low confidence, so it arrives un-ticked', () => {
    const found = extractFromCaption(['Wat Arun', 'Wat Pho', 'Grand Palace'].join('\n'));
    expect(found.length).toBe(3);
    for (const place of found) {
      expect(place.confidence).toBeLessThan(AUTO_SELECT_CONFIDENCE);
    }
  });
});

describe('inferCategory', () => {
  it('reads the obvious ones', () => {
    expect(inferCategory('Ichiran Ramen')).toBe('food');
    expect(inferCategory('Park Hyatt Hotel')).toBe('stay');
    expect(inferCategory('Chatuchak Weekend Market')).toBe('shopping');
    expect(inferCategory('Suvarnabhumi Airport')).toBe('transport');
    expect(inferCategory('Wat Pho temple')).toBe('spot');
  });

  it('says "other" rather than guessing', () => {
    // 'other' renders perfectly well in the itinerary. Defaulting everything to
    // 'spot' would put hotels under Attractions on the traveler's map legend.
    expect(inferCategory('Somewhere nice')).toBe('other');
  });
});

describe('guessDestination', () => {
  it('prefers the longest match, so a city is not shadowed by a fragment', () => {
    expect(guessDestination('3 days in Ho Chi Minh City')).toEqual({
      label: 'Ho Chi Minh City',
      country: 'Vietnam',
    });
  });

  it('respects word boundaries', () => {
    // "Bali" inside "balcony" is the classic false positive for a substring
    // search over a list this large.
    expect(guessDestination('we sat on the balcony all evening')).toBeNull();
  });

  it('returns null when nothing names a place', () => {
    expect(guessDestination('great food, would go again')).toBeNull();
    expect(guessDestination('')).toBeNull();
  });
});

describe('normaliseCandidate — the only door into the database', () => {
  it('rejects a hallucinated latitude instead of storing it', () => {
    const place = normaliseCandidate({ name: 'Somewhere', lat: 900, lng: 12 });
    expect(place?.lat).toBeNull();
    expect(place?.lng).toBeNull();
  });

  it('drops half a coordinate pair — a pin with one number is a pin in the sea', () => {
    const place = normaliseCandidate({ name: 'Somewhere', lat: 13.7, lng: null });
    expect(place?.lat).toBeNull();
  });

  it('refuses an invented country, falling back to the hint', () => {
    const place = normaliseCandidate(
      { name: 'Cafe', country: 'Wakanda' },
      { label: 'Bangkok', country: 'Thailand' }
    );
    expect(place?.country).toBe('Thailand');
  });

  it('rejects a nameless or one-character candidate', () => {
    expect(normaliseCandidate({ name: '' })).toBeNull();
    expect(normaliseCandidate({ name: '  🌸  ' })).toBeNull();
    expect(normaliseCandidate({ name: undefined })).toBeNull();
  });

  it('truncates rather than failing on an enormous name', () => {
    const place = normaliseCandidate({ name: 'x'.repeat(5_000) });
    expect(place?.name.length).toBe(120);
  });

  it('replaces an unknown category rather than trusting it', () => {
    const place = normaliseCandidate({
      name: 'Ichiran Ramen',
      category: 'brunch spot' as never,
    });
    expect(place?.category).toBe('food');
  });

  it('clamps confidence into range', () => {
    expect(normaliseCandidate({ name: 'A place', confidence: 12 })?.confidence).toBe(1);
    expect(normaliseCandidate({ name: 'A place', confidence: -4 })?.confidence).toBe(0);
  });
});

describe('dedupeCandidates', () => {
  const base = (over: Partial<PlaceCandidate>): PlaceCandidate => ({
    name: 'Wat Pho',
    description: '',
    category: 'other',
    city: null,
    country: null,
    lat: null,
    lng: null,
    confidence: 0.5,
    source: 'caption',
    geocodeResultCount: null,
    geocodeCountryMismatch: null,
    ...over,
  });

  it('merges two halves of the same place into one complete one', () => {
    const merged = dedupeCandidates([
      base({ confidence: 0.9, lat: 13.7465, lng: 100.4927 }),
      base({ name: 'wat pho.', confidence: 0.4, description: 'reclining Buddha', category: 'spot' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].lat).toBe(13.7465);
    expect(merged[0].description).toBe('reclining Buddha');
    expect(merged[0].category).toBe('spot');
  });

  it('orders by confidence and caps the list', () => {
    const many = Array.from({ length: MAX_CANDIDATES + 10 }, (_, index) =>
      base({ name: `Place ${index}`, confidence: index / 100 })
    );
    const result = dedupeCandidates(many);
    expect(result).toHaveLength(MAX_CANDIDATES);
    expect(result[0].confidence).toBeGreaterThan(result[result.length - 1].confidence);
  });
});
