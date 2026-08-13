// ─────────────────────────────────────────────────────────────────────────────
// The notification catalogue — one definition per kind of thing Domner can tell
// a traveler, shared by the server that sends it and the UI that renders it.
//
// WHY A CATALOGUE INSTEAD OF AD-HOC PAYLOADS:
//   A notification is a promise. "We will tell you if your gate changes" only
//   holds if there is exactly one place that decides what a gate change looks
//   like, how urgent it is, which preference switch silences it, and where
//   tapping it lands. Scattering that across call sites is how you end up
//   pushing a marketing card at 3am, or opening the homepage from a boarding
//   alert.
//
// This module is pure and safe to import from a client component. No secrets,
// no database, no Node built-ins.
// ─────────────────────────────────────────────────────────────────────────────

export const NOTIFICATION_CATEGORIES = [
  'flights',
  'trips',
  'esim',
  'travel',
  'discover',
  'account',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Priority levels, from the product brief (§10).
 *
 *   1 CRITICAL   — push immediately, ignores quiet hours. Something is
 *                  happening now and being asleep is not a reason to miss it.
 *   2 IMPORTANT  — push, respects quiet hours.
 *   3 USEFUL     — push only if nothing else went out recently; bundled.
 *   4 DISCOVERY  — inbox only. Never pushed.
 */
export type NotificationLevel = 1 | 2 | 3 | 4;

export const LEVEL_LABEL: Record<NotificationLevel, string> = {
  1: 'Critical',
  2: 'Important',
  3: 'Useful',
  4: 'Discovery',
};

/** The preference column that silences a kind. Mirrors notification_preferences. */
export type PreferenceKey =
  | 'flight_gate_changes'
  | 'flight_delays'
  | 'flight_boarding'
  | 'flight_check_in'
  | 'trip_reminders'
  | 'trip_itinerary'
  | 'trip_hotel'
  | 'esim_activation'
  | 'esim_data_usage'
  | 'esim_low_data'
  | 'travel_weather'
  | 'travel_local_info'
  | 'discover_deals'
  | 'discover_destinations'
  | 'discover_suggestions';

export interface NotificationKindSpec {
  category: NotificationCategory;
  level: NotificationLevel;
  /**
   * Which switch in YOU → Notifications turns this off. `null` means the kind
   * is not optional — an order failure or a refund is account correspondence,
   * not a notification preference.
   */
  preference: PreferenceKey | null;
  /** Lucide icon name, resolved by the UI. Keeps this module render-free. */
  icon: string;
  /** How long the card stays useful. Null = never expires. */
  ttlMinutes: number | null;
}

/**
 * Every kind Domner can send. Adding one means adding it here first — the
 * dispatch route rejects an unknown kind rather than guessing a level, because
 * a guessed level is how a deal ends up buzzing a phone at boarding time.
 */
export const NOTIFICATION_KINDS = {
  // ── Level 1: critical ──────────────────────────────────────────────────────
  'flight.cancelled': {
    category: 'flights', level: 1, preference: null,
    icon: 'OctagonAlert', ttlMinutes: 60 * 24,
  },
  'flight.gate_change': {
    category: 'flights', level: 1, preference: 'flight_gate_changes',
    icon: 'DoorOpen', ttlMinutes: 60 * 6,
  },
  'flight.boarding': {
    category: 'flights', level: 1, preference: 'flight_boarding',
    icon: 'PlaneTakeoff', ttlMinutes: 90,
  },
  'flight.delayed': {
    category: 'flights', level: 1, preference: 'flight_delays',
    icon: 'Clock', ttlMinutes: 60 * 12,
  },
  'flight.disruption': {
    category: 'flights', level: 1, preference: null,
    icon: 'TriangleAlert', ttlMinutes: 60 * 24,
  },

  // ── Level 2: important ─────────────────────────────────────────────────────
  'flight.check_in_open': {
    category: 'flights', level: 2, preference: 'flight_check_in',
    icon: 'TicketCheck', ttlMinutes: 60 * 24,
  },
  'flight.landed': {
    category: 'flights', level: 2, preference: null,
    icon: 'PlaneLanding', ttlMinutes: 60 * 12,
  },
  'trip.tomorrow': {
    category: 'trips', level: 2, preference: 'trip_reminders',
    icon: 'CalendarClock', ttlMinutes: 60 * 36,
  },
  'trip.itinerary_changed': {
    category: 'trips', level: 2, preference: 'trip_itinerary',
    icon: 'ListChecks', ttlMinutes: 60 * 48,
  },
  'trip.hotel_check_in': {
    category: 'trips', level: 2, preference: 'trip_hotel',
    icon: 'BedDouble', ttlMinutes: 60 * 12,
  },
  'esim.activated': {
    category: 'esim', level: 2, preference: 'esim_activation',
    icon: 'Signal', ttlMinutes: 60 * 72,
  },
  'esim.ready': {
    category: 'esim', level: 2, preference: 'esim_activation',
    icon: 'QrCode', ttlMinutes: null,
  },
  'esim.low_data': {
    category: 'esim', level: 2, preference: 'esim_low_data',
    icon: 'SignalLow', ttlMinutes: 60 * 24,
  },
  'order.fulfilment_failed': {
    category: 'account', level: 2, preference: null,
    icon: 'CircleAlert', ttlMinutes: null,
  },

  // ── Level 3: useful ────────────────────────────────────────────────────────
  'esim.data_usage': {
    category: 'esim', level: 3, preference: 'esim_data_usage',
    icon: 'ChartNoAxesColumn', ttlMinutes: 60 * 24,
  },
  'travel.weather': {
    category: 'travel', level: 3, preference: 'travel_weather',
    icon: 'CloudRain', ttlMinutes: 60 * 12,
  },
  'travel.local_info': {
    category: 'travel', level: 3, preference: 'travel_local_info',
    icon: 'Info', ttlMinutes: 60 * 48,
  },
  'trip.nearby_place': {
    category: 'travel', level: 3, preference: 'travel_local_info',
    icon: 'MapPin', ttlMinutes: 60 * 4,
  },
  'trip.suggestion': {
    category: 'trips', level: 3, preference: 'discover_suggestions',
    icon: 'Sparkles', ttlMinutes: 60 * 72,
  },

  // ── Level 4: discovery (inbox only, never pushed) ──────────────────────────
  'discover.deal': {
    category: 'discover', level: 4, preference: 'discover_deals',
    icon: 'Tag', ttlMinutes: 60 * 24 * 7,
  },
  'discover.destination': {
    category: 'discover', level: 4, preference: 'discover_destinations',
    icon: 'Compass', ttlMinutes: 60 * 24 * 14,
  },
} as const satisfies Record<string, NotificationKindSpec>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export function isNotificationKind(value: string): value is NotificationKind {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_KINDS, value);
}

