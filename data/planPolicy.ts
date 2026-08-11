// ─────────────────────────────────────────────────────────────────────────────
// Plan facts the price list does NOT contain.
//
// WHY THIS FILE IS MOSTLY NULLS:
//   The dealer sheet gives us speed, carriers, coverage and call/SMS. It says
//   nothing about hotspot, KYC, top-up or the activation window. Those live in
//   GoHub's listing specifications (S8, S11, S18, S21) and arrive over the API.
//
//   The temptation is to fill them in with sensible-looking defaults, because a
//   spec sheet with gaps looks unfinished. Do not. "Hotspot: Yes" on a plan that
//   turns out to block tethering is a refund and a one-star review — and the
//   whole point of showing a spec sheet is that the customer can trust it.
//
//   So: `null` means "we have not confirmed this", and the UI renders nothing
//   at all rather than a guess. A missing row costs a little polish. A wrong row
//   costs the customer's trust, which is the thing we are trying to buy.
//
// TO FILL THESE IN:
//   Once GOHUB_BASE_URL points at the live API, read them off the listing:
//
//     const listing = (await gohub.getListings({ categoryCode: 'KH' })).rows[0];
//     policyFromSpecs(listing.specs);   // → PlanPolicy, ready to store here
//
//   Paste the result below, or persist it — either way the values become facts
//   we can stand behind because the supplier stated them.
// ─────────────────────────────────────────────────────────────────────────────

import type { ListingSpecs } from '@/lib/gohub/types';

export interface PlanPolicy {
  /** Tethering. `null` until GoHub's S8 confirms it. */
  hotspot: boolean | null;
  /** Passport registration before the line carries data. GoHub S11. */
  kycRequired: boolean | null;
  /** Where the customer registers, when KYC is required. GoHub S12. */
  kycUrl: string | null;
  /** Whether the eSIM can be topped up rather than replaced. GoHub S18. */
  topupAvailable: boolean | null;
  /** Days from delivery in which the QR must be activated. GoHub S21. */
  activationWindowDays: number | null;
  /** A dial code or step the customer must complete on arrival. GoHub S13. */
  specialActivation: string | null;
  /** Apps or services the local carrier restricts. GoHub S14. */
  unsupportedApps: string | null;
}

export const UNKNOWN_POLICY: PlanPolicy = {
  hotspot: null,
  kycRequired: null,
  kycUrl: null,
  topupAvailable: null,
  activationWindowDays: null,
  specialActivation: null,
  unsupportedApps: null,
};

/**
 * Confirmed policy per destination slug.
 *
 * Empty on purpose. Every entry added here is a promise we are making to a
 * customer in writing, so each one should come from GoHub's listing data or a
 * written answer from their team — not from what seems likely.
 */
export const planPolicies: Record<string, Partial<PlanPolicy>> = {};

export function policyFor(countrySlug: string): PlanPolicy {
  return { ...UNKNOWN_POLICY, ...(planPolicies[countrySlug] ?? {}) };
}

/** Turns GoHub's normalized listing specifications into a policy we can show. */
export function policyFromSpecs(specs: ListingSpecs): PlanPolicy {
  const yes = (value: string | null): boolean | null => {
    if (value === null) return null;
    const text = value.trim().toLowerCase();
    if (text === 'yes') return true;
    if (text === 'no') return false;
    return null;
  };

  return {
    hotspot: yes(specs.hotspot),
    kycRequired: yes(specs.kycNeeded),
    kycUrl: specs.kycLinks,
    topupAvailable: null, // S18 is not in ListingSpecs yet; add it when we map it.
    activationWindowDays: specs.activationValidityDays,
    specialActivation: specs.specialActivation,
    unsupportedApps: specs.unsupportedApps,
  };
}

/** The date a QR must be activated by, when we know the window. */
export function activationDeadline(
  policy: PlanPolicy,
  purchasedAt: Date = new Date()
): Date | null {
  if (policy.activationWindowDays === null) return null;
  const deadline = new Date(purchasedAt.getTime());
  deadline.setDate(deadline.getDate() + policy.activationWindowDays);
  return deadline;
}
