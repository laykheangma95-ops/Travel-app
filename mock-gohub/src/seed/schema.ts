// ─────────────────────────────────────────────────────────────────────────────
// The shape of the seed data.
//
// Seeds are written in a compact authoring form and expanded at boot into the
// verbose wire shapes GoHub actually returns (uuids, timestamps, full category
// objects nested inside listings, all 21 specification rows). Keeping the two
// apart means the seed files stay readable and every listing is guaranteed to
// carry the complete S1–S21 set, including the empty strings.
// ─────────────────────────────────────────────────────────────────────────────

/** GoHub's specification codes, with the labels they ship in `specificationName`. */
export const SPECIFICATION_NAMES = {
  S1: 'SIM Type',
  S2: 'Coverage',
  S3: 'Data Type',
  S4: 'Data Amount',
  S5: 'Network Type',
  S6: 'Speed',
  S7: 'Tethering',
  S8: 'Hotspot',
  S9: 'Voice',
  S10: 'SMS',
  S11: 'KYC Needed',
  S12: 'KYC Links',
  S13: 'Special Activation Required',
  S14: 'Unsupported Apps',
  S15: 'Local Phone Number',
  S16: 'Change APN Note',
  S17: 'Change APN Links',
  S18: 'Top-up Supported',
  S19: 'Validity Note',
  S20: 'Activation Time',
  S21: 'Activation Validity Days',
} as const;

export type SpecificationCode = keyof typeof SPECIFICATION_NAMES;

export type Status = 'Active' | 'InActive';

export interface CategorySeed {
  categoryType: 'Country Region' | 'ProductType';
  categoryCode: string;
  categoryName: string;
  status: Status;
}

export interface ListingSeed {
  listingCode: string;
  listingName: string;
  status: Status;
  /** Resolved at boot into the full nested category objects. */
  categoryCodes: string[];
  /**
   * Only the specifications that carry a value. Every code missing from this
   * map is still emitted — as `specificationValue: ''`, which is exactly what
   * the real API does.
   */
  specs: Partial<Record<SpecificationCode, string>>;
}

export interface ItemSeed {
  listingCode: string;
  itemCode: string;
  itemName: string;
  status: Status;
  /** Zero-padded, as GoHub returns it: "03", "05", "30". */
  days: string;
  /** "01GB", "08GB", "UNGB", "UNLI". */
  data: string;
  /** "01", "08", "UN", "UNLI". */
  dataAmountValue: string;
  dataAmountUnit: string;
  /** VND, integer, as a STRING — GoHub returns prices as strings from /items. */
  price: string;
}
