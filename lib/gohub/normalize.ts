// ─────────────────────────────────────────────────────────────────────────────
// Where GoHub's shapes become ours.
//
// This module is the only place allowed to know that a price is a string, that
// "UNGB" means unlimited, that the fulfilment status key is spelled two ways,
// or that an empty value is '' rather than null. Everything downstream gets
// numbers, booleans and nulls.
//
// It is deliberately total: nothing in here throws on a malformed field. A
// supplier that adds a spec code, drops a field or changes a spelling should
// degrade one value, not fail an order that a customer has already paid for.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Balance,
  Category,
  DataAllowance,
  DataUsage,
  FulfilmentStatus,
  GohubBalanceRow,
  GohubCategory,
  GohubDataUsage,
  GohubItem,
  GohubListing,
  GohubOrder,
  GohubOrderDetail,
  GohubPackageStatus,
  GohubSerial,
  GohubSpecification,
  GohubUsagePackage,
  GohubUsageStatus,
  Item,
  Listing,
  ListingSpecs,
  Order,
  OrderLine,
  SalesStatus,
  Serial,
  UsagePackage,
} from './types';

// ── Primitives ───────────────────────────────────────────────────────────────

/** `''` and whitespace mean "not set" upstream. Downstream that is `null`. */
export function emptyToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * VND has no minor unit, so every price is a whole number of dong. Arrives as
 * `"177415"` from /items and `177415` from /orders; both land here.
 */
