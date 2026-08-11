import type { Destination } from '@/types';

export const destinations: Destination[] = [
  {
    slug: 'vietnam', name: 'Vietnam', nameKm: 'វៀតណាម', flag: '🇻🇳',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '4G LTE', networks: ['MobiFone', 'Viettel'],
    currency: 'VND', usdRate: 25400, popular: true,
  },
  {
    slug: 'thailand', name: 'Thailand', nameKm: 'ថៃ', flag: '🇹🇭',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['AIS', 'TrueMove H'],
    currency: 'THB', usdRate: 35.2, popular: true,
  },
  {
    slug: 'china', name: 'China', nameKm: 'ចិន', flag: '🇨🇳',
    region: 'East Asia', fromPriceUsd: 3.99, networkQuality: 'Good',
    networkTech: '4G/5G', networks: ['China Unicom', 'China Mobile'],
    currency: 'CNY', usdRate: 7.1, popular: true,
  },
  {
    slug: 'japan', name: 'Japan', nameKm: 'ជប៉ុន', flag: '🇯🇵',
    region: 'East Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['NTT Docomo', 'SoftBank'],
    currency: 'JPY', usdRate: 152, popular: true,
  },
  {
    slug: 'singapore', name: 'Singapore', nameKm: 'សិង្ហបូរី', flag: '🇸🇬',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['Singtel', 'StarHub'],
    currency: 'SGD', usdRate: 1.33, popular: true,
  },
  {
    slug: 'south-korea', name: 'South Korea', nameKm: 'កូរ៉េខាងត្បូង', flag: '🇰🇷',
    region: 'East Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['SK Telecom', 'KT'],
    currency: 'KRW', usdRate: 1380, popular: true,
  },
  {
    slug: 'malaysia', name: 'Malaysia', nameKm: 'ម៉ាឡេស៊ី', flag: '🇲🇾',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Maxis', 'Celcom'],
    currency: 'MYR', usdRate: 4.4, popular: true,
  },
  {
    slug: 'taiwan', name: 'Taiwan', nameKm: 'តៃវ៉ាន់', flag: '🇹🇼',
    region: 'East Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['Chunghwa Telecom', 'FarEasTone'],
    currency: 'TWD', usdRate: 32, popular: true,
  },
  {
    slug: 'hong-kong', name: 'Hong Kong', nameKm: 'ហុងកុង', flag: '🇭🇰',
    region: 'East Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['CSL', '3HK'],
    currency: 'HKD', usdRate: 7.8, popular: true,
  },
  {
    slug: 'indonesia', name: 'Indonesia', nameKm: 'ឥណ្ឌូនេស៊ី', flag: '🇮🇩',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Telkomsel', 'XL Axiata'],
    currency: 'IDR', usdRate: 15800, popular: true,
  },
  {
    slug: 'australia', name: 'Australia', nameKm: 'អូស្ត្រាលី', flag: '🇦🇺',
    region: 'Oceania', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['Telstra', 'Optus'],
    currency: 'AUD', usdRate: 1.52, popular: true,
  },
  {
    slug: 'usa', name: 'USA', nameKm: 'អាមេរិក', flag: '🇺🇸',
    region: 'Americas', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['T-Mobile', 'AT&T'],
    currency: 'USD', usdRate: 1, popular: true,
  },
  {
    slug: 'france', name: 'France', nameKm: 'បារាំង', flag: '🇫🇷',
    region: 'Europe', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['Orange', 'SFR'],
    currency: 'EUR', usdRate: 0.92, popular: false,
  },
  {
    slug: 'united-kingdom', name: 'United Kingdom', nameKm: 'ចក្រភពអង់គ្លេស', flag: '🇬🇧',
    region: 'Europe', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['EE', 'Vodafone'],
    currency: 'GBP', usdRate: 0.78, popular: false,
  },
  {
    slug: 'germany', name: 'Germany', nameKm: 'អាល្លឺម៉ង់', flag: '🇩🇪',
    region: 'Europe', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['Deutsche Telekom', 'O2'],
    currency: 'EUR', usdRate: 0.92, popular: false,
  },
  {
    slug: 'uae', name: 'UAE', nameKm: 'អេមីរ៉ាតអារ៉ាប់រួម', flag: '🇦🇪',
    region: 'Middle East', fromPriceUsd: 44.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['Etisalat', 'du'],
    currency: 'AED', usdRate: 3.67, popular: false,
  },
  {
    slug: 'india', name: 'India', nameKm: 'ឥណ្ឌា', flag: '🇮🇳',
    region: 'Asia', fromPriceUsd: 19.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Jio', 'Airtel'],
    currency: 'INR', usdRate: 84, popular: false,
  },
  {
    slug: 'philippines', name: 'Philippines', nameKm: 'ហ្វីលីពីន', flag: '🇵🇭',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Globe', 'Smart'],
    currency: 'PHP', usdRate: 58, popular: false,
  },
  {
    slug: 'laos', name: 'Laos', nameKm: 'ឡាវ', flag: '🇱🇦',
    region: 'Southeast Asia', fromPriceUsd: 11.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Lao Telecom', 'Unitel'],
    currency: 'LAK', usdRate: 21800, popular: false,
  },
  {
    slug: 'canada', name: 'Canada', nameKm: 'កាណាដា', flag: '🇨🇦',
    region: 'Americas', fromPriceUsd: 14.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['Rogers', 'Bell'],
    currency: 'CAD', usdRate: 1.38, popular: false,
  },

  // ── Cambodia ───────────────────────────────────────────────────────────────
  // Our own market. A Khmer traveller coming home, or a visitor landing at PNH
  // who wants data before they reach the SIM counter.
  {
    slug: 'cambodia', name: 'Cambodia', nameKm: 'កម្ពុជា', flag: '🇰🇭',
    region: 'Southeast Asia', fromPriceUsd: 5.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Cellcard', 'Smart Axiata'],
    currency: 'KHR', usdRate: 4100, popular: true,
  },
  {
    slug: 'macao', name: 'Macao', nameKm: 'ម៉ាកាវ', flag: '🇲🇴',
    region: 'East Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['CTM', '3 Macau'],
    currency: 'MOP', usdRate: 8.03, popular: false,
  },
  {
    slug: 'turkey', name: 'Turkey', nameKm: 'ទួរគី', flag: '🇹🇷',
    region: 'Middle East', fromPriceUsd: 5.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Turkcell', 'Vodafone TR'],
    currency: 'TRY', usdRate: 34, popular: false,
  },

  // ── Regional bundles ───────────────────────────────────────────────────────
  // One eSIM across several countries. For a Khmer traveller these are usually
  // the right buy — a Bangkok–Singapore–KL trip on one plan beats three.
  {
    slug: 'southeast-asia', name: 'Southeast Asia', nameKm: 'អាស៊ីអាគ្នេយ៍', flag: '🌏',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Good',
    networkTech: '4G/5G', networks: ['Multiple carriers, 8 countries'],
    currency: 'USD', usdRate: 1, popular: true,
  },
  {
    slug: 'singapore-malaysia-indonesia', name: 'Singapore · Malaysia · Indonesia',
    nameKm: 'សិង្ហបូរី · ម៉ាឡេស៊ី · ឥណ្ឌូនេស៊ី', flag: '🌏',
    region: 'Southeast Asia', fromPriceUsd: 5.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['Singtel', 'Maxis', 'Telkomsel'],
    currency: 'USD', usdRate: 1, popular: false,
  },
  {
    slug: 'hong-kong-macao', name: 'Hong Kong · Macao', nameKm: 'ហុងកុង · ម៉ាកាវ', flag: '🌏',
    region: 'East Asia', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['CSL', 'CTM'],
    currency: 'HKD', usdRate: 7.8, popular: false,
  },
  {
    slug: 'china-hong-kong-macao', name: 'China · Hong Kong · Macao',
    nameKm: 'ចិន · ហុងកុង · ម៉ាកាវ', flag: '🌏',
    region: 'East Asia', fromPriceUsd: 5.99, networkQuality: 'Good',
    networkTech: '4G/5G', networks: ['China Unicom', 'CSL', 'CTM'],
    currency: 'CNY', usdRate: 7.1, popular: false,
  },
  {
    slug: 'europe', name: 'Europe', nameKm: 'អឺរ៉ុប', flag: '🌍',
    region: 'Europe', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['Multiple carriers, 30+ countries'],
    currency: 'EUR', usdRate: 0.92, popular: true,
  },
  {
    slug: 'usa-mexico-canada', name: 'USA · Mexico · Canada',
    nameKm: 'អាមេរិក · ម៉ិកស៊ិក · កាណាដា', flag: '🌎',
    region: 'Americas', fromPriceUsd: 14.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['T-Mobile', 'Telcel', 'Rogers'],
    currency: 'USD', usdRate: 1, popular: false,
  },
];

export const USD_TO_KHR = 4100;

export function getDestination(slug: string): Destination | undefined {
  return destinations.find((d) => d.slug === slug);
}

export const popularDestinations = destinations.filter((d) => d.popular);
