// ─────────────────────────────────────────────────────────────────────────────
// Catalog invariants.
//
// data/gohubCatalog.ts is generated, so nobody reviews it line by line — 87
// near-identical objects is exactly the kind of diff eyes slide over. These
// tests are what actually reads it.
//
// Every assertion here is a way we could lose money or mislead a customer:
// selling under cost, a SKU that orders the wrong plan, a "from $3.99" badge
// over a page whose cheapest plan is $19.99.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { gohubCatalog } from '@/data/gohubCatalog';
import { destinations, getDestination } from '@/data/destinations';
import { describeAllowance, esimPlans, getPlansForCountry } from '@/data/esimPlans';
import { skuFor } from '@/lib/providers/esim/skuMap';
import { destinationNetworks } from '@/data/gohubNetworks';
import { activationDeadline, policyFor, policyFromSpecs } from '@/data/planPolicy';

const slugs = [...new Set(gohubCatalog.map((plan) => plan.countrySlug))];

describe('catalog integrity', () => {
  it('covers every destination with exactly three tiers', () => {
    for (const destination of destinations) {
      const plans = getPlansForCountry(destination.slug);
      expect(plans, `${destination.slug} has no plans`).toHaveLength(3);
      expect(plans.map((p) => p.tier)).toEqual(['basic', 'standard', 'premium']);
    }
  });

  it('has a destination for every catalog entry', () => {
    for (const slug of slugs) {
      expect(getDestination(slug), `no destination for ${slug}`).toBeDefined();
    }
  });

  it('uses each GoHub SKU only once within a destination', () => {
    // Across destinations a shared SKU is correct and expected: France, Germany,
    // the UK and Europe are all fulfilled by GoHub's single Europe product, and
    // Canada by the USA/Mexico/Canada one. That is what a regional wholesale
    // product is.
    //
    // Within one destination it is a bug — two tiers at different prices would
    // deliver the identical eSIM, and the customer paying more gets nothing extra.
    for (const slug of slugs) {
      const skus = gohubCatalog
        .filter((plan) => plan.countrySlug === slug)
        .map((plan) => plan.gohubSku);
      expect(new Set(skus).size, `${slug} reuses a SKU across tiers`).toBe(skus.length);
    }
  });

  it('maps every plan to a GoHub SKU', () => {
    for (const plan of esimPlans) {
      expect(skuFor('gohub', plan.id), `${plan.id} has no GoHub SKU`).toBeTruthy();
    }
  });
});

describe('pricing invariants', () => {
  it('never sells below cost', () => {
    for (const plan of gohubCatalog) {
      expect(plan.priceUsd, plan.id).toBeGreaterThan(plan.costUsd);
    }
  });

  it('keeps a margin that survives the maximum stacked discount', () => {
    // Discounts cap at 30% (MAX_DISCOUNT_PCT). A plan whose margin is thinner
    // than that can be sold at a loss by anyone with a promo code.
    for (const plan of gohubCatalog) {
      const margin = 1 - plan.costUsd / plan.priceUsd;
      expect(margin, `${plan.id} margin ${(margin * 100).toFixed(1)}%`).toBeGreaterThan(0.3);
    }
  });

  it('prices every plan as a charm price', () => {
    for (const plan of gohubCatalog) {
      expect(Math.round(plan.priceUsd * 100) % 100, plan.id).toBe(99);
    }
  });

  it('climbs in price from basic to premium', () => {
    for (const slug of slugs) {
      const [basic, standard, premium] = getPlansForCountry(slug);
      expect(basic!.priceUsd, slug).toBeLessThan(standard!.priceUsd);
      expect(standard!.priceUsd, slug).toBeLessThan(premium!.priceUsd);
    }
  });

  it('gives a longer plan a lower price per day', () => {
    // The comparison a traveller actually makes. If the 15-day plan costs more
    // per day than the 7-day one, the ladder is arguing against itself.
    const exceptions = new Set(['macao', 'china-hong-kong-macao']);

    for (const slug of slugs) {
      if (exceptions.has(slug)) continue;
      const perDay = getPlansForCountry(slug).map((p) => p.priceUsd / p.durationDays);
      expect(perDay[0], slug).toBeGreaterThan(perDay[1]!);
      expect(perDay[1], slug).toBeGreaterThan(perDay[2]!);
    }
  });

  it('matches each destination’s "from" price to its cheapest plan', () => {
    // The number on the destination card. If it disagrees with the plan page,
    // the customer arrives expecting a price we do not offer.
    for (const destination of destinations) {
      const cheapest = Math.min(...getPlansForCountry(destination.slug).map((p) => p.priceUsd));
      expect(destination.fromPriceUsd, destination.slug).toBe(cheapest);
    }
  });
});

