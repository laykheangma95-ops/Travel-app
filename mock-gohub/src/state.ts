// ─────────────────────────────────────────────────────────────────────────────
// In-memory state, plus a JSON snapshot so a restart does not lose the order
// you were halfway through testing.
//
// The catalog is expanded from the seed files at boot. Orders, balance and the
// ICCID registry accumulate at runtime.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config';
import { addDays, stableUuid } from './ids';
import { CATEGORY_PARENTS, CATEGORY_SEED } from './seed/categories';
import { LISTING_SEED } from './seed/listings';
import { ITEM_SEED } from './seed/items';
import { SPECIFICATION_NAMES, type SpecificationCode } from './seed/schema';
import type { StoredOrder, WireCategory, WireItem, WireListing } from './types';

/** Fixed timestamp for catalog rows, so responses are byte-stable across boots. */
const CATALOG_EPOCH = '2025-01-06T02:14:07.000Z';

export interface IccidRecord {
  iccid: string;
  salesCode: string;
  itemCode: string;
  itemName: string;
  /** Validity window resolved from the listing's S21 at order time. */
  activationValidityDays: number;
  orderedAt: string;
  activatedAt: string | null;
  activationExpiryDate: string;
  dataAmountValue: string;
  dataAmountUnit: string;
  days: string;
}

interface Snapshot {
  balance: number;
  orders: StoredOrder[];
  iccids: IccidRecord[];
  webhookUrl: string | null;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

function buildCategories(): WireCategory[] {
  return CATEGORY_SEED.map((seed) => ({
    id: stableUuid(`category:${seed.categoryCode}`),
    createdAt: CATALOG_EPOCH,
    updatedAt: CATALOG_EPOCH,
    categoryType: seed.categoryType,
    categoryCode: seed.categoryCode,
    categoryName: seed.categoryName,
    status: seed.status,
  }));
}

const ALL_SPEC_CODES = Object.keys(SPECIFICATION_NAMES) as SpecificationCode[];

function buildListings(categories: WireCategory[]): WireListing[] {
  const byCode = new Map(categories.map((c) => [c.categoryCode, c]));

  return LISTING_SEED.map((seed) => ({
    listingCode: seed.listingCode,
    listingName: seed.listingName,
    status: seed.status,
    categories: seed.categoryCodes
      .map((code) => byCode.get(code))
      .filter((c): c is WireCategory => Boolean(c)),
    // Every listing carries all 21 rows. Anything the seed did not set is an
    // empty string on the wire — not null, not absent. This is the single most
    // common shape our normalizer has to cope with.
    specifications: ALL_SPEC_CODES.map((code) => ({
      id: stableUuid(`spec:${seed.listingCode}:${code}`),
      createdAt: CATALOG_EPOCH,
      updatedAt: CATALOG_EPOCH,
      specificationCode: code,
      specificationName: SPECIFICATION_NAMES[code],
      specificationValue: seed.specs[code] ?? '',
    })),
  }));
}

function buildItems(listings: WireListing[]): WireItem[] {
  const byCode = new Map(listings.map((l) => [l.listingCode, l]));

  return ITEM_SEED.map((seed) => {
    const listing = byCode.get(seed.listingCode);
    return {
      itemId: stableUuid(`item:${seed.itemCode}`),
      itemCode: seed.itemCode,
      itemName: seed.itemName,
      status: seed.status,
      days: seed.days,
      data: seed.data,
      dataAmountValue: seed.dataAmountValue,
      dataAmountUnit: seed.dataAmountUnit,
      price: seed.price,
      currency: 'VND',
      listing: {
        listingName: listing?.listingName ?? seed.listingCode,
        listingCode: seed.listingCode,
      },
    };
  });
}

export const categories = buildCategories();
export const listings = buildListings(categories);
export const items = buildItems(listings);

export const categoryParentOf = (category: WireCategory): string =>
  CATEGORY_PARENTS[category.categoryType] ?? '';

export function findItem(itemCode: string): WireItem | undefined {
  return items.find((item) => item.itemCode === itemCode);
}

export function findListing(listingCode: string): WireListing | undefined {
  return listings.find((listing) => listing.listingCode === listingCode);
}

/** S21 for the listing an item belongs to, defaulted to 30 when unset. */
export function activationValidityDaysFor(itemCode: string): number {
  const item = findItem(itemCode);
  const listing = item ? findListing(item.listing.listingCode) : undefined;
  const raw = listing?.specifications.find((s) => s.specificationCode === 'S21')?.specificationValue;
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

// ── Mutable runtime state ────────────────────────────────────────────────────

class MockState {
  balance = config.startingBalance;
  readonly orders = new Map<string, StoredOrder>();
  readonly ordersByReference = new Map<string, string>();
  readonly iccids = new Map<string, IccidRecord>();
  /** Overridable at runtime via POST /dev/webhook-url, for the contract tests. */
  webhookUrl: string | null = null;

  reset(balance = config.startingBalance): void {
    for (const order of this.orders.values()) {
      if (order._internal.fulfilmentTimer) clearTimeout(order._internal.fulfilmentTimer);
    }
    this.balance = balance;
    this.orders.clear();
    this.ordersByReference.clear();
    this.iccids.clear();
    this.save();
  }

  registerIccid(record: IccidRecord): void {
    this.iccids.set(record.iccid, record);
  }

  save(): void {
    if (!config.persist) return;
    const snapshot: Snapshot = {
      balance: this.balance,
      // Timers cannot be serialized, and would be meaningless after a restart.
      orders: [...this.orders.values()].map((order) => ({
        ...order,
        _internal: { ...order._internal, fulfilmentTimer: null },
      })),
      iccids: [...this.iccids.values()],
      webhookUrl: this.webhookUrl,
    };

    try {
      mkdirSync(dirname(config.statePath), { recursive: true });
      writeFileSync(config.statePath, JSON.stringify(snapshot, null, 2));
    } catch (error) {
      console.warn('[mock-gohub] could not persist state:', error);
    }
  }

  load(): void {
    if (!config.persist) return;
    let snapshot: Snapshot;
    try {
      snapshot = JSON.parse(readFileSync(config.statePath, 'utf8')) as Snapshot;
    } catch {
      return; // No snapshot yet. Perfectly normal on a first run.
    }

    this.balance = snapshot.balance ?? config.startingBalance;
    this.webhookUrl = snapshot.webhookUrl ?? null;

    for (const order of snapshot.orders ?? []) {
      order._internal.fulfilmentTimer = null;
      this.orders.set(order.salesCode, order);
      this.ordersByReference.set(order.partnerOrderReference, order.salesCode);
    }
    for (const record of snapshot.iccids ?? []) {
      this.iccids.set(record.iccid, record);
    }
  }
}

export const state = new MockState();

/** Expiry date for a serial, from the order date plus the listing's S21. */
export function expiryFor(orderedAt: string, validityDays: number): string {
  return addDays(new Date(orderedAt), validityDays);
}
