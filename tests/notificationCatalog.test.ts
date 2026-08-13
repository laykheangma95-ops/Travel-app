import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_KINDS,
  deepLinkFor,
  isNotificationKind,
  specFor,
  toneForLevel,
  type NotificationKind,
} from '@/lib/notifications/catalog';
import { PREFERENCE_KEYS, defaultPreferences, withDefaults } from '@/lib/notifications/preferences';

const kinds = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];

describe('notification catalogue', () => {
  it('gives every kind a preference switch, or marks it non-optional on purpose', () => {
    // A kind with `preference: null` is account correspondence the traveler
    // cannot turn off. That is a deliberate, short list — if it grows, someone
    // has quietly made a marketing message unmutable.
    const unmutable = kinds.filter((kind) => specFor(kind).preference === null);
    expect(unmutable.sort()).toEqual(
      [
        'flight.cancelled',
        'flight.disruption',
        'flight.landed',
        'order.fulfilment_failed',
      ].sort()
    );
  });

  it('only references preference keys that exist on the settings screen', () => {
    for (const kind of kinds) {
      const preference = specFor(kind).preference;
      if (preference !== null) expect(PREFERENCE_KEYS).toContain(preference);
    }
  });

  it('never deep-links a notification to the homepage', () => {
    // §15: a notification that opens '/' has thrown away the context that made
    // it worth sending. This holds even with no target at all.
    for (const kind of kinds) {
      expect(deepLinkFor(kind)).not.toBe('/');
      expect(deepLinkFor(kind).startsWith('/')).toBe(true);
    }
  });

  it('routes a flight notification to that exact flight', () => {
    expect(deepLinkFor('flight.gate_change', { flightNumber: 'sq 123' })).toBe('/flights/SQ123');
    expect(deepLinkFor('flight.boarding', { flightNumber: 'QH215' })).toBe('/flights/QH215');
  });

  it('routes eSIM usage to the order, with the usage anchor', () => {
    expect(deepLinkFor('esim.low_data', { orderNumber: 'DMN-2026-00001' })).toBe(
      '/my-esims?order=DMN-2026-00001#usage'
    );
  });

  it('routes trip notifications to the matching workspace anchor', () => {
    const tripId = '11111111-1111-4111-8111-111111111111';
    expect(deepLinkFor('trip.hotel_check_in', { tripId })).toBe(`/trips/${tripId}#stay`);
    expect(deepLinkFor('trip.nearby_place', { tripId })).toBe(`/trips/${tripId}#places`);
    expect(deepLinkFor('trip.tomorrow', { tripId })).toBe(`/trips/${tripId}`);
  });

  it('falls back to a list page, not the homepage, when the target is missing', () => {
    expect(deepLinkFor('flight.gate_change')).toBe('/flights');
    expect(deepLinkFor('esim.ready')).toBe('/my-esims');
    expect(deepLinkFor('trip.tomorrow')).toBe('/trips');
  });

  it('keeps every level-1 kind in the flights category', () => {
    // Nothing outside a live flight currently justifies overriding quiet hours.
    for (const kind of kinds) {
      const spec = specFor(kind);
      if (spec.level === 1) expect(spec.category).toBe('flights');
    }
  });

  it('never pushes a discovery kind', () => {
    for (const kind of kinds) {
      const spec = specFor(kind);
      if (spec.category === 'discover') expect(spec.level).toBe(4);
    }
  });

  it('rejects an unknown kind', () => {
    expect(isNotificationKind('flight.gate_change')).toBe(true);
    expect(isNotificationKind('flight.free_upgrade')).toBe(false);
  });

  it('maps levels to a single tone vocabulary', () => {
    expect(toneForLevel(1)).toBe('urgent');
    expect(toneForLevel(2)).toBe('warning');
    expect(toneForLevel(3)).toBe('info');
    expect(toneForLevel(4)).toBe('quiet');
  });
});

describe('notification preferences', () => {
  it('defaults discovery and local information to off', () => {
    expect(defaultPreferences.discover_deals).toBe(false);
    expect(defaultPreferences.discover_destinations).toBe(false);
    expect(defaultPreferences.discover_suggestions).toBe(false);
    expect(defaultPreferences.travel_local_info).toBe(false);
  });

  it('defaults the alerts travelers came for to on', () => {
    expect(defaultPreferences.flight_gate_changes).toBe(true);
    expect(defaultPreferences.flight_delays).toBe(true);
    expect(defaultPreferences.flight_boarding).toBe(true);
    expect(defaultPreferences.esim_low_data).toBe(true);
  });

  it('fills a partial row from the defaults rather than reading missing as false', () => {
    const merged = withDefaults({ flight_delays: false });
    expect(merged.flight_delays).toBe(false);
    expect(merged.flight_gate_changes).toBe(true);
    expect(merged.push_enabled).toBe(true);
  });

  it('treats a missing row as the defaults', () => {
    expect(withDefaults(null)).toEqual(defaultPreferences);
  });
});
