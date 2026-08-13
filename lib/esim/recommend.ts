// ─────────────────────────────────────────────────────────────────────────────
// The plan finder's brain.
//
// Four questions in, one honest recommendation out. No AI, no model call — a
// table of daily data estimates and some arithmetic. That is deliberate:
//
//   1. It cannot hallucinate a plan we do not sell. Every result is a real
//      EsimPlan from the real GoHub catalogue.
//   2. It is testable. The same answers always give the same plan, so when a
//      customer says "it told me 3GB and I ran out", we can reproduce it.
//   3. It works offline and costs nothing per run.
//
// WHERE THE NUMBERS COME FROM: they are conservative field estimates, not
// supplier facts. They are the one part of this file that is a judgement call,
// so they live in one table with the reasoning written next to them and can be
// corrected in a single edit. If real usage data ever contradicts them, change
// the table — not the arithmetic below it.
// ─────────────────────────────────────────────────────────────────────────────

import type { EsimPlan } from '@/types';

// ── The estimate table ───────────────────────────────────────────────────────

export type UsageProfile = 'social' | 'maps' | 'work' | 'video' | 'hotspot';

interface ProfileSpec {
  id: UsageProfile;
  label: { en: string; km: string };
  /** One line explaining what this covers, shown under the option. */
  hint: { en: string; km: string };
  emoji: string;
  /**
   * Megabytes per day this activity adds. Sized for a traveler who is out of
   * the hotel most of the day, not someone on Wi-Fi from 6pm.
   */
  mbPerDay: number;
}

export const USAGE_PROFILES: ProfileSpec[] = [
  {
    id: 'social',
    label: { en: 'Social media & chat', km: 'បណ្ដាញសង្គម និងឆាត' },
    hint: {
      en: 'Facebook, TikTok, Telegram, photos to family',
      km: 'Facebook, TikTok, Telegram, ផ្ញើរូបទៅគ្រួសារ',
    },
    emoji: '💬',
    // Scrolling a video feed is the expensive half of this. A cautious hour a
    // day of TikTok alone is roughly 200MB.
    mbPerDay: 280,
  },
  {
    id: 'maps',
    label: { en: 'Maps & getting around', km: 'ផែនទី និងការធ្វើដំណើរ' },
    hint: {
      en: 'Google Maps, Grab, translation, searching places',
      km: 'Google Maps, Grab, បកប្រែ, ស្វែងរកទីកន្លែង',
    },
    emoji: '🗺️',
    // Navigation is far cheaper than people fear — vector tiles, cached.
    mbPerDay: 80,
  },
  {
    id: 'work',
    label: { en: 'Work & email', km: 'ការងារ និងអ៊ីមែល' },
    hint: {
      en: 'Email, documents, occasional video call',
      km: 'អ៊ីមែល ឯកសារ និងការហៅវីដេអូម្ដងម្កាល',
    },
    emoji: '💼',
    // Email and docs are small; the video call is what moves this number.
    mbPerDay: 350,
  },
  {
    id: 'video',
    label: { en: 'Video streaming', km: 'មើលវីដេអូ' },
    hint: {
      en: 'YouTube, Netflix, live streaming',
      km: 'YouTube, Netflix, ផ្សាយផ្ទាល់',
    },
    emoji: '📺',
    // ~1GB/hour at 720p. Assumes a bit under two hours a day.
    mbPerDay: 1500,
  },
  {
    id: 'hotspot',
    label: { en: 'Share hotspot', km: 'ចែករំលែក Hotspot' },
    hint: {
      en: 'Another phone or a laptop connects through you',
      km: 'ទូរស័ព្ទ ឬកុំព្យូទ័រផ្សេងភ្ជាប់តាមអ្នក',
    },
    emoji: '📶',
    // A second device roughly doubles a light user. Laptops also sync and
    // update the moment they see a connection, which phones do not.
    mbPerDay: 600,
  },
];

/**
 * Background traffic nobody chooses: OS updates, app refresh, notifications,
 * the browser. Added to every estimate regardless of what was selected.
 */
const BASELINE_MB_PER_DAY = 120;

/**
 * Headroom on top of the estimate. Running out abroad is a support ticket, a
 * refund request and a bad review; buying 1GB more than needed is a dollar.
 * The asymmetry is the whole argument for padding upward.
 */
const HEADROOM = 1.25;

const MB_PER_GB = 1024;

// ── The calculation ──────────────────────────────────────────────────────────

export interface FinderAnswers {
  countrySlug: string | null;
  days: number | null;
  profiles: UsageProfile[];
}

