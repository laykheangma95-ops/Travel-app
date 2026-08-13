import { describe, expect, it } from 'vitest';
import {
  TRIP_NIGHTS_MAX,
  TRIP_TITLE_MAX,
  TRIP_TRAVELERS_MAX,
  emptyTripDraft,
  normalizeTripDraft,
  suggestTripTitle,
  validateTripDraft,
  type TripDraft,
} from '@/lib/travel/trips';

// These rules are enforced twice — inline by TripForm and again by the write
// routes — from this one module. Testing it here is what makes that safe: if a
// rule changes, both halves change together or this suite fails.

function draft(overrides: Partial<TripDraft> = {}): TripDraft {
  return {
    title: 'Japan trip',
    destination: 'Japan',
    startDate: '2026-09-14',
    endDate: '2026-09-21',
    travelers: 2,
    interests: ['food', 'culture'],
    ...overrides,
  };
}

function fields(input: TripDraft): string[] {
  return validateTripDraft(input).map((error) => error.field);
}

describe('validateTripDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateTripDraft(draft())).toEqual([]);
  });

  it('accepts a trip with no dates at all — that is a wish, not an error', () => {
    expect(validateTripDraft(draft({ startDate: null, endDate: null }))).toEqual([]);
  });

  it('accepts a single-day trip', () => {
    expect(validateTripDraft(draft({ startDate: '2026-09-14', endDate: '2026-09-14' }))).toEqual([]);
  });

  it('requires a title and a destination', () => {
    expect(fields(draft({ title: '   ', destination: '' }))).toEqual(['title', 'destination']);
  });

  it('reports every problem at once, not just the first', () => {
    // The form focuses the first field and marks the rest, so a traveler on a
    // phone is not made to discover their mistakes one submit at a time.
    expect(fields(draft({ title: '', destination: '', travelers: 0 })).length).toBe(3);
  });

  it('rejects a return date before departure', () => {
    expect(fields(draft({ startDate: '2026-09-21', endDate: '2026-09-14' }))).toEqual(['endDate']);
  });

  it('rejects a return date with no departure date', () => {
    expect(fields(draft({ startDate: null, endDate: '2026-09-21' }))).toEqual(['startDate']);
  });

  it('rejects a date that does not exist on the calendar', () => {
    // Date parsing rolls 2026-02-31 over into March rather than failing, so the
    // check has to compare the round-trip, not just that Date accepted it.
    expect(fields(draft({ startDate: '2026-02-31', endDate: null }))).toEqual(['startDate']);
  });

  it('rejects a malformed date string', () => {
    expect(fields(draft({ startDate: '14/09/2026', endDate: null }))).toEqual(['startDate']);
  });

  it(`rejects a trip longer than ${TRIP_NIGHTS_MAX} days`, () => {
    expect(fields(draft({ startDate: '2026-01-01', endDate: '2027-06-01' }))).toEqual(['endDate']);
  });

  it('bounds the traveller count at both ends', () => {
    expect(fields(draft({ travelers: 0 }))).toEqual(['travelers']);
    expect(fields(draft({ travelers: TRIP_TRAVELERS_MAX + 1 }))).toEqual(['travelers']);
    expect(fields(draft({ travelers: 1.5 }))).toEqual(['travelers']);
    expect(validateTripDraft(draft({ travelers: TRIP_TRAVELERS_MAX }))).toEqual([]);
  });

  it('caps the title length', () => {
    expect(fields(draft({ title: 'x'.repeat(TRIP_TITLE_MAX + 1) }))).toEqual(['title']);
  });

  it('rejects an interest it does not recognise', () => {
    expect(fields(draft({ interests: ['skiing'] as never }))).toEqual(['interests']);
  });

  it('carries a Khmer message for every error, never only English', () => {
    const errors = validateTripDraft(emptyTripDraft());
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error.message.km.trim()).not.toBe('');
      expect(error.message.km).not.toBe(error.message.en);
    }
  });
});

describe('normalizeTripDraft', () => {
  it('trims the free-text fields', () => {
    const row = normalizeTripDraft(draft({ title: '  Japan trip  ', destination: ' Japan ' }));
    expect(row.title).toBe('Japan trip');
    expect(row.destination).toBe('Japan');
  });

  it('de-duplicates interests and puts them in a stable order', () => {
    // Two travelers who picked the same things must produce the same array,
    // whatever order they tapped them in, or the column is useless for grouping.
    const a = normalizeTripDraft(draft({ interests: ['nature', 'food', 'food'] as never }));
    const b = normalizeTripDraft(draft({ interests: ['food', 'nature'] }));
    expect(a.interests).toEqual(b.interests);
    expect(a.interests).toEqual(['food', 'nature']);
  });

  it('maps to the column names the table actually uses', () => {
    expect(Object.keys(normalizeTripDraft(draft())).sort()).toEqual([
      'destination',
      'end_date',
      'interests',
      'start_date',
      'title',
      'travelers',
    ]);
  });

  it('never emits a key the traveler must not set', () => {
    // user_id, is_public and share_token are the server's and the database's.
    const keys = Object.keys(normalizeTripDraft(draft()));
    for (const forbidden of ['user_id', 'is_public', 'share_token', 'generated_itinerary']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe('suggestTripTitle', () => {
  it('builds a name from the destination in both languages', () => {
    expect(suggestTripTitle('Japan', 'en')).toBe('Japan trip');
    expect(suggestTripTitle('ជប៉ុន', 'km')).toBe('ដំណើរទៅជប៉ុន');
  });

  it('stays empty while the destination is', () => {
    expect(suggestTripTitle('   ', 'en')).toBe('');
  });
});
