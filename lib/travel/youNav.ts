// ─────────────────────────────────────────────────────────────────────────────
// The /you tab's row data — a directory, not a dashboard (see app/you/page.tsx).
//
// A PLAIN .ts MODULE ON PURPOSE. app/you/page.tsx is a 'use client' .tsx file;
// this repo's tsconfig sets `jsx: "preserve"`, so Vitest cannot import a .tsx
// file at all (there is no JSX transform in the test pipeline — see
// lib/travel/importOutcome.ts and lib/travel/itinerary.ts for the same
// reasoning applied elsewhere). Pulling the row data out to a plain module is
// what lets a regression test prove "/you/saved is reachable from here"
// without rendering anything.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Bell,
  Compass,
  FileText,
  HandCoins,
  Heart,
  LifeBuoy,
  ListChecks,
  Map,
  Settings,
  Siren,
  Smartphone,
  Sparkles,
} from 'lucide-react';

export interface YouNavRow {
  href: string;
  icon: typeof Map;
  label: { en: string; km: string };
  hint?: { en: string; km: string };
  /** Only shown to a signed-in traveler. */
  private?: boolean;
  /** Opens off-site, so it renders as an anchor rather than a route link. */
  external?: boolean;
}

export interface YouNavGroup {
  title: { en: string; km: string };
  rows: YouNavRow[];
}

export const YOU_NAV_GROUPS: YouNavGroup[] = [
  {
    title: { en: 'Your travel', km: 'ដំណើររបស់អ្នក' },
    rows: [
      {
        href: '/trips',
        icon: Map,
        label: { en: 'Trips', km: 'ដំណើរ' },
        hint: { en: 'Plans, itineraries and memories', km: 'ផែនការ កម្មវិធី និងការចងចាំ' },
        private: true,
      },
      {
        href: '/you/saved',
        icon: Heart,
        label: { en: 'Saved places', km: 'កន្លែងដែលបានរក្សាទុក' },
        hint: { en: 'Kept places, ready to add to a trip', km: 'កន្លែងដែលរក្សាទុក ត្រៀមដាក់ចូលដំណើរ' },
        private: true,
      },
      {
        href: '/my-esims',
        icon: Smartphone,
        label: { en: 'My eSIMs', km: 'eSIM របស់ខ្ញុំ' },
        hint: { en: 'QR codes, data and orders', km: 'កូដ QR ទិន្នន័យ និងការបញ្ជាទិញ' },
        private: true,
      },
      {
        // Explore traded its bottom-nav tab for the store. This row is one of
        // its three remaining persistent entry points (navbar and footer are
        // the others) — see the note in BottomNavigation.tsx.
        href: '/explore',
        icon: Compass,
        label: { en: 'Explore destinations', km: 'ស្វែងរកគោលដៅ' },
        hint: {
          en: 'Guides, visas and real prices',
          km: 'មគ្គុទ្ទេសក៍ ទិដ្ឋាការ និងតម្លៃពិត',
        },
      },
      {
        href: '/checklist',
        icon: ListChecks,
        label: { en: 'Travel checklist', km: 'បញ្ជីត្រួតពិនិត្យ' },
      },
    ],
  },
  {
    title: { en: 'Notifications', km: 'ការជូនដំណឹង' },
    rows: [
      {
        href: '/updates',
        icon: Sparkles,
        label: { en: 'Domner Updates', km: 'ព័ត៌មានថ្មី' },
        hint: { en: 'Everything we have told you', km: 'អ្វីៗដែលយើងបានប្រាប់អ្នក' },
        private: true,
      },
      {
        href: '/you/notifications',
        icon: Bell,
        label: { en: 'Notification settings', km: 'ការកំណត់ការជូនដំណឹង' },
        hint: { en: 'Choose exactly what reaches you', km: 'ជ្រើសរើសអ្វីដែលមកដល់អ្នក' },
        private: true,
      },
    ],
  },
  {
    title: { en: 'Support', km: 'ជំនួយ' },
    rows: [
      {
        href: '/emergency',
        icon: Siren,
        label: { en: 'Emergency', km: 'បន្ទាន់' },
        hint: { en: 'Works with no connection', km: 'ដំណើរការដោយគ្មានអ៊ីនធឺណិត' },
      },
      {
        // Was '/affiliate' — a page headed "Earn 30% on every eSIM you refer".
        // Someone whose eSIM will not activate taps Get help and was invited to
        // become a reseller.
        href: 'https://t.me/domnerapp',
        icon: LifeBuoy,
        label: { en: 'Get help', km: 'ទទួលជំនួយ' },
        hint: { en: 'Message us on Telegram', km: 'សរសេរមកយើងតាម Telegram' },
        external: true,
      },
      {
        href: '/affiliate',
        icon: HandCoins,
        label: { en: 'Refer and earn', km: 'ណែនាំ និងរកចំណូល' },
        hint: { en: 'Commission on every eSIM you refer', km: 'កម្រៃលើ eSIM នីមួយៗដែលអ្នកណែនាំ' },
      },
      {
        href: '/settings',
        icon: Settings,
        label: { en: 'Settings', km: 'ការកំណត់' },
        private: true,
      },
      { href: '/terms', icon: FileText, label: { en: 'Terms & privacy', km: 'លក្ខខណ្ឌ និងឯកជនភាព' } },
    ],
  },
];
