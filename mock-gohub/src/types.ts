// ─────────────────────────────────────────────────────────────────────────────
// The shapes GoHub puts on the wire.
//
// These are intentionally NOT the clean types our app uses. Prices are strings,
// days are zero-padded strings, the fulfilment status key is spelled two
// different ways, and empty values are '' rather than null. Cleaning that up is
// lib/gohub/normalize.ts's job, not the mock's.
// ─────────────────────────────────────────────────────────────────────────────

export type Status = 'Active' | 'InActive';

export interface WireCategory {
  id: string;
  createdAt: string;
  updatedAt: string;
  categoryType: string;
  categoryCode: string;
  categoryName: string;
  status: Status;
}

export interface WireSpecification {
  id: string;
  createdAt: string;
  updatedAt: string;
  specificationCode: string;
  specificationName: string;
  specificationValue: string;
}

export interface WireListing {
  listingCode: string;
  listingName: string;
  status: Status;
  categories: WireCategory[];
  specifications: WireSpecification[];
}

export interface WireItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  status: Status;
  days: string;
  data: string;
  dataAmountValue: string;
  dataAmountUnit: string;
  /** A string. Yes, really. */
  price: string;
  currency: string;
  listing: { listingName: string; listingCode: string };
}

export interface WireSerial {
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

export interface WireOrderDetail {
  itemCode: string;
  itemName: string;
  days: string;
  data: string;
  /** A NUMBER here, unlike /api/items where the same value is a string. */
  price: number;
  quantity: number;
  partnerUnitPrice: number;
  partnerUnitDiscount: number;
  partnerLineAmount: number;
  /** Comma-separated voucher URLs. Empty until fulfilment completes. */
  links: string;
  serials?: WireSerial[];
}

export interface WireOrder {
  salesCode: string;
  partnerOrderReference: string;
  orderDate: string;
  requestDate: string | null;
  discountCode: string | null;
  salesStatus: string;
  paymentStatus: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  /** Emitted as `fulfillmentStatus` or `fulfilmentStatus` depending on the order. */
  fulfillmentStatus?: string;
  fulfilmentStatus?: string;
  orderType: string;
  language: string | null;
  total: number;
  partnerOrderSubtotal: number;
  partnerOrderDiscount: number;
  partnerOrderTotal: number;
  shippingFirstname: string | null;
  shippingLastname: string | null;
  shippingPhone: string | null;
  shippingEmail: string | null;
  shippingAddress: string | null;
  invoiceName: string | null;
  invoiceEmail: string | null;
  invoiceTaxCode: string | null;
  invoiceAddress: string | null;
  orderDetails: WireOrderDetail[];
}

/** Server-side bookkeeping that never goes on the wire. */
export interface StoredOrder extends WireOrder {
  _internal: {
    /** Which spelling of the fulfilment key this order emits. Fixed at creation. */
    fulfilmentKeySpelling: 'fulfillmentStatus' | 'fulfilmentStatus';
    /** Whether this order lowercases its in-flight sales status on the wire. */
    lowercaseStatus: boolean;
    /** Activation validity days, resolved from the listing's S21 at order time. */
    activationValidityDays: number;
    fulfilmentTimer: NodeJS.Timeout | null;
  };
}

export type UsageStatus = 'EXPIRED' | 'UNAVAILABLE' | 'PREACTIVE' | 'ACTIVE';
export type PackageStatus = 'PREACTIVE' | 'ACTIVE' | 'UNAVAILABLE';

export interface WireUsagePackage {
  id: string;
  name: string;
  status: PackageStatus;
  startDate: string | null;
  endDate: string | null;
  remain: number;
  amount: number;
  thresholdLimit: number;
  grantAmount: number;
  unit: 'megabytes' | 'gigabytes';
}

export interface WireDataUsage {
  iccid: string;
  status: UsageStatus;
  activatedAt: string | null;
  activationExpiryDate: string | null;
  packages: WireUsagePackage[];
}
