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
  cold('15c19329-8d00-5d6b-b8c1-4407ab69f5bc', 'Wat Phnom', 'វត្តភ្នំ', 'temple', 11.5765, 104.9215),
  cold('bfb4c9f5-954a-5fa1-a07d-93e2c9bf51b2', 'Central Market', 'ផ្សារធំថ្មី', 'market', 11.5695, 104.9211),
  cold('32be62f7-da05-563e-afbc-4863e5b132d8', 'Russian Market', 'ផ្សារទួលទំពូង', 'market', 11.5417, 104.9207),
  cold('96500419-c62a-5fdd-92d7-2315f3cf74ba', 'Sisowath Quay', 'ផ្លូវព្រះស៊ីសុវត្ថិ', 'viewpoint', 11.5697, 104.9315),
  cold('1d44085a-264c-5ec7-b18f-316a94733dfd', 'Royal Palace', 'ព្រះបរមរាជវាំង', 'temple', 11.5637, 104.9314),
  cold('aa1c1faa-f1f9-56ea-8966-9b89d210367c', 'Boeung Keng Kang Café', 'ហាងកាហ្វេបឹងកេងកង', 'cafe', 11.5477, 104.9223),
  cold('a91f5350-7ac5-501c-873d-be7932337d91', 'Street 240', 'ផ្លូវ ២៤០', 'cafe', 11.5595, 104.9276),
  cold('d0825107-d5ca-5224-8b00-9513f24771c2', 'Naga Riverside', 'តំបន់ណាហ្គា', 'bar', 11.5619, 104.9294),

  // Siem Reap
  cold('9dba4867-26b1-5641-8a5c-baef320e20c8', 'Angkor Wat', 'អង្គរវត្ត', 'temple', 13.4125, 103.867),
  cold('7a725a1a-f210-50ce-9fb2-65c9ba508ba9', 'Bayon', 'ប្រាសាទបាយ័ន', 'temple', 13.4413, 103.8587),
  cold('f6dbcff8-da51-56f9-af58-c50158a542a7', 'Pub Street', 'ផ្លូវផាប', 'bar', 13.3549, 103.8558),
  cold('598ae39e-6110-5f45-b68c-fbba736bf2ff', 'Psar Chas', 'ផ្សារចាស់', 'market', 13.3537, 103.8564),

  // Coast
  cold('32399afc-c674-53c8-a2d6-7cbd1abe0fe6', 'Otres Beach', 'ឆ្នេរអូត្រេស', 'viewpoint', 10.5847, 103.5203),
  cold('cb4fc147-b69c-5346-8d69-23d7c1b75bf6', 'Kampot Riverfront', 'មាត់ទន្លេកំពត', 'viewpoint', 10.6104, 104.1812),
  cold('573442d5-03e2-5d99-bac0-4e73b127cd52', 'Kep Crab Market', 'ផ្សារក្តាមកែប', 'restaurant', 10.4833, 104.3),
];