describe('how a plan is described', () => {
  it('never calls a fixed allowance a daily one', () => {
    for (const plan of esimPlans) {
      const text = describeAllowance(plan);
      if (plan.dataType === 'fixed') {
        // Promising "3GB/day" on a plan that gives 3GB for the whole week is a
        // refund, and rightly so.
        expect(text, plan.id).not.toContain('/day');
        expect(text).toBe(`${plan.dataGbTotal}GB total`);
      } else {
        expect(text).toBe(`${plan.dataGbDaily}GB/day`);
      }
    }
  });

  it('keeps all three tiers of a destination on the same allowance model', () => {
    for (const slug of slugs) {
      const types = new Set(getPlansForCountry(slug).map((p) => p.dataType));
      // Mixing "1GB/day" and "3GB total" in one row of cards asks the customer
      // to do arithmetic to compare them, and they will not.
      expect(types.size, `${slug} mixes daily and fixed plans`).toBe(1);
    }
  });

  it('states the allowance in the feature list', () => {
    for (const plan of esimPlans) {
      expect(plan.features.some((f) => f.includes('GB')), plan.id).toBe(true);
    }
  });

  it('marks exactly one plan per destination as popular', () => {
    for (const slug of slugs) {
      const popular = getPlansForCountry(slug).filter((p) => p.popular);
      expect(popular, slug).toHaveLength(1);
      expect(popular[0]!.tier).toBe('standard');
    }
  });
});

describe('the trust surface', () => {
  it('has network facts for every destination', () => {
    for (const slug of slugs) {
      expect(destinationNetworks[slug], `no network data for ${slug}`).toBeDefined();
    }
  });

  it('never lists a country with no carrier behind it', () => {
    for (const [slug, network] of Object.entries(destinationNetworks)) {
      for (const entry of network.coverage) {
        expect(entry.carriers.length, `${slug} → ${entry.country}`).toBeGreaterThan(0);
        // A country label that swallowed a carrier name ("China Telecom
        // Hongkong") is the parser failing, and it would be shown to a customer.
        expect(entry.country.length, `${slug} → ${entry.country}`).toBeLessThan(20);
      }
    }
  });

  it('names a real carrier for every destination', () => {
    for (const slug of slugs) {
      const network = destinationNetworks[slug]!;
      const carriers =
        network.coverage.length > 0
          ? network.coverage.flatMap((c) => c.carriers)
          : network.carriers;
      expect(carriers.length, `${slug} has no carrier`).toBeGreaterThan(0);
    }
  });

  it('claims voice only where the supplier confirms it on that SKU', () => {
    for (const plan of gohubCatalog) {
      expect(typeof plan.callSms, plan.id).toBe('boolean');
      // Every SKU we currently sell is data-only. If this ever flips, the spec
      // sheet must say "Data, calls and SMS" — and it should be a deliberate
      // change, not a silent one.
      expect(plan.callSms, `${plan.id} now claims voice — confirm with GoHub`).toBe(false);
    }
  });

  it('states a speed for every plan', () => {
    for (const plan of gohubCatalog) {
      expect(plan.speed, plan.id).toBeTruthy();
    }
  });

  it('treats unconfirmed policy as unknown rather than guessing', () => {
    // The whole value of a spec sheet is that it can be trusted. A default of
    // "Hotspot: Yes" would be a guess printed as a fact.
    const policy = policyFor('thailand');
    expect(policy.hotspot).toBeNull();
    expect(policy.kycRequired).toBeNull();
    expect(policy.topupAvailable).toBeNull();
    expect(policy.activationWindowDays).toBeNull();
  });

  it('maps GoHub listing specs into a policy when they arrive', () => {
    const policy = policyFromSpecs({
      simType: 'eSIM',
      dataType: 'Daily Data',
      networkType: '4G',
      hotspot: 'Yes',
      kycNeeded: 'No',
      kycLinks: null,
      specialActivation: 'Dial *151*3*1#',
      unsupportedApps: null,
      localPhoneNumber: 'No',
      apnNote: null,
      apnLinks: null,
      activationTime: null,
      activationValidityDays: 30,
    });

    expect(policy.hotspot).toBe(true);
    expect(policy.kycRequired).toBe(false);
    expect(policy.activationWindowDays).toBe(30);
    expect(policy.specialActivation).toBe('Dial *151*3*1#');
  });

  it('computes an activation deadline only when the window is known', () => {
    expect(activationDeadline(policyFor('thailand'))).toBeNull();

    const deadline = activationDeadline(
      { ...policyFor('thailand'), activationWindowDays: 30 },
      new Date('2026-08-11T00:00:00Z')
    );
    expect(deadline?.toISOString().slice(0, 10)).toBe('2026-09-10');
  });
});
