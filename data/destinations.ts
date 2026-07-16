import type { Destination } from '@/types';

/**
 * HD landscape marketing photos — iconic landmark of each destination.
 * Served from Unsplash (whitelisted in next.config.mjs) at a wide 16:10-ish
 * crop, auto-formatted and quality-tuned for retina hero cards.
 */
const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1400&q=80`;

export const destinations: Destination[] = [
  {
    slug: 'vietnam', name: 'Vietnam', nameKm: 'វៀតណាម', flag: '🇻🇳',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Excellent',
    networkTech: '4G LTE', networks: ['MobiFone', 'Viettel'],
    currency: 'VND', usdRate: 25400, popular: true,
    image: photo('1528127269322-539801943592'), tagline: 'Hạ Long Bay',
  },
  {
    slug: 'thailand', name: 'Thailand', nameKm: 'ថៃ', flag: '🇹🇭',
    region: 'Southeast Asia', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['AIS', 'TrueMove H'],
    currency: 'THB', usdRate: 35.2, popular: true,
    image: photo('1508009603885-50cf7c579365'), tagline: 'Bangkok temples',
  },
  {
    slug: 'china', name: 'China', nameKm: 'ចិន', flag: '🇨🇳',
    region: 'East Asia', fromPriceUsd: 5.99, networkQuality: 'Good',
    networkTech: '4G/5G', networks: ['China Unicom', 'China Mobile'],
    currency: 'CNY', usdRate: 7.1, popular: true,
    image: photo('1508804185872-d7badad00f7d'), tagline: 'The Great Wall',
  },
  {
    slug: 'japan', name: 'Japan', nameKm: 'ជប៉ុន', flag: '🇯🇵',
    region: 'East Asia', fromPriceUsd: 6.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['NTT Docomo', 'SoftBank'],
    currency: 'JPY', usdRate: 152, popular: true,
    image: photo('1493976040374-85c8e12f0c0e'), tagline: 'Mt. Fuji & Chureito',
  },
  {
    slug: 'singapore', name: 'Singapore', nameKm: 'សិង្ហបូរី', flag: '🇸🇬',
    region: 'Southeast Asia', fromPriceUsd: 5.49, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['Singtel', 'StarHub'],
    currency: 'SGD', usdRate: 1.33, popular: true,
    image: photo('1525625293386-3f8f99389edd'), tagline: 'Marina Bay',
  },
  {
    slug: 'south-korea', name: 'South Korea', nameKm: 'កូរ៉េខាងត្បូង', flag: '🇰🇷',
    region: 'East Asia', fromPriceUsd: 5.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['SK Telecom', 'KT'],
    currency: 'KRW', usdRate: 1380, popular: true,
    image: photo('1538485399081-7191377e8241'), tagline: 'Seoul palaces',
  },
  {
    slug: 'malaysia', name: 'Malaysia', nameKm: 'ម៉ាឡេស៊ី', flag: '🇲🇾',
    region: 'Southeast Asia', fromPriceUsd: 4.49, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Maxis', 'Celcom'],
    currency: 'MYR', usdRate: 4.4, popular: true,
    image: photo('1596422846543-75c6fc197f07'), tagline: 'Petronas Towers',
  },
  {
    slug: 'taiwan', name: 'Taiwan', nameKm: 'តៃវ៉ាន់', flag: '🇹🇼',
    region: 'East Asia', fromPriceUsd: 5.49, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['Chunghwa Telecom', 'FarEasTone'],
    currency: 'TWD', usdRate: 32, popular: true,
    image: photo('1470004914212-05527e49370b'), tagline: 'Taipei 101',
  },
  {
    slug: 'hong-kong', name: 'Hong Kong', nameKm: 'ហុងកុង', flag: '🇭🇰',
    region: 'East Asia', fromPriceUsd: 4.99, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['CSL', '3HK'],
    currency: 'HKD', usdRate: 7.8, popular: true,
    image: photo('1536599018102-9f803c140fc1'), tagline: 'Victoria Harbour',
  },
  {
    slug: 'indonesia', name: 'Indonesia', nameKm: 'ឥណ្ឌូនេស៊ី', flag: '🇮🇩',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Telkomsel', 'XL Axiata'],
    currency: 'IDR', usdRate: 15800, popular: true,
    image: photo('1537996194471-e657df975ab4'), tagline: 'Bali temples',
  },
  {
    slug: 'australia', name: 'Australia', nameKm: 'អូស្ត្រាលី', flag: '🇦🇺',
    region: 'Oceania', fromPriceUsd: 8.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['Telstra', 'Optus'],
    currency: 'AUD', usdRate: 1.52, popular: true,
    image: photo('1523482580672-f109ba8cb9be'), tagline: 'Sydney Harbour',
  },
  {
    slug: 'usa', name: 'USA', nameKm: 'អាមេរិក', flag: '🇺🇸',
    region: 'Americas', fromPriceUsd: 7.99, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['T-Mobile', 'AT&T'],
    currency: 'USD', usdRate: 1, popular: true,
    image: photo('1485871981521-5b1fd3805eee'), tagline: 'New York City',
  },
  {
    slug: 'france', name: 'France', nameKm: 'បារាំង', flag: '🇫🇷',
    region: 'Europe', fromPriceUsd: 6.49, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['Orange', 'SFR'],
    currency: 'EUR', usdRate: 0.92, popular: false,
    image: photo('1502602898657-3e91760cbb34'), tagline: 'Paris & the Eiffel',
  },
  {
    slug: 'united-kingdom', name: 'United Kingdom', nameKm: 'ចក្រភពអង់គ្លេស', flag: '🇬🇧',
    region: 'Europe', fromPriceUsd: 6.49, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['EE', 'Vodafone'],
    currency: 'GBP', usdRate: 0.78, popular: false,
    image: photo('1513635269975-59663e0ac1ad'), tagline: 'London & Big Ben',
  },
  {
    slug: 'germany', name: 'Germany', nameKm: 'អាល្លឺម៉ង់', flag: '🇩🇪',
    region: 'Europe', fromPriceUsd: 6.49, networkQuality: 'Excellent',
    networkTech: '4G/5G', networks: ['Deutsche Telekom', 'O2'],
    currency: 'EUR', usdRate: 0.92, popular: false,
    image: photo('1467269204594-9661b134dd2b'), tagline: 'Berlin skyline',
  },
  {
    slug: 'uae', name: 'UAE', nameKm: 'អេមីរ៉ាតអារ៉ាប់រួម', flag: '🇦🇪',
    region: 'Middle East', fromPriceUsd: 7.49, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['Etisalat', 'du'],
    currency: 'AED', usdRate: 3.67, popular: false,
    image: photo('1512453979798-5ea266f8880c'), tagline: 'Dubai & Burj Khalifa',
  },
  {
    slug: 'india', name: 'India', nameKm: 'ឥណ្ឌា', flag: '🇮🇳',
    region: 'Asia', fromPriceUsd: 4.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Jio', 'Airtel'],
    currency: 'INR', usdRate: 84, popular: false,
    image: photo('1524492412937-b28074a5d7da'), tagline: 'The Taj Mahal',
  },
  {
    slug: 'philippines', name: 'Philippines', nameKm: 'ហ្វីលីពីន', flag: '🇵🇭',
    region: 'Southeast Asia', fromPriceUsd: 4.49, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Globe', 'Smart'],
    currency: 'PHP', usdRate: 58, popular: false,
    image: photo('1518509562904-e7ef99cdcc86'), tagline: 'Palawan islands',
  },
  {
    slug: 'laos', name: 'Laos', nameKm: 'ឡាវ', flag: '🇱🇦',
    region: 'Southeast Asia', fromPriceUsd: 3.99, networkQuality: 'Good',
    networkTech: '4G LTE', networks: ['Lao Telecom', 'Unitel'],
    currency: 'LAK', usdRate: 21800, popular: false,
    image: photo('1528181304800-259b08848526'), tagline: 'Luang Prabang',
  },
  {
    slug: 'canada', name: 'Canada', nameKm: 'កាណាដា', flag: '🇨🇦',
    region: 'Americas', fromPriceUsd: 8.49, networkQuality: 'Excellent',
    networkTech: '5G', networks: ['Rogers', 'Bell'],
    currency: 'CAD', usdRate: 1.38, popular: false,
    image: photo('1517935706615-2717063c2225'), tagline: 'Banff & the Rockies',
  },
];

export const USD_TO_KHR = 4100;

export function getDestination(slug: string): Destination | undefined {
  return destinations.find((d) => d.slug === slug);
}

export const popularDestinations = destinations.filter((d) => d.popular);
