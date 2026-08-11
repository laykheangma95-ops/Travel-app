// ─────────────────────────────────────────────────────────────────────────────
// GoHub B2B eSIM API — wire types and our clean internal types.
//
// Two layers, kept strictly apart:
//
//   Gohub*  — what actually arrives. Prices are strings, days are zero-padded
//             strings, empty means '', the fulfilment status key is spelled two
//             different ways, and unlimited is the literal text "UNGB".
//   *       — what the rest of the app is allowed to see. Numbers are numbers,
//             absent is null, unlimited is a boolean.
//
// Nothing outside lib/gohub may import a `Gohub*` type. If a wire shape leaks
// into a component, the next supplier change becomes a rewrite.
// ─────────────────────────────────────────────────────────────────────────────

// ── Envelope ─────────────────────────────────────────────────────────────────

export interface GohubEnvelope<T> {
  statusCode: number;
  message: string;
  data?: T;
  pagination?: GohubPagination;
}

export interface GohubPagination {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  count: number;
}

export interface Page<T> {
  rows: T[];
  pagination: GohubPagination;
}

export interface PageQuery {
  page?: number;
  perPage?: number;
}

// ── Catalog, on the wire ─────────────────────────────────────────────────────

export interface GohubCategory {
  id: string;
  createdAt: string;
  updatedAt: string;
  categoryType: string;
  categoryCode: string;
  categoryName: string;
  status: string;
}

export interface GohubSpecification {
  id: string;
  createdAt: string;
  updatedAt: string;
  specificationCode: string;
  specificationName: string;
  specificationValue: string;
}

export interface GohubListing {
  listingCode: string;
  listingName: string;
  status: string;
  categories: GohubCategory[];
  specifications: GohubSpecification[];
}

export interface GohubItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  status: string;
  days: string;
  data: string;
  dataAmountValue: string;
  dataAmountUnit: string;
  /** A string. Parse it, never render it. */
  price: string;
  currency: string;
  listing: { listingName: string; listingCode: string };
}

// ── Orders, on the wire ──────────────────────────────────────────────────────

export interface GohubSerial {
  smdpAddress: string;
  activationCode: string;
  lpa: string;
  iccid: string;
  link: string;
  linkInfoSim: string;
  iosLpa: string;
  androidLpa: string;
  activationExpiryDate: string;
}

export interface GohubOrderDetail {
  itemCode: string;
  itemName: string;
  days: string;
  data: string;
  /** A NUMBER here, a string on /api/items. Both are handled. */
  price: number | string;
  quantity: number;
  partnerUnitPrice?: number | string;
  partnerUnitDiscount?: number | string;
  partnerLineAmount?: number | string;
  links?: string;
  serials?: GohubSerial[];
}

export interface GohubOrder {
  salesCode: string;
  partnerOrderReference: string;
  orderDate: string;
  requestDate?: string | null;
  discountCode?: string | null;
  salesStatus: string;
  paymentStatus: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  /** Spelled with two Ls on some orders… */
  fulfillmentStatus?: string;
  /** …and one L on others. Always read both. */
  fulfilmentStatus?: string;
  orderType: string;
  language?: string | null;
  total: number | string;
  partnerOrderSubtotal?: number | string;
  partnerOrderDiscount?: number | string;
  partnerOrderTotal?: number | string;
  shippingFirstname?: string | null;
  shippingLastname?: string | null;
  shippingPhone?: string | null;
  shippingEmail?: string | null;
  shippingAddress?: string | null;
  invoiceName?: string | null;
  invoiceEmail?: string | null;
  invoiceTaxCode?: string | null;
  invoiceAddress?: string | null;
  orderDetails: GohubOrderDetail[];
}

export interface GohubBalanceRow {
  balance: string | number;
  currencyCode: string;
}

// ── Data usage, on the wire ──────────────────────────────────────────────────

export type GohubUsageStatus = 'EXPIRED' | 'UNAVAILABLE' | 'PREACTIVE' | 'ACTIVE';
export type GohubPackageStatus = 'PREACTIVE' | 'ACTIVE' | 'UNAVAILABLE';

export interface GohubUsagePackage {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  remain: number;
  amount: number;
  thresholdLimit: number;
  grantAmount: number;
  unit: string;
}

export interface GohubDataUsage {
  iccid: string;
  status: string;
  activatedAt: string | null;
  activationExpiryDate: string | null;
  packages: GohubUsagePackage[];
}

// ── Requests ─────────────────────────────────────────────────────────────────

export interface CreateOrderDetailInput {
  itemCode: string;
  itemName: string;
  days: string;
  data: string;
  price: number;
  quantity: number;
  partnerUnitPrice: number;
  partnerUnitDiscount: number;
}

