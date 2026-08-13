// ─────────────────────────────────────────────────────────────────────────────
// Notification preferences — shape, defaults, and the UI grouping.
//
// Pure module: imported by the preferences screen (client) and by the priority
// engine (server). One definition, so the switch a traveler sees is provably
// the switch the sender checks.
// ─────────────────────────────────────────────────────────────────────────────

import type { NotificationCategory, PreferenceKey } from './catalog';

export interface NotificationPreferences {
  push_enabled: boolean;
  flight_gate_changes: boolean;
  flight_delays: boolean;
  flight_boarding: boolean;
  flight_check_in: boolean;
  trip_reminders: boolean;
  trip_itinerary: boolean;
  trip_hotel: boolean;
  esim_activation: boolean;
  esim_data_usage: boolean;
  esim_low_data: boolean;
  travel_weather: boolean;
  travel_local_info: boolean;
  discover_deals: boolean;
  discover_destinations: boolean;
  discover_suggestions: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  timezone: string | null;
}

/**
 * Defaults, matching the migration exactly.
 *
 * Discovery and local information start OFF. Someone has to opt in to
 * marketing; nobody should have to opt out of it. The flight and eSIM switches
 * start ON because those are the notifications the traveler came for — turning
 * "tell me if my gate changes" off by default would make the promise a lie.
 */
export const defaultPreferences: NotificationPreferences = {
  push_enabled: true,
  flight_gate_changes: true,
  flight_delays: true,
  flight_boarding: true,
  flight_check_in: true,
  trip_reminders: true,
  trip_itinerary: true,
  trip_hotel: true,
  esim_activation: true,
  esim_data_usage: true,
  esim_low_data: true,
  travel_weather: true,
  travel_local_info: false,
  discover_deals: false,
  discover_destinations: false,
  discover_suggestions: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: null,
};

/** Fill any missing key from the defaults. A partial row must never read as `false`. */
export function withDefaults(row: Partial<NotificationPreferences> | null | undefined): NotificationPreferences {
  return { ...defaultPreferences, ...(row ?? {}) };
}

export interface PreferenceGroup {
  category: NotificationCategory;
  title: { en: string; km: string };
  blurb: { en: string; km: string };
  items: {
    key: PreferenceKey;
    label: { en: string; km: string };
    /** Shown under the switch. Explains what the traveler actually gets. */
    detail: { en: string; km: string };
  }[];
}

