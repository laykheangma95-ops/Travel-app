// ─────────────────────────────────────────────────────────────────────────────
// The data-usage model behind the eSIM recommendation.
//
// READ THIS BEFORE CHANGING A NUMBER.
//
// A figure like "8.1 GB" *looks* measured. It is not. It is arithmetic over the
// per-day estimates below, and the UI is built so the user always sees the
// arithmetic rather than just the total — every line item, its rate, and the
// words "typical use, not a guarantee".
//
// Provenance of the rates: they are our own conservative estimates for a
// traveller's day, derived from each app's published quality settings and
// typical session lengths — not from measurements of our customers, of whom we
// have collected no usage telemetry. They are deliberately rounded and
// deliberately a little generous, because running out of data abroad is far
// worse than buying 2 GB you did not need. If we ever measure real usage, this
// file is the one place to update, and this comment must be updated with it.
// ─────────────────────────────────────────────────────────────────────────────

import type { Bi } from './schema';

export interface UsageLine {
  id: string;
  label: Bi;
  /** Gigabytes per day of travel. */
  gbPerDay: number;
  /** On by default in the recommendation. */
  defaultOn: boolean;
  note: Bi;
}

export const USAGE_LINES: UsageLine[] = [
  {
    id: 'maps',
    label: { en: 'Maps and getting around', km: 'ផែនទី និងការធ្វើដំណើរ' },
    gbPerDay: 0.15,
    defaultOn: true,
    note: {
      en: 'Navigation, transit times, looking places up.',
      km: 'ការណែនាំផ្លូវ ម៉ោងរថភ្លើង និងការស្វែងរកទីតាំង។',
    },
  },
  {
    id: 'social',
    label: { en: 'TikTok and video', km: 'TikTok និងវីដេអូ' },
    gbPerDay: 0.6,
    defaultOn: true,
    note: {
      en: 'About an hour a day of scrolling video.',
      km: 'ប្រហែលមួយម៉ោងក្នុងមួយថ្ងៃនៃការមើលវីដេអូ។',
    },
  },
  {
    id: 'photos',
    label: { en: 'Photos and Instagram', km: 'រូបថត និង Instagram' },
    gbPerDay: 0.25,
    defaultOn: true,
    note: {
      en: 'Uploading the day, stories, backing up photos.',
      km: 'ការបង្ហោះរូបថត ស្តូរី និងការរក្សាទុករូបភាព។',
    },
  },
  {
    id: 'chat',
    label: { en: 'Messaging and calls home', km: 'សារ និងការហៅទូរស័ព្ទមកផ្ទះ' },
    gbPerDay: 0.1,
    defaultOn: true,
    note: {
      en: 'Telegram, Messenger, a video call home each evening.',
      km: 'Telegram, Messenger និងការហៅវីដេអូមកផ្ទះរាល់ល្ងាច។',
    },
  },
  {
    id: 'translate',
    label: { en: 'Translation', km: 'ការបកប្រែ' },
    gbPerDay: 0.05,
    defaultOn: true,
    note: {
      en: 'Camera translation of menus and signs.',
      km: 'ការបកប្រែម៉ឺនុយ និងផ្លាកសញ្ញាតាមកាមេរ៉ា។',
    },
  },
  {
    id: 'hotspot',
    label: { en: 'Sharing with a travel partner', km: 'ចែករំលែកជាមួយដៃគូធ្វើដំណើរ' },
    gbPerDay: 0.5,
    defaultOn: false,
    note: {
      en: 'Hotspot for one more phone. Included on every plan.',
      km: 'Hotspot សម្រាប់ទូរស័ព្ទមួយទៀត។ មានក្នុងគ្រប់គម្រោង។',
    },
  },
];

/** Headroom added to the estimate, so a normal day never runs the plan dry. */
export const HEADROOM = 0.15;

export interface UsageEstimate {
  /** Per-line totals for the whole trip, in GB. */
  lines: { id: string; gb: number }[];
  /** Sum of the lines, before headroom. */
  subtotalGb: number;
  /** What we actually recommend against. */
  withHeadroomGb: number;
}

export function estimateUsage(days: number, enabledIds: string[]): UsageEstimate {
  const lines = USAGE_LINES.filter((l) => enabledIds.includes(l.id)).map((l) => ({
    id: l.id,
    gb: Math.round(l.gbPerDay * days * 10) / 10,
  }));
  const subtotalGb = Math.round(lines.reduce((s, l) => s + l.gb, 0) * 10) / 10;
  return {
    lines,
    subtotalGb,
    withHeadroomGb: Math.round(subtotalGb * (1 + HEADROOM) * 10) / 10,
  };
}

/** The ids switched on when the page first renders. */
export const DEFAULT_LINE_IDS = USAGE_LINES.filter((l) => l.defaultOn).map((l) => l.id);
