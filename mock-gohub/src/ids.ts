import { createHash, randomInt, randomUUID } from 'node:crypto';

/**
 * A uuid derived from a stable key, so a restart does not renumber the whole
 * catalog. Real GoHub ids are opaque uuids; ours just happen to be reproducible.
 */
export function stableUuid(key: string): string {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 32);
  // Force the version/variant nibbles so it is a well-formed v4-looking uuid.
  const v = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

export function uuid(): string {
  return randomUUID();
}

const SALES_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 10 alphanumeric characters, e.g. `wHjGKqDmJc`. */
export function salesCode(): string {
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += SALES_CODE_ALPHABET[randomInt(SALES_CODE_ALPHABET.length)];
  }
  return out;
}

/** 19-digit ICCID with the two-character suffix GoHub masks in its docs. */
export function iccid(): string {
  let digits = '8985203108';
  for (let i = 0; i < 8; i += 1) digits += randomInt(10);
  return `${digits}xx`;
}

/** 32 uppercase hex-ish characters, matching the sample activation codes. */
export function activationCode(): string {
  const alphabet = 'ABCDEF0123456789';
  let out = '';
  for (let i = 0; i < 32; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