export interface DataEstimate {
  /** What we think they will actually use, in MB. */
  rawMb: number;
  /** rawMb with headroom — the number we shop against. */
  targetMb: number;
  targetGb: number;
  perDayMb: number;
}

export function estimateData(days: number, profiles: UsageProfile[]): DataEstimate {
  const selected = USAGE_PROFILES.filter((p) => profiles.includes(p.id));
  const perDayMb =
    BASELINE_MB_PER_DAY + selected.reduce((sum, p) => sum + p.mbPerDay, 0);

  const rawMb = perDayMb * days;
  const targetMb = Math.round(rawMb * HEADROOM);

  return {
    rawMb,
    targetMb,
    targetGb: Math.round((targetMb / MB_PER_GB) * 10) / 10,
    perDayMb,
  };
}

/**
 * How much data a plan really gives over `days`.
 *
 * A daily plan refills at midnight, so its useful total is capped by the trip
 * length, not the plan length: a 30-day 1GB/day plan on a 5-day trip is 5GB to
 * this traveler, not 30GB. Pretending otherwise would recommend a long plan for
 * a short trip and call it generous.
 */
export function effectiveGb(plan: EsimPlan, days: number): number {
  if (plan.dataType === 'daily') {
    return plan.dataGbDaily * Math.min(plan.durationDays, days);
  }
  return plan.dataGbTotal;
}

export type FitVerdict = 'ideal' | 'tight' | 'generous';

/**
 * Why an alternative is on screen. Derived from the actual difference against
 * the recommended plan, never assumed.
 *
 * This exists because the honest label depends on the catalogue, not on the
 * slot. GoHub's range is thin per country — Japan has exactly two plans of 7
 * days or more, both 1GB/day — so a slot hardcoded to say "more data" would
 * frequently sit above a plan offering the same data for longer. Naming the
 * real difference is the only version a customer can act on.
 */
export type AlternativeReason =
  | 'cheaper'
  | 'more_per_day'
  | 'more_total'
  | 'longer_validity';

export interface PlanMatch {
  plan: EsimPlan;
  effectiveGb: number;
  /** effectiveGb ÷ what they need. 1.0 is exactly enough. */
  coverage: number;
  verdict: FitVerdict;
  /** Only set on the alternatives, never on `best`. */
  reason?: AlternativeReason;
}

export interface Recommendation {
  estimate: DataEstimate;
  /** The plan we lead with. Null when nothing in the catalogue can cover them. */
  best: PlanMatch | null;
  /** Costs less than the pick. Null when the pick is already the cheapest. */
  lighter: PlanMatch | null;
  /** More headroom than the pick — more data, or more days to use it. */
  safer: PlanMatch | null;
  /**
   * True when no plan covers the estimate. The UI must say so plainly and
   * offer the largest plan we have rather than silently recommending one that
   * will run out.
   */
  shortfall: boolean;
}

function verdictFor(coverage: number): FitVerdict {
  if (coverage < 1) return 'tight';
  if (coverage > 1.8) return 'generous';
  return 'ideal';
}

function toMatch(plan: EsimPlan, days: number, targetGb: number): PlanMatch {
  const gb = effectiveGb(plan, days);
  const coverage = targetGb > 0 ? gb / targetGb : 1;
  return { plan, effectiveGb: gb, coverage, verdict: verdictFor(coverage) };
}

/**
 * Pick a plan for these answers out of `plans` (already filtered to the country
 * by the caller).
 *
 * The rule: among plans long enough for the trip and big enough for the
 * estimate, take the cheapest. Not the biggest, not the most profitable — the
 * cheapest that works. A finder that quietly upsells is a finder nobody trusts
 * twice, and trust is what makes them come back for the next trip.
 */
