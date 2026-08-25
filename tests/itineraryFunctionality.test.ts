import { describe, expect, it } from 'vitest';
import {
  placeDetailHref,
  scheduleWarnings,
  type CuratedPlace,
  type ItineraryPlace,
  type RouteLeg,
} from '@/lib/travel/itinerary';
import { buildSmartDraft, type DraftPlace } from '@/lib/travel/smartDraft';

function curated(overrides: Partial<CuratedPlace> = {}): CuratedPlace {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Museum', category: 'spot', lat: 23.1, lng: 113.2,
    description: '', photo_url: null, source: 'editorial', created_by: null,
    canonical_place_id: null,
    ...overrides,
  };
}

function stop(id: string, start: string, end: string, place = curated()): ItineraryPlace {
  return { id, place_id: place.id, category: place.category, time_start: start, time_end: end, notes: null, sort_order: 0, place };
}

describe('placeDetailHref', () => {
  it('links to the canonical place when one is attached', () => {
    const place = curated({ canonical_place_id: '30000000-0000-4000-8000-000000000001' });
    expect(placeDetailHref(place)).toBe('/place/30000000-0000-4000-8000-000000000001');
  });

  it('is null when the catalogue row never resolved to a canonical place', () => {
    expect(placeDetailHref(curated({ canonical_place_id: null }))).toBeNull();
  });
});

describe('scheduleWarnings', () => {
  it('detects overlaps and insufficient routed transfer time', () => {
    const first = stop('10000000-0000-4000-8000-000000000010', '09:00', '10:00');
    const second = stop('10000000-0000-4000-8000-000000000011', '09:45', '11:00', curated({ name: 'Garden' }));
    expect(scheduleWarnings([first, second], '2026-08-17').map((item) => item.kind)).toContain('overlap');

    second.time_start = '10:10';
    const leg: RouteLeg = { fromPlaceId: first.id, toPlaceId: second.id, distanceMeters: 5000, durationSeconds: 1200 };
    expect(scheduleWarnings([first, second], '2026-08-17', [leg]).map((item) => item.kind)).toContain('transfer');
  });

  it('checks a visit against factual weekday opening windows', () => {
    const place = curated({ opening_hours: { mon: [{ open: '09:00', close: '17:00' }] } });
    const warnings = scheduleWarnings([stop('10000000-0000-4000-8000-000000000012', '17:30', '18:00', place)], '2026-08-17');
    expect(warnings.map((item) => item.kind)).toEqual(['closed']);
  });
});

describe('buildSmartDraft', () => {
  const place = (id: number, name: string, lat: number, lng: number, category: DraftPlace['category'] = 'spot'): DraftPlace => ({
    id: `10000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    name, lat, lng, category, created_by: null,
  });

  it('prioritises a saved hotel and keeps distant China cities on separate days', () => {
    const places = [
      place(1, 'Guangzhou hotel', 23.12, 113.36, 'stay'),
      place(2, 'Canton Tower', 23.10, 113.32),
      place(3, 'Shamian Island', 23.10, 113.24),
      place(4, 'Forbidden City', 39.91, 116.39),
      place(5, 'Temple of Heaven', 39.88, 116.40),
      place(6, 'Wangfujing', 39.91, 116.41, 'shopping'),
    ];
    const days = buildSmartDraft(places, [places[0].id], 2, {
      pace: 'relaxed', interests: ['spot', 'shopping'], startTime: '09:00', includeSaved: true,
    });
    expect(days).toHaveLength(2);
    expect(days[0][0].place.name).toBe('Guangzhou hotel');
    expect(days[0].every((item) => item.place.lat < 30)).toBe(true);
    expect(days[1].every((item) => item.place.lat > 30)).toBe(true);
  });
});
