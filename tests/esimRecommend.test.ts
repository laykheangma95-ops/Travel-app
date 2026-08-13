import { describe, expect, it } from 'vitest';
import {
  USAGE_PROFILES,
  effectiveGb,
  estimateData,
  explainRecommendation,
  recommendPlan,
  type UsageProfile,
} from '@/lib/esim/recommend';
import { esimPlans } from '@/data/esimPlans';
import type { EsimPlan } from '@/types';

// The finder's whole claim to trust is that it is reproducible and never
// recommends a plan that will run out. These tests hold it to both.

function plansFor(slug: string): EsimPlan[] {
  return esimPlans.filter((p) => p.countrySlug === slug);
}

const COUNTRY = esimPlans[0].countrySlug;

function makePlan(over: Partial<EsimPlan>): EsimPlan {
  return {
    id: 'test',
    countrySlug: 'testland',
    tier: 'standard',
    name: 'Standard',
    durationDays: 10,
    dataType: 'fixed',
    dataGbDaily: 1,
    dataGbTotal: 10,
    speed: '4G/5G',
    callSms: false,
    priceUsd: 20,
    network: '4G/5G',
    features: [],
    popular: false,
    ...over,
  };
}

describe('estimateData', () => {
  it('is deterministic — same answers, same number', () => {
    const a = estimateData(7, ['social', 'maps']);
    const b = estimateData(7, ['social', 'maps']);
    expect(a).toEqual(b);
  });

  it('charges a baseline even when nothing is selected', () => {
    // Background OS traffic is not optional, and a customer who picks nothing
    // still needs data. A zero estimate would recommend the smallest plan.
    expect(estimateData(5, []).rawMb).toBeGreaterThan(0);
  });

  it('grows with days and with the number of activities', () => {
    expect(estimateData(10, ['social']).rawMb).toBeGreaterThan(
      estimateData(5, ['social']).rawMb
    );
    expect(estimateData(5, ['social', 'video']).rawMb).toBeGreaterThan(
      estimateData(5, ['social']).rawMb
    );
  });

  it('pads the estimate upward — running out abroad costs more than a spare GB', () => {
    const { rawMb, targetMb } = estimateData(7, ['social']);
    expect(targetMb).toBeGreaterThan(rawMb);
  });

  it('rates video as the heaviest activity', () => {
    const video = USAGE_PROFILES.find((p) => p.id === 'video')!;
    for (const other of USAGE_PROFILES.filter((p) => p.id !== 'video')) {
      expect(video.mbPerDay).toBeGreaterThan(other.mbPerDay);
    }
  });
});

describe('effectiveGb', () => {
  it('caps a daily plan at the length of the trip, not the plan', () => {
    // A 30-day 1GB/day plan is 5GB to someone travelling for 5 days. Counting
    // it as 30GB would recommend a long plan for a short trip and call it
    // generous.
    const plan = makePlan({ dataType: 'daily', dataGbDaily: 1, durationDays: 30 });
    expect(effectiveGb(plan, 5)).toBe(5);
  });

  it('gives a fixed plan its full pot regardless of trip length', () => {
    const plan = makePlan({ dataType: 'fixed', dataGbTotal: 10, durationDays: 30 });
    expect(effectiveGb(plan, 5)).toBe(10);
  });
});