export function specFor(kind: NotificationKind): NotificationKindSpec {
  return NOTIFICATION_KINDS[kind];
}

// ── Deep links ───────────────────────────────────────────────────────────────
//
// §15 of the brief: every notification opens the exact relevant screen. Never
// the homepage. This is the only place a notification's destination is decided,
// so "gate changed → the flight page for THAT flight" cannot drift.

export interface DeepLinkTarget {
  /** Flight number, e.g. 'SQ123'. */
  flightNumber?: string;
  /** trip_plans.id */
  tripId?: string;
  /** esim_orders.order_number */
  orderNumber?: string;
  /** destinations[].slug */
  destinationSlug?: string;
}

/**
 * Where a notification of this kind should land. Falls back to the inbox rather
 * than the homepage when the target is missing: the inbox at least still shows
 * the message, whereas '/' silently discards it.
 */
export function deepLinkFor(kind: NotificationKind, target: DeepLinkTarget = {}): string {
  const flight = target.flightNumber?.replace(/\s+/g, '').toUpperCase();

  switch (kind) {
    case 'flight.cancelled':
    case 'flight.gate_change':
    case 'flight.boarding':
    case 'flight.delayed':
    case 'flight.disruption':
    case 'flight.check_in_open':
    case 'flight.landed':
      return flight ? `/flights/${encodeURIComponent(flight)}` : '/flights';

    case 'trip.tomorrow':
    case 'trip.itinerary_changed':
    case 'trip.suggestion':
      return target.tripId ? `/trips/${target.tripId}` : '/trips';

    case 'trip.hotel_check_in':
      return target.tripId ? `/trips/${target.tripId}#stay` : '/trips';

    case 'trip.nearby_place':
      return target.tripId ? `/trips/${target.tripId}#places` : '/trips';

    case 'esim.ready':
    case 'esim.activated':
      return target.orderNumber
        ? `/my-esims?order=${encodeURIComponent(target.orderNumber)}`
        : '/my-esims';

    case 'esim.low_data':
    case 'esim.data_usage':
      return target.orderNumber
        ? `/my-esims?order=${encodeURIComponent(target.orderNumber)}#usage`
        : '/my-esims';

    case 'order.fulfilment_failed':
      return target.orderNumber
        ? `/order-confirmation/${encodeURIComponent(target.orderNumber)}`
        : '/my-esims';

    case 'travel.weather':
    case 'travel.local_info':
      if (target.tripId) return `/trips/${target.tripId}#weather`;
      return target.destinationSlug ? `/destination/${target.destinationSlug}` : '/updates';

    case 'discover.deal':
      return target.destinationSlug ? `/esim/${target.destinationSlug}` : '/esim';

    case 'discover.destination':
      return target.destinationSlug ? `/destination/${target.destinationSlug}` : '/explore';
  }
}

// ── Category presentation ────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<NotificationCategory, { en: string; km: string }> = {
  flights: { en: 'Flights', km: 'ជើងហោះហើរ' },
  trips: { en: 'Trips', km: 'ដំណើរ' },
  esim: { en: 'eSIM', km: 'eSIM' },
  travel: { en: 'Travel', km: 'ការធ្វើដំណើរ' },
  discover: { en: 'Discover', km: 'ស្វែងរក' },
  account: { en: 'Account', km: 'គណនី' },
};

/**
 * The tone a card is painted in. Derived from the level so the inbox, the
 * capsules and the push badge cannot disagree about how alarming something is.
 */
export type NotificationTone = 'urgent' | 'warning' | 'info' | 'quiet';

export function toneForLevel(level: NotificationLevel): NotificationTone {
  if (level === 1) return 'urgent';
  if (level === 2) return 'warning';
  if (level === 3) return 'info';
  return 'quiet';
}
