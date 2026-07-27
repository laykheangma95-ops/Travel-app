// Seed corners for local development and for the very first users.
//
// Domner already ships mock fallbacks for every feature that needs a backend
// (see lib/supabase.ts), and Corner Map follows that convention: without a
// Supabase project configured, the map renders these places with *zero* shots.
// That is deliberate — it exercises the §5.1 empty state, which is the state
// Cambodia will actually be in at launch, rather than faking a busy map.

import type { CornerWithHeat } from '@/lib/corner-map/types';

const cold = (
  id: string,
  name_en: string,
  name_km: string,
  category: CornerWithHeat['category'],
  lat: number,
  lng: number
): CornerWithHeat => ({
  id,
  name_en,
  name_km,
  category,
  lat,
  lng,
  address_en: null,
  address_km: null,
  bookable: false,
  shot_count: 0,
  last_shot_at: null,
  heat: 0,
});

export const SEED_CORNERS: CornerWithHeat[] = [
  // Phnom Penh
  cold('seed-wat-phnom', 'Wat Phnom', 'វត្តភ្នំ', 'temple', 11.5765, 104.9215),
  cold('seed-central-market', 'Central Market', 'ផ្សារធំថ្មី', 'market', 11.5695, 104.9211),
  cold('seed-russian-market', 'Russian Market', 'ផ្សារទួលទំពូង', 'market', 11.5417, 104.9207),
  cold('seed-riverside', 'Sisowath Quay', 'ផ្លូវព្រះស៊ីសុវត្ថិ', 'viewpoint', 11.5697, 104.9315),
  cold('seed-royal-palace', 'Royal Palace', 'ព្រះបរមរាជវាំង', 'temple', 11.5637, 104.9314),
  cold('seed-bkk1-cafe', 'Boeung Keng Kang Café', 'ហាងកាហ្វេបឹងកេងកង', 'cafe', 11.5477, 104.9223),
  cold('seed-street-240', 'Street 240', 'ផ្លូវ ២៤០', 'cafe', 11.5595, 104.9276),
  cold('seed-nagaworld', 'Naga Riverside', 'តំបន់ណាហ្គា', 'bar', 11.5619, 104.9294),

  // Siem Reap
  cold('seed-angkor-wat', 'Angkor Wat', 'អង្គរវត្ត', 'temple', 13.4125, 103.867),
  cold('seed-bayon', 'Bayon', 'ប្រាសាទបាយ័ន', 'temple', 13.4413, 103.8587),
  cold('seed-pub-street', 'Pub Street', 'ផ្លូវផាប', 'bar', 13.3549, 103.8558),
  cold('seed-old-market-sr', 'Psar Chas', 'ផ្សារចាស់', 'market', 13.3537, 103.8564),

  // Coast
  cold('seed-otres', 'Otres Beach', 'ឆ្នេរអូត្រេស', 'viewpoint', 10.5847, 103.5203),
  cold('seed-kampot-river', 'Kampot Riverfront', 'មាត់ទន្លេកំពត', 'viewpoint', 10.6104, 104.1812),
  cold('seed-kep-crab', 'Kep Crab Market', 'ផ្សារក្តាមកែប', 'restaurant', 10.4833, 104.3),
];