describe('recommendPlan', () => {
  it('never recommends a plan shorter than the trip', () => {
    const plans = plansFor(COUNTRY);
    for (const days of [3, 7, 14, 30]) {
      const rec = recommendPlan(plans, days, ['social']);
      if (rec.best) expect(rec.best.plan.durationDays).toBeGreaterThanOrEqual(days);
    }
  });

  it('picks the cheapest plan that covers the estimate, not the biggest', () => {
    const plans = [
      makePlan({ id: 'small', dataGbTotal: 1, priceUsd: 5 }),
      makePlan({ id: 'right', dataGbTotal: 8, priceUsd: 15 }),
      makePlan({ id: 'huge', dataGbTotal: 50, priceUsd: 60 }),
    ];
    // 5 days of maps only is a small estimate — well under 8GB.
    const rec = recommendPlan(plans, 5, ['maps']);
    expect(rec.best?.plan.id).toBe('right');
    expect(rec.shortfall).toBe(false);
  });

  it('does not upsell: the pick is never more expensive than a covering alternative', () => {
    const plans = plansFor(COUNTRY);
    const rec = recommendPlan(plans, 7, ['social', 'maps']);
    if (!rec.best || rec.shortfall) return;

    const cheaperThatCovers = plans
      .filter((p) => p.durationDays >= 7)
      .filter((p) => p.priceUsd < rec.best!.plan.priceUsd)
      .filter((p) => effectiveGb(p, 7) >= rec.estimate.targetGb);

    expect(cheaperThatCovers).toHaveLength(0);
  });

  it('flags a shortfall instead of quietly recommending a plan that runs out', () => {
    const plans = [makePlan({ dataGbTotal: 1, priceUsd: 5, durationDays: 30 })];
    // 30 days of video against a single 1GB plan cannot be covered.
    const rec = recommendPlan(plans, 30, ['video', 'hotspot']);
    expect(rec.shortfall).toBe(true);
    // It still offers the largest thing available rather than nothing at all.
    expect(rec.best).not.toBeNull();
  });

  it('reports a shortfall when no plan is long enough for the trip', () => {
    const plans = [makePlan({ durationDays: 3 })];
    const rec = recommendPlan(plans, 30, ['social']);
    expect(rec.shortfall).toBe(true);
    expect(rec.best).toBeNull();
  });

  it('offers alternatives that are genuinely different, not duplicates', () => {
    const rec = recommendPlan(plansFor(COUNTRY), 7, ['social']);
    if (rec.lighter && rec.best) {
      expect(rec.lighter.plan.id).not.toBe(rec.best.plan.id);
      expect(rec.lighter.plan.priceUsd).toBeLessThan(rec.best.plan.priceUsd);
    }
    if (rec.safer && rec.best) {
      expect(rec.safer.plan.id).not.toBe(rec.best.plan.id);
    }
  });

  it('labels every alternative with the difference that is actually true of it', () => {
    // The regression this guards: a "more data" label sitting above a plan with
    // the same data and a longer validity, which is most of the catalogue.
    const slugs = [...new Set(esimPlans.map((p) => p.countrySlug))];

    for (const slug of slugs) {
      for (const days of [3, 5, 7, 10, 14]) {
        const rec = recommendPlan(plansFor(slug), days, ['social', 'maps']);
        const { best, lighter, safer } = rec;
        if (!best || rec.shortfall) continue;

        if (lighter) {
          expect(lighter.reason).toBe('cheaper');
          expect(lighter.plan.priceUsd).toBeLessThan(best.plan.priceUsd);
        }

        if (safer) {
          expect(safer.plan.priceUsd).toBeGreaterThanOrEqual(best.plan.priceUsd);
          if (safer.reason === 'more_per_day') {
            expect(safer.plan.dataGbDaily).toBeGreaterThan(best.plan.dataGbDaily);
          } else if (safer.reason === 'more_total') {
            expect(safer.effectiveGb).toBeGreaterThan(best.effectiveGb);
          } else if (safer.reason === 'longer_validity') {
            expect(safer.plan.durationDays).toBeGreaterThan(best.plan.durationDays);
          } else {
            throw new Error(`alternative with no reason: ${safer.plan.id}`);
          }
        }
      }
    }
  });

  it('offers an alternative whenever the catalogue actually contains one', () => {
    // The regression this guards: the first version of these two slots was
    // defined so narrowly against GoHub's thin per-country range that it fired
    // on 2 of 142 real (destination, trip length) pairs — the alternatives were
    // effectively dead code and the customer only ever saw one option.
    //
    // The bar is not a percentage. It is: if more than one plan is long enough
    // for the trip, the screen must show more than one plan. Where the
    // catalogue genuinely holds a single candidate there is nothing honest to
    // put in the slot, and 57 of the 142 pairs are that case.
    const slugs = [...new Set(esimPlans.map((p) => p.countrySlug))];
    let withChoice = 0;

    for (const slug of slugs) {
      for (const days of [3, 5, 7, 10, 14]) {
        const plans = plansFor(slug);
        const rec = recommendPlan(plans, days, ['social', 'maps']);
        if (!rec.best) continue;

        const candidates = plans.filter((p) => p.durationDays >= days);
        if (candidates.length <= 1) continue;

        withChoice++;
        expect(
          rec.lighter ?? rec.safer,
          `${slug} at ${days} days has ${candidates.length} candidates but offered no alternative`
        ).not.toBeNull();
      }
    }

    expect(withChoice).toBeGreaterThan(50);
  });

  it('handles an empty catalogue without throwing', () => {
    const rec = recommendPlan([], 5, ['social']);
    expect(rec.best).toBeNull();
    expect(rec.shortfall).toBe(true);
  });

  it('survives every real destination at every common trip length', () => {
    const slugs = [...new Set(esimPlans.map((p) => p.countrySlug))];
    const combos: UsageProfile[][] = [[], ['social'], ['video', 'hotspot']];

    for (const slug of slugs) {
      for (const days of [1, 5, 14, 30]) {
        for (const profiles of combos) {
          const rec = recommendPlan(plansFor(slug), days, profiles);
          // Whatever it returns, it must be internally consistent: a pick that
          // is not flagged as a shortfall really does cover the estimate.
          if (rec.best && !rec.shortfall) {
            expect(rec.best.effectiveGb).toBeGreaterThanOrEqual(rec.estimate.targetGb);
          }
        }
      }
    }
  });
});

describe('explainRecommendation', () => {
  it('states the estimate and what the plan gives, in both languages', () => {
    const rec = recommendPlan(plansFor(COUNTRY), 7, ['social', 'maps']);
    for (const lang of ['en', 'km'] as const) {
      const text = explainRecommendation(rec, 7, ['social', 'maps'], lang);
      expect(text.length).toBeGreaterThan(10);
      expect(text).toContain('7');
    }
  });

  it('does not promise spare data when there is a shortfall', () => {
    const plans = [makePlan({ dataGbTotal: 1, priceUsd: 5, durationDays: 30 })];
    const rec = recommendPlan(plans, 30, ['video']);
    expect(explainRecommendation(rec, 30, ['video'], 'en')).not.toContain('spare');
  });
});