export function parsePriceVnd(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  if (typeof value !== 'string') return 0;
  // Tolerate thousands separators — cheap insurance, and free if they never appear.
  const cleaned = value.replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

/** `"03"` → `3`. Leading zeros make parseInt's radix argument mandatory. */
export function parseDays(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

const UNLIMITED_TOKENS = new Set(['un', 'unli', 'unl', 'unlimited', 'ungb']);

/**
 * `"UN"` / `"UNLI"` / `"UNGB"` all mean unlimited. Anything else is a number of
 * units. A caller must branch on `unlimited` — there is no numeric value to
 * fall back on, and inventing one (999999) is how a UI ends up promising a
 * customer 999999 GB.
 */
export function parseAllowance(
  data: string | null | undefined,
  amountValue?: string | null,
  amountUnit?: string | null
): DataAllowance {
  const value = emptyToNull(amountValue ?? null);
  const raw = emptyToNull(data ?? null);

  if (value && UNLIMITED_TOKENS.has(value.toLowerCase())) return { unlimited: true };
  if (raw && UNLIMITED_TOKENS.has(raw.toLowerCase())) return { unlimited: true };

  const unit = emptyToNull(amountUnit ?? null) ?? raw?.replace(/[\d.\s]/g, '') ?? 'GB';

  const numeric = value ?? raw;
  const parsed = Number.parseFloat((numeric ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed)) return { unlimited: true };

  return { unlimited: false, value: parsed, unit: unit.toUpperCase() };
}

/** GoHub says `Active` / `InActive`; casing is not guaranteed. */
export function isActive(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === 'active';
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export function normalizeCategory(category: GohubCategory): Category {
  return {
    id: category.id,
    code: category.categoryCode,
    name: category.categoryName,
    type: category.categoryType,
    active: isActive(category.status),
  };
}

/** Specification code → the field it becomes on `ListingSpecs`. */
const SPEC_FIELDS: Record<string, keyof ListingSpecs> = {
  S1: 'simType',
  S3: 'dataType',
  S5: 'networkType',
  S8: 'hotspot',
  S11: 'kycNeeded',
  S12: 'kycLinks',
  S13: 'specialActivation',
  S14: 'unsupportedApps',
  S15: 'localPhoneNumber',
  S16: 'apnNote',
  S17: 'apnLinks',
  S20: 'activationTime',
  S21: 'activationValidityDays',
};

const EMPTY_SPECS: ListingSpecs = {
  simType: null,
  dataType: null,
  networkType: null,
  hotspot: null,
  kycNeeded: null,
  kycLinks: null,
  specialActivation: null,
  unsupportedApps: null,
  localPhoneNumber: null,
  apnNote: null,
  apnLinks: null,
  activationTime: null,
  activationValidityDays: null,
};

/** Flattens the S1–S21 array into a keyed object, dropping the empty strings. */
export function flattenSpecifications(specifications: GohubSpecification[] | undefined): {
  specs: ListingSpecs;
  raw: Record<string, string | null>;
} {
  const specs: ListingSpecs = { ...EMPTY_SPECS };
  const raw: Record<string, string | null> = {};

  for (const specification of specifications ?? []) {
    const code = specification?.specificationCode;
    if (!code) continue;

    const value = emptyToNull(specification.specificationValue);
    raw[code] = value;

    const field = SPEC_FIELDS[code];
    if (!field) continue;

    if (field === 'activationValidityDays') {
      const parsed = Number.parseInt(value ?? '', 10);
      specs.activationValidityDays = Number.isFinite(parsed) ? parsed : null;
    } else {
      specs[field] = value;
    }
  }

  return { specs, raw };
}

export function normalizeListing(listing: GohubListing): Listing {
  const { specs, raw } = flattenSpecifications(listing.specifications);

  return {
    code: listing.listingCode,
    name: listing.listingName,
    active: isActive(listing.status),
    categories: (listing.categories ?? []).map(normalizeCategory),
    specs,
    rawSpecifications: raw,
  };
}

export function normalizeItem(item: GohubItem): Item {
  return {
    id: item.itemId,
    code: item.itemCode,
    name: item.itemName,
    active: isActive(item.status),
    listingCode: item.listing?.listingCode ?? '',
    listingName: item.listing?.listingName ?? '',
    days: parseDays(item.days),
    allowance: parseAllowance(item.data, item.dataAmountValue, item.dataAmountUnit),
    priceVnd: parsePriceVnd(item.price),
    currency: item.currency || 'VND',
  };
}

// ── Orders ───────────────────────────────────────────────────────────────────

/**
 * Reads the fulfilment status under either spelling.
 *
 * GoHub's own spec uses `fulfillmentStatus` in some places and
 * `fulfilmentStatus` in others, and the API emits both. Latching onto one
 * spelling silently reports every order as unfulfilled.
 */
export function readFulfilmentStatus(source: {
  fulfillmentStatus?: string | null;
  fulfilmentStatus?: string | null;
}): string | null {
  return emptyToNull(source?.fulfillmentStatus ?? source?.fulfilmentStatus ?? null);
}

/** `saleCode` in webhooks, `salesCode` in REST responses. Same thing. */
export function readSalesCode(source: {
  saleCode?: string | null;
  salesCode?: string | null;
}): string | null {
  return emptyToNull(source?.saleCode ?? source?.salesCode ?? null);
}

const FULFILMENT_STATUSES: FulfilmentStatus[] = [
  'none',
  'processing',
  'completed',
  'failed',
];

export function normalizeFulfilmentStatus(raw: string | null): FulfilmentStatus {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'none';
  return (FULFILMENT_STATUSES as string[]).includes(value)
    ? (value as FulfilmentStatus)
    : 'unknown';
}

const SALES_STATUSES: SalesStatus[] = ['pending', 'confirmed', 'processing', 'canceled'];

/** Case varies on the wire — `"processing"` and `"Processing"` both occur. */
export function normalizeSalesStatus(raw: string | null | undefined): SalesStatus {
  const value = (raw ?? '').trim().toLowerCase();
  // British and American spellings of "cancelled" both appear in the wild.
  const canonical = value === 'cancelled' ? 'canceled' : value;
  return (SALES_STATUSES as string[]).includes(canonical) ? (canonical as SalesStatus) : 'unknown';
}

export function normalizeSerial(serial: GohubSerial): Serial {
  return {
    iccid: serial.iccid,
    smdpAddress: serial.smdpAddress,
    activationCode: serial.activationCode,
    lpa: serial.lpa,
    androidLpa: serial.androidLpa,
    iosLpa: serial.iosLpa,
    qrCodeUrl: emptyToNull(serial.linkInfoSim) ?? emptyToNull(serial.link) ?? '',
    activationExpiryDate: emptyToNull(serial.activationExpiryDate),
  };
}

export function normalizeOrderLine(detail: GohubOrderDetail): OrderLine {
  const serials = (detail.serials ?? []).map(normalizeSerial);

  return {
    itemCode: detail.itemCode,
    itemName: detail.itemName,
    days: parseDays(detail.days),
    allowance: parseAllowance(detail.data),
    priceVnd: parsePriceVnd(detail.price),
    quantity: typeof detail.quantity === 'number' ? detail.quantity : 0,
    partnerUnitPriceVnd: parsePriceVnd(detail.partnerUnitPrice ?? detail.price),
    partnerUnitDiscountVnd: parsePriceVnd(detail.partnerUnitDiscount ?? 0),
    partnerLineAmountVnd: parsePriceVnd(detail.partnerLineAmount ?? 0),
    voucherLinks: (detail.links ?? '')
      .split(',')
      .map((link) => link.trim())
      .filter(Boolean),
    serials,
  };
}

export function normalizeOrder(order: GohubOrder): Order {
  const rawFulfilment = readFulfilmentStatus(order);
  const lines = (order.orderDetails ?? []).map(normalizeOrderLine);

  return {
    salesCode: order.salesCode,
    partnerOrderReference: order.partnerOrderReference,
    orderDate: order.orderDate,
    salesStatus: normalizeSalesStatus(order.salesStatus),
    rawSalesStatus: order.salesStatus ?? '',
    fulfilmentStatus: normalizeFulfilmentStatus(rawFulfilment),
    rawFulfilmentStatus: rawFulfilment,
    paymentStatus: emptyToNull(order.paymentStatus),
    paymentDate: emptyToNull(order.paymentDate),
    paymentMethod: emptyToNull(order.paymentMethod),
    orderType: order.orderType ?? '',
    totalVnd: parsePriceVnd(order.total),
    partnerSubtotalVnd: parsePriceVnd(order.partnerOrderSubtotal ?? 0),
    partnerDiscountVnd: parsePriceVnd(order.partnerOrderDiscount ?? 0),
    partnerTotalVnd: parsePriceVnd(order.partnerOrderTotal ?? order.total),
    customer: {
      firstName: emptyToNull(order.shippingFirstname),
      lastName: emptyToNull(order.shippingLastname),
      email: emptyToNull(order.shippingEmail),
      phone: emptyToNull(order.shippingPhone),
    },
    lines,
    serials: lines.flatMap((line) => line.serials),
  };
}

// ── Data usage ───────────────────────────────────────────────────────────────

const USAGE_STATUSES: GohubUsageStatus[] = ['EXPIRED', 'UNAVAILABLE', 'PREACTIVE', 'ACTIVE'];
const PACKAGE_STATUSES: GohubPackageStatus[] = ['PREACTIVE', 'ACTIVE', 'UNAVAILABLE'];

function toMb(value: number, unit: string): number {
  if (!Number.isFinite(value)) return 0;
  return unit.trim().toLowerCase() === 'gigabytes' ? value * 1024 : value;
}

function normalizeUsagePackage(pkg: GohubUsagePackage): UsagePackage {
  const unit = pkg.unit ?? 'megabytes';
  const status = (pkg.status ?? '').trim().toUpperCase();

  return {
    id: pkg.id,
    name: pkg.name,
    status: (PACKAGE_STATUSES as string[]).includes(status)
      ? (status as GohubPackageStatus)
      : 'UNKNOWN',
    startDate: emptyToNull(pkg.startDate),
    endDate: emptyToNull(pkg.endDate),
    usedMb: toMb(pkg.amount, unit),
    remainingMb: toMb(pkg.remain, unit),
    grantedMb: toMb(pkg.grantAmount, unit),
  };
}

/**
 * The important call in this whole file.
 *
 * Cases 3.1 (PREACTIVE / UNAVAILABLE) and 4.2 (ACTIVE / UNAVAILABLE) return a
 * fully zeroed package for an eSIM that is working. The telco did not answer;
 * the zeros are the absence of an answer, not an answer of zero.
 *
 * A customer standing in an airport in Bangkok being told "0 MB remaining" will
 * buy a second eSIM or ask for a refund, and both of those are our fault, not
 * the telco's. So whenever a package is UNAVAILABLE under a live or pending
 * ICCID — or the ICCID itself is UNAVAILABLE — we report `usageAvailable: false`
 * and the UI says "usage unavailable" instead of a number.
 *
 * EXPIRED (case 1.0) is different: the zeros there are true, and the customer
 * should see that the plan is finished.
 */
export function normalizeDataUsage(usage: GohubDataUsage): DataUsage {
  const rawStatus = (usage.status ?? '').trim().toUpperCase();
  const status: GohubUsageStatus | 'UNKNOWN' = (USAGE_STATUSES as string[]).includes(rawStatus)
    ? (rawStatus as GohubUsageStatus)
    : 'UNKNOWN';

  const packages = (usage.packages ?? []).map(normalizeUsagePackage);
  const common = {
    iccid: usage.iccid,
    status,
    activatedAt: emptyToNull(usage.activatedAt),
    activationExpiryDate: emptyToNull(usage.activationExpiryDate),
    packages,
  };

  const telcoSilent =
    status === 'UNAVAILABLE' ||
    status === 'UNKNOWN' ||
    ((status === 'ACTIVE' || status === 'PREACTIVE') &&
      packages.some((pkg) => pkg.status === 'UNAVAILABLE'));

  if (telcoSilent || packages.length === 0) {
    return { ...common, usageAvailable: false };
  }

  return {
    ...common,
    usageAvailable: true,
    usedMb: sum(packages.map((pkg) => pkg.usedMb)),
    remainingMb: sum(packages.map((pkg) => pkg.remainingMb)),
    grantedMb: sum(packages.map((pkg) => pkg.grantedMb)),
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// ── Balance ──────────────────────────────────────────────────────────────────

/**
 * `data` is an array, not an object, and `balance` inside it is a string.
 * A client reading `data.balance` gets `undefined` and concludes we are broke.
 */
export function normalizeBalance(rows: GohubBalanceRow[] | GohubBalanceRow | undefined): Balance {
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    amount: parsePriceVnd(row?.balance ?? 0),
    currency: row?.currencyCode || 'VND',
  };
}