/** The YOU → Notifications screen, in order. */
export const PREFERENCE_GROUPS: PreferenceGroup[] = [
  {
    category: 'flights',
    title: { en: 'Flights', km: 'ជើងហោះហើរ' },
    blurb: {
      en: 'The ones worth waking up for.',
      km: 'អ្វីដែលសំខាន់បំផុតសម្រាប់ដំណើររបស់អ្នក។',
    },
    items: [
      {
        key: 'flight_gate_changes',
        label: { en: 'Gate changes', km: 'ការផ្លាស់ប្តូរទ្វារ' },
        detail: { en: 'The moment your gate moves.', km: 'ពេលទ្វារឡើងយន្តហោះផ្លាស់ប្តូរ។' },
      },
      {
        key: 'flight_delays',
        label: { en: 'Delays', km: 'ការពន្យារពេល' },
        detail: { en: 'Departure time changes, with the new time.', km: 'ការផ្លាស់ប្តូរម៉ោងចេញ។' },
      },
      {
        key: 'flight_boarding',
        label: { en: 'Boarding', km: 'ការឡើងយន្តហោះ' },
        detail: { en: 'When boarding opens at your gate.', km: 'ពេលចាប់ផ្តើមឡើងយន្តហោះ។' },
      },
      {
        key: 'flight_check_in',
        label: { en: 'Check-in', km: 'ការចុះឈ្មោះ' },
        detail: { en: 'When online check-in opens.', km: 'ពេលអាចចុះឈ្មោះតាមអ៊ីនធឺណិត។' },
      },
    ],
  },
  {
    category: 'trips',
    title: { en: 'Trips', km: 'ដំណើរ' },
    blurb: {
      en: 'Reminders that arrive while there is still time to act.',
      km: 'ការរំលឹកមុនពេលដំណើររបស់អ្នកចាប់ផ្តើម។',
    },
    items: [
      {
        key: 'trip_reminders',
        label: { en: 'Trip reminders', km: 'ការរំលឹកដំណើរ' },
        detail: { en: 'The day before you travel.', km: 'មួយថ្ងៃមុនដំណើរ។' },
      },
      {
        key: 'trip_itinerary',
        label: { en: 'Itinerary changes', km: 'ការផ្លាស់ប្តូរកម្មវិធី' },
        detail: { en: 'When something in your plan moves.', km: 'ពេលកម្មវិធីដំណើរផ្លាស់ប្តូរ។' },
      },
      {
        key: 'trip_hotel',
        label: { en: 'Hotel reminders', km: 'ការរំលឹកសណ្ឋាគារ' },
        detail: { en: 'Check-in and check-out times.', km: 'ម៉ោងចូល និងចេញពីសណ្ឋាគារ។' },
      },
    ],
  },
  {
    category: 'esim',
    title: { en: 'eSIM', km: 'eSIM' },
    blurb: {
      en: 'Your connection, before you notice it is gone.',
      km: 'ការតភ្ជាប់របស់អ្នក មុនពេលវាដាច់។',
    },
    items: [
      {
        key: 'esim_activation',
        label: { en: 'Activation', km: 'ការដំណើរការ' },
        detail: { en: 'When your eSIM is ready and when it goes live.', km: 'ពេល eSIM របស់អ្នករួចរាល់។' },
      },
      {
        key: 'esim_data_usage',
        label: { en: 'Data usage', km: 'ការប្រើប្រាស់ទិន្នន័យ' },
        detail: { en: 'A quiet check-in on how much is left.', km: 'នៅសល់ទិន្នន័យប៉ុន្មាន។' },
      },
      {
        key: 'esim_low_data',
        label: { en: 'Low data', km: 'ទិន្នន័យតិច' },
        detail: { en: 'Before you run out, not after.', km: 'មុនពេលទិន្នន័យអស់។' },
      },
    ],
  },
  {
    category: 'travel',
    title: { en: 'Travel', km: 'ការធ្វើដំណើរ' },
    blurb: {
      en: 'What is happening around you today.',
      km: 'អ្វីដែលកើតឡើងជុំវិញអ្នកថ្ងៃនេះ។',
    },
    items: [
      {
        key: 'travel_weather',
        label: { en: 'Weather', km: 'អាកាសធាតុ' },
        detail: { en: 'Rain or heat that changes your day.', km: 'ភ្លៀង ឬកម្តៅដែលប៉ះពាល់ដំណើរ។' },
      },
      {
        key: 'travel_local_info',
        label: { en: 'Local information', km: 'ព័ត៌មានក្នុងតំបន់' },
        detail: { en: 'Nearby saved places and local advice.', km: 'ទីតាំងជិតៗ និងដំបូន្មាន។' },
      },
    ],
  },
  {
    category: 'discover',
    title: { en: 'Discover', km: 'ស្វែងរក' },
    blurb: {
      en: 'Off by default. Turn on only what you want.',
      km: 'បិទតាមលំនាំដើម។ បើកតែអ្វីដែលអ្នកចង់។',
    },
    items: [
      {
        key: 'discover_deals',
        label: { en: 'Deals', km: 'ការបញ្ចុះតម្លៃ' },
        detail: { en: 'Price drops on the places you look at.', km: 'តម្លៃថ្លៃចុះសម្រាប់កន្លែងអ្នកចាប់អារម្មណ៍។' },
      },
      {
        key: 'discover_destinations',
        label: { en: 'Destinations', km: 'គោលដៅ' },
        detail: { en: 'New places worth a look.', km: 'កន្លែងថ្មីគួរមើល។' },
      },
      {
        key: 'discover_suggestions',
        label: { en: 'Recommendations', km: 'ការណែនាំ' },
        detail: { en: 'Ideas for the trip you are planning.', km: 'គំនិតសម្រាប់ដំណើររបស់អ្នក។' },
      },
    ],
  },
];

/** Every switch key, in screen order. Used to validate a PUT body. */
export const PREFERENCE_KEYS: PreferenceKey[] = PREFERENCE_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key)
);