export function recommendPlan(
  plans: EsimPlan[],
  days: number,
  profiles: UsageProfile[]
): Recommendation {
  const estimate = estimateData(days, profiles);
  const targetGb = estimate.targetMb / MB_PER_GB;

  // A plan shorter than the trip leaves them dark on the last days. It is not
  // a cheaper option, it is a broken one.
  const longEnough = plans.filter((p) => p.durationDays >= days);

  if (longEnough.length === 0) {
    return { estimate, best: null, lighter: null, safer: null, shortfall: true };
  }

  const matches = longEnough
    .map((plan) => toMatch(plan, days, targetGb))
    .sort((a, b) => a.plan.priceUsd - b.plan.priceUsd);

  const covering = matches.filter((m) => m.coverage >= 1);

  if (covering.length === 0) {
    // Nothing is big enough. Lead with the most data available and be honest
    // about it rather than recommending a plan we know will run out.
    const biggest = [...matches].sort((a, b) => b.effectiveGb - a.effectiveGb)[0];
    return { estimate, best: biggest, lighter: null, safer: null, shortfall: true };
  }

  const best = covering[0];
  const others = matches.filter((m) => m.plan.id !== best.plan.id);

  // ── Cheaper ──
  // The best plan is already the cheapest that covers the estimate, so anything
  // cheaper is by definition tighter on data. That is a legitimate choice for
  // someone who thinks we over-estimated them, as long as the screen says so.
  // Take the most generous of the cheaper options rather than the very cheapest,
  // which would usually be a 1-day plan.
  const lighter =
    others
      .filter((m) => m.plan.priceUsd < best.plan.priceUsd)
      .sort((a, b) => b.effectiveGb - a.effectiveGb)
      .map((m) => ({ ...m, reason: 'cheaper' as const }))[0] ?? null;

  // ── More headroom ──
  // Checked in the order a customer would care about: more data per day beats
  // more data in total, which beats simply having longer to use the same
  // allowance. Whichever matches is what the card is labelled.
  const safer = pickSafer(others, best);

  return { estimate, best, lighter, safer, shortfall: false };
}

function pickSafer(others: PlanMatch[], best: PlanMatch): PlanMatch | null {
  const dearer = others.filter((m) => m.plan.priceUsd >= best.plan.priceUsd);

  const morePerDay = dearer
    .filter((m) => m.plan.dataGbDaily > best.plan.dataGbDaily)
    .sort((a, b) => a.plan.priceUsd - b.plan.priceUsd)[0];
  if (morePerDay) return { ...morePerDay, reason: 'more_per_day' };

  const moreTotal = dearer
    .filter((m) => m.effectiveGb > best.effectiveGb)
    .sort((a, b) => a.plan.priceUsd - b.plan.priceUsd)[0];
  if (moreTotal) return { ...moreTotal, reason: 'more_total' };

  // Same data, more days to use it. Genuinely useful when a trip might extend,
  // and the only alternative many destinations have.
  const longer = dearer
    .filter((m) => m.plan.durationDays > best.plan.durationDays)
    .sort((a, b) => a.plan.priceUsd - b.plan.priceUsd)[0];
  if (longer) return { ...longer, reason: 'longer_validity' };

  return null;
}

// ── Explaining it in words ───────────────────────────────────────────────────

/**
 * The sentence under the recommendation.
 *
 * This is not decoration. A number with no reasoning gets second-guessed, and a
 * second-guessed recommendation gets abandoned. Saying "8 days of maps and
 * social media is about 3GB, this gives you 5GB" is what turns a guess into
 * advice.
 */
export function explainRecommendation(
  rec: Recommendation,
  days: number,
  profiles: UsageProfile[],
  lang: 'en' | 'km'
): string {
  const names = USAGE_PROFILES.filter((p) => profiles.includes(p.id)).map(
    (p) => p.label[lang].toLowerCase()
  );

  const activityEn = names.length === 0 ? 'light use' : joinList(names, 'and');
  const activityKm = names.length === 0 ? 'ការប្រើប្រាស់តិចតួច' : names.join(' និង ');

  const needGb = rec.estimate.targetGb;

  if (!rec.best) {
    return lang === 'km'
      ? `យើងមិនមានគម្រោងសម្រាប់ ${days} ថ្ងៃនៅទីនេះទេ។`
      : `We do not have a plan covering ${days} days for this destination yet.`;
  }

  const gotGb = Math.round(rec.best.effectiveGb * 10) / 10;

  if (rec.shortfall) {
    return lang === 'km'
      ? `${days} ថ្ងៃសម្រាប់ ${activityKm} ត្រូវការប្រហែល ${needGb}GB។ គម្រោងធំបំផុតរបស់យើងគឺ ${gotGb}GB — អ្នកអាចទិញពីរដង។`
      : `${days} days of ${activityEn} needs about ${needGb}GB. Our largest plan here is ${gotGb}GB, so you may want two.`;
  }

  return lang === 'km'
    ? `${days} ថ្ងៃសម្រាប់ ${activityKm} ត្រូវការប្រហែល ${needGb}GB។ គម្រោងនេះផ្ដល់ ${gotGb}GB — មានបម្រុងបន្តិច។`
    : `${days} days of ${activityEn} works out at about ${needGb}GB. This plan gives you ${gotGb}GB, with a little spare.`;
}

function joinList(items: string[], conjunction: string): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}
