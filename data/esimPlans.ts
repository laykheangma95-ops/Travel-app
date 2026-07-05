import type { EsimPlan } from '@/types';
import { destinations } from './destinations';

// Pricing multipliers by tier applied to each destination's base price.
const TIERS = [
  { tier: 'basic' as const, name: 'Basic', durationDays: 3, dataGbDaily: 1, multiplier: 1, popular: false },
  { tier: 'standard' as const, name: 'Standard', durationDays: 7, dataGbDaily: 2, multiplier: 2, popular: true },
  { tier: 'premium' as const, name: 'Premium', durationDays: 15, dataGbDaily: 3, multiplier: 3.75, popular: false },
];

function roundPrice(n: number): number {
  return Math.round(n * 2) / 2 - 0.01;
}

export const esimPlans: EsimPlan[] = destinations.flatMap((dest) =>
  TIERS.map((t) => ({
    id: `${dest.slug}-${t.tier}`,
    countrySlug: dest.slug,
    tier: t.tier,
    name: t.name,
    durationDays: t.durationDays,
    dataGbDaily: t.dataGbDaily,
    priceUsd: roundPrice(dest.fromPriceUsd * t.multiplier),
    network: t.tier === 'premium' && dest.networkTech !== '4G LTE' ? '4G/5G' : dest.networkTech,
    features: [
      'Hotspot / tethering included',
      dest.slug === 'china'
        ? t.tier === 'premium'
          ? 'No VPN needed for China'
          : 'No VPN needed'
        : 'No VPN needed',
      'Instant QR delivery',
      '24/7 Khmer support',
    ],
    popular: t.popular,
  }))
);

export function getPlansForCountry(slug: string): EsimPlan[] {
  return esimPlans.filter((p) => p.countrySlug === slug);
}

export function getPlan(id: string): EsimPlan | undefined {
  return esimPlans.find((p) => p.id === id);
}