export interface CreateOrderInput {
  /** Our reference. Must be unique — a repeat is rejected with 430, by design. */
  partnerOrderReference: string;
  discountCode?: string | null;
  requestDate?: string | null;
  shippingFirstname?: string | null;
  shippingLastname?: string | null;
  shippingPhone?: string | null;
  shippingEmail?: string | null;
  shippingAddress?: string | null;
  invoiceName?: string | null;
  invoiceEmail?: string | null;
  invoiceTaxCode?: string | null;
  invoiceAddress?: string | null;
  language?: string | null;
  partnerOrderDiscount?: number;
  orderDetails: CreateOrderDetailInput[];
}

export interface ListingQuery extends PageQuery {
  categoryCode?: string;
  /** Case-sensitive upstream: "eSIM", never "esim". */
  simType?: 'SIM' | 'eSIM';
}

export interface ItemQuery extends PageQuery {
  listingCode?: string;
  simType?: 'SIM' | 'eSIM';
}

export interface OrderQuery extends PageQuery {
  search?: string;
  salesStatus?: string;
  fromOrderDate?: string;
  toOrderDate?: string;
  orderType?: string;
}

export interface CategoryQuery extends PageQuery {
  parentCategoryCode?: string;
}

// ── Clean internal types ─────────────────────────────────────────────────────

export interface Category {
  id: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
}

/** The S1–S21 set, flattened. Empty upstream values become null. */
export interface ListingSpecs {
  simType: string | null;
  dataType: string | null;
  networkType: string | null;
  hotspot: string | null;
  kycNeeded: string | null;
  kycLinks: string | null;
  specialActivation: string | null;
  unsupportedApps: string | null;
  localPhoneNumber: string | null;
  apnNote: string | null;
  apnLinks: string | null;
  activationTime: string | null;
  /** Parsed from S21. Null when the listing does not declare one. */
  activationValidityDays: number | null;
}

export interface Listing {
  code: string;
  name: string;
  active: boolean;
  categories: Category[];
  specs: ListingSpecs;
  /** Kept for support tickets; the app should read `specs`. */
  rawSpecifications: Record<string, string | null>;
}

/** An amount of data, with unlimited expressed as a flag rather than a magic string. */
export type DataAllowance = { unlimited: true } | { unlimited: false; value: number; unit: string };

export interface Item {
  id: string;
  code: string;
  name: string;
  active: boolean;
  listingCode: string;
  listingName: string;
  days: number;
  allowance: DataAllowance;
  /** VND has no minor unit, so this is a plain integer. */
  priceVnd: number;
  currency: string;
}

export interface Serial {
  iccid: string;
  smdpAddress: string;
  activationCode: string;
  lpa: string;
  /** LPA string an Android handset accepts directly. */
  androidLpa: string;
  /** Human-readable pair for manual iOS entry. */
  iosLpa: string;
  qrCodeUrl: string;
  activationExpiryDate: string | null;
}

export type FulfilmentStatus = 'none' | 'processing' | 'completed' | 'failed' | 'unknown';
export type SalesStatus = 'pending' | 'confirmed' | 'processing' | 'canceled' | 'unknown';

export interface OrderLine {
  itemCode: string;
  itemName: string;
  days: number;
  allowance: DataAllowance;
  priceVnd: number;
  quantity: number;
  partnerUnitPriceVnd: number;
  partnerUnitDiscountVnd: number;
  partnerLineAmountVnd: number;
  voucherLinks: string[];
  serials: Serial[];
}

export interface Order {
  salesCode: string;
  partnerOrderReference: string;
  orderDate: string;
  /** Always lowercase. Never compare against a capitalized literal. */
  salesStatus: SalesStatus;
  rawSalesStatus: string;
  fulfilmentStatus: FulfilmentStatus;
  rawFulfilmentStatus: string | null;
  paymentStatus: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  orderType: string;
  totalVnd: number;
  partnerSubtotalVnd: number;
  partnerDiscountVnd: number;
  partnerTotalVnd: number;
  customer: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
  lines: OrderLine[];
  /** Every serial across every line — what delivery actually needs. */
  serials: Serial[];
}

export interface UsagePackage {
  id: string;
  name: string;
  status: GohubPackageStatus | 'UNKNOWN';
  startDate: string | null;
  endDate: string | null;
  /** Megabytes, normalized from whatever unit arrived. */
  usedMb: number;
  remainingMb: number;
  grantedMb: number;
}

/**
 * Usage, with the one distinction that matters: did the telco actually answer?
 *
 * `usageAvailable: false` means the numbers are meaningless — cases 3.1 and 4.2
 * return a fully zeroed package for a perfectly healthy eSIM. Showing those
 * zeros tells a customer abroad their data is gone when it is not.
 */
export type DataUsage =
  | {
      iccid: string;
      status: GohubUsageStatus | 'UNKNOWN';
      usageAvailable: false;
      activatedAt: string | null;
      activationExpiryDate: string | null;
      packages: UsagePackage[];
    }
  | {
      iccid: string;
      status: GohubUsageStatus | 'UNKNOWN';
      usageAvailable: true;
      activatedAt: string | null;
      activationExpiryDate: string | null;
      usedMb: number;
      remainingMb: number;
      grantedMb: number;
      packages: UsagePackage[];
    };

export interface Balance {
  amount: number;
  currency: string;
}
