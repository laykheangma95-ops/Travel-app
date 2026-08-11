// ─────────────────────────────────────────────────────────────────────────────
// The filtering layer between GoHub's catalog and anything a customer can see.
//
// GoHub returns InActive rows. It has to — a listing that disappeared entirely
// would be indistinguishable from one that never existed, and reconciliation of
// old orders needs the row to still resolve.
//
// Deciding what is sellable is therefore OUR job, and it has one rule that is
// easy to miss: an Active item under an InActive listing is NOT sellable. The
// supplier retires a destination by deactivating the listing and leaves its
// items alone. Filtering on `item.active` only would keep selling Malaysia
// after Malaysia was withdrawn.
// ─────────────────────────────────────────────────────────────────────────────

import type { Item, Listing } from './types';

export function sellableCategories<T extends { active: boolean }>(rows: T[]): T[] {
  return rows.filter((row) => row.active);
}

export function sellableListings(listings: Listing[]): Listing[] {
  return listings.filter((listing) => listing.active);
}

/**
 * Items that are themselves Active AND belong to an Active listing.
 *
 * Pass the listings when you have them. Without them the listing check cannot
 * be made, so the item's own status is all we can go on — call sites that show
 * prices should always pass listings.
 */
export function sellableItems(items: Item[], listings?: Listing[]): Item[] {
  const activeListingCodes = listings
    ? new Set(listings.filter((listing) => listing.active).map((listing) => listing.code))
    : null;

  return items.filter((item) => {
    if (!item.active) return false;
    if (activeListingCodes && !activeListingCodes.has(item.listingCode)) return false;
    return true;
  });
}

/** A listing whose KYC spec says the customer must register a passport first. */
export function requiresKyc(listing: Listing): boolean {
  return (listing.specs.kycNeeded ?? '').trim().toLowerCase() === 'yes';
}

/** A listing that will not carry data until the customer dials a code. */
export function requiresSpecialActivation(listing: Listing): boolean {
  return Boolean(listing.specs.specialActivation);
}
