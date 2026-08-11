// ─────────────────────────────────────────────────────────────────────────────
// The customer-facing plan catalog.
//
// Every plan here is a real GoHub SKU at a real wholesale cost — see
// data/gohubCatalog.ts, which is generated from their dealer price list by
// scripts/build-gohub-catalog.mjs. Nothing in this file invents a price.
//
// This module deliberately does NOT re-export `costUsd` or `gohubSku`. Those
// are supplier facts: the browser has no business knowing our margin, and a
// SKU on a product page is a SKU in someone's scraper. Server code that needs
// them imports gohubCatalog directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { EsimPlan } from '@/types';
import { destinations } from './destinations';
import { gohubCatalog } from './gohubCatalog';

const TIER_NAMES: Record<EsimPlan['tier'], string> = {
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
};

const destinationBySlug = new Map(destinations.map((d) => [d.slug, d]));

function featuresFor(plan: (typeof gohubCatalog)[number], countrySlug: string): string[] {
  const features = ['Hotspot / tethering included'];

  // A daily plan cannot be burned through on the first afternoon, which is the
  // single most common complaint about fixed-data travel eSIMs. Say so.
  features.push(
    plan.dataType === 'daily'
      ? `${plan.dataGbDaily}GB every day, resets at midnight`
      : `${plan.dataGbTotal}GB for the whole trip`
  );

  if (countrySlug === 'china' || countrySlug === 'china-hong-kong-macao') {
    features.push('No VPN needed for China');
  }

  features.push('Instant QR delivery', '24/7 Khmer support');
  return features;
}

export const esimPlans: EsimPlan[] = gohubCatalog
  .filter((plan) => destinationBySlug.has(plan.countrySlug))
  .map((plan) => {
    const destination = destinationBySlug.get(plan.countrySlug)!;

    return {
      id: plan.id,
      countrySlug: plan.countrySlug,
      tier: plan.tier,
      name: TIER_NAMES[plan.tier],
      durationDays: plan.durationDays,
      dataType: plan.dataType,
      dataGbDaily: plan.dataGbDaily,
      dataGbTotal: plan.dataGbTotal,
      speed: plan.speed,
      callSms: plan.callSms,
      priceUsd: plan.priceUsd,
      network: destination.networkTech,
      features: featuresFor(plan, plan.countrySlug),
      popular: plan.popular,
    };
  });

export function getPlansForCountry(slug: string): EsimPlan[] {
  return esimPlans.filter((p) => p.countrySlug === slug);
}

export function getPlan(id: string): EsimPlan | undefined {
  return esimPlans.find((p) => p.id === id);
}

/**
 * How the allowance should be written on a card, in one place so the product
 * page, the cart, the email and the chatbot never disagree.
 */
export function describeAllowance(plan: EsimPlan): string {
  return plan.dataType === 'daily' ? `${plan.dataGbDaily}GB/day` : `${plan.dataGbTotal}GB total`;
}

/** Price per day, which is the comparison a traveller actually makes. */
export function pricePerDayUsd(plan: EsimPlan): number {
  return Math.round((plan.priceUsd / plan.durationDays) * 100) / 100;
}
