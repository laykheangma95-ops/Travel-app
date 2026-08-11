// Unit tests for the normalization layer. No server needed, so these run in the
// default `npm test` gate — the contract suite covers the same ground over HTTP.

import { describe, expect, it } from 'vitest';
import {
  emptyToNull,
  flattenSpecifications,
  isActive,
  normalizeBalance,
  normalizeDataUsage,
  normalizeSalesStatus,
  parseAllowance,
  parseDays,
  parsePriceVnd,
  readFulfilmentStatus,
  readSalesCode,
} from '@/lib/gohub/normalize';
import { sellableItems } from '@/lib/gohub/catalog';
import type { GohubDataUsage, GohubSpecification, Item, Listing } from '@/lib/gohub/types';

describe('scalar parsing', () => {
  it('parses VND prices from strings', () => {
    expect(parsePriceVnd('177415')).toBe(177415);
    expect(parsePriceVnd(177415)).toBe(177415);
    expect(parsePriceVnd('1,874,300')).toBe(1874300);
    // Never NaN: a price we cannot read must not silently become NaN and then
    // render as "NaN ៛" on a product page.
    expect(parsePriceVnd('')).toBe(0);
    expect(parsePriceVnd(undefined)).toBe(0);
  });

  it('parses zero-padded day counts', () => {
    expect(parseDays('03')).toBe(3);
    expect(parseDays('30')).toBe(30);
    expect(parseDays('')).toBe(0);
  });

  it('turns empty strings into null', () => {
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull('   ')).toBeNull();
    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull('value')).toBe('value');
  });

  it('recognizes Active case-insensitively', () => {
    expect(isActive('Active')).toBe(true);
    expect(isActive('active')).toBe(true);
    expect(isActive('InActive')).toBe(false);
  });
});

describe('allowances', () => {
  it('maps every unlimited spelling to a flag', () => {
    expect(parseAllowance('UNGB', 'UN', 'GB')).toEqual({ unlimited: true });
    expect(parseAllowance('UNLI', 'UNLI', 'GB')).toEqual({ unlimited: true });
    expect(parseAllowance('UNGB')).toEqual({ unlimited: true });
  });

  it('parses measured allowances', () => {
    expect(parseAllowance('08GB', '08', 'GB')).toEqual({ unlimited: false, value: 8, unit: 'GB' });
    expect(parseAllowance('01GB', '01', 'GB')).toEqual({ unlimited: false, value: 1, unit: 'GB' });
  });
});

describe('specifications', () => {
  const spec = (code: string, value: string): GohubSpecification => ({
    id: code,
    createdAt: '2025-01-06T00:00:00.000Z',
    updatedAt: '2025-01-06T00:00:00.000Z',
    specificationCode: code,
    specificationName: code,
    specificationValue: value,
  });

  it('flattens S1–S21 into keyed fields and drops empty strings', () => {
    const { specs } = flattenSpecifications([
      spec('S1', 'eSIM'),
      spec('S3', 'Daily Data'),
      spec('S5', '5G'),
      spec('S8', 'Yes'),
      spec('S11', 'Yes'),
      spec('S12', 'https://kyc.example/register'),
      spec('S13', 'Dial *151*3*1#'),
      spec('S14', 'VoIP restricted'),
      spec('S15', 'No'),
      spec('S16', 'Set APN manually'),
      spec('S17', 'https://support.example/apn'),
      spec('S20', 'Activates in 5 minutes'),
      spec('S21', '60'),
      spec('S2', ''),
    ]);

    expect(specs.simType).toBe('eSIM');
    expect(specs.dataType).toBe('Daily Data');
    expect(specs.networkType).toBe('5G');
    expect(specs.hotspot).toBe('Yes');
    expect(specs.kycNeeded).toBe('Yes');
    expect(specs.kycLinks).toBe('https://kyc.example/register');
    expect(specs.specialActivation).toBe('Dial *151*3*1#');
    expect(specs.unsupportedApps).toBe('VoIP restricted');
    expect(specs.localPhoneNumber).toBe('No');
    expect(specs.apnNote).toBe('Set APN manually');
    expect(specs.apnLinks).toBe('https://support.example/apn');
    expect(specs.activationTime).toBe('Activates in 5 minutes');
    // Parsed to a number, so date arithmetic does not silently concatenate.
    expect(specs.activationValidityDays).toBe(60);
  });

  it('leaves unset specifications as null', () => {
    const { specs } = flattenSpecifications([spec('S1', 'eSIM'), spec('S12', '')]);

    expect(specs.kycLinks).toBeNull();
    expect(specs.activationValidityDays).toBeNull();
  });
});

describe('status spellings', () => {
  it('reads the fulfilment status under either spelling', () => {
    expect(readFulfilmentStatus({ fulfillmentStatus: 'Completed' })).toBe('Completed');
    expect(readFulfilmentStatus({ fulfilmentStatus: 'Completed' })).toBe('Completed');
    expect(readFulfilmentStatus({})).toBeNull();
  });

  it('reads saleCode or salesCode', () => {
    expect(readSalesCode({ saleCode: 'wHjGKqDmJc' })).toBe('wHjGKqDmJc');
    expect(readSalesCode({ salesCode: 'wHjGKqDmJc' })).toBe('wHjGKqDmJc');
  });

  it('lowercases sales statuses', () => {
    expect(normalizeSalesStatus('Processing')).toBe('processing');
    expect(normalizeSalesStatus('processing')).toBe('processing');
    expect(normalizeSalesStatus('Cancelled')).toBe('canceled');
  });
});

describe('balance', () => {
  it('reads the string balance out of the array envelope', () => {
    expect(normalizeBalance([{ balance: '4700000', currencyCode: 'VND' }])).toEqual({
      amount: 4700000,
      currency: 'VND',
    });
  });

  it('survives an empty array rather than reporting a balance of zero as fact', () => {
    expect(normalizeBalance([]).amount).toBe(0);
  });
});

describe('data usage', () => {
  const usage = (
    status: string,
    packageStatus: string,
    numbers: { remain: number; amount: number; grant: number }
  ): GohubDataUsage => ({
    iccid: '8985203108005568xx',
    status,
    activatedAt: '2026-08-01T00:00:00.000Z',
    activationExpiryDate: '2026-08-31T00:00:00.000Z',
    packages: [
      {
        id: 'pkg',
        name: 'Cambodia 1GB/day',
        status: packageStatus,
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        remain: numbers.remain,
        amount: numbers.amount,
        thresholdLimit: numbers.grant,
        grantAmount: numbers.grant,
        unit: 'megabytes',
      },
    ],
  });

  const zeroed = { remain: 0, amount: 0, grant: 0 };

  it('reports real usage for ACTIVE / ACTIVE', () => {
    const result = normalizeDataUsage(
      usage('ACTIVE', 'ACTIVE', { remain: 1007.02, amount: 16.980000000000018, grant: 1024 })
    );

    expect(result.usageAvailable).toBe(true);
    if (!result.usageAvailable) return;
    expect(result.remainingMb).toBeCloseTo(1007.02);
    expect(result.usedMb).toBeCloseTo(16.98);
  });

  it('refuses to report zeros as usage for ACTIVE / UNAVAILABLE', () => {
    // Case 4.2. The eSIM works; the telco did not answer. Showing 0 MB here is
    // how a customer abroad concludes their data is gone and asks for a refund.
    expect(normalizeDataUsage(usage('ACTIVE', 'UNAVAILABLE', zeroed)).usageAvailable).toBe(false);
  });

  it('refuses to report zeros as usage for PREACTIVE / UNAVAILABLE', () => {
    expect(normalizeDataUsage(usage('PREACTIVE', 'UNAVAILABLE', zeroed)).usageAvailable).toBe(
      false
    );
  });

  it('reports zeros for EXPIRED, where they are true', () => {
    const result = normalizeDataUsage(usage('EXPIRED', 'UNAVAILABLE', zeroed));

    expect(result.status).toBe('EXPIRED');
    expect(result.packages[0]!.remainingMb).toBe(0);
  });

  it('converts gigabytes to megabytes', () => {
    const gigabytes = usage('ACTIVE', 'ACTIVE', { remain: 2, amount: 1, grant: 3 });
    gigabytes.packages[0]!.unit = 'gigabytes';

    const result = normalizeDataUsage(gigabytes);
    expect(result.usageAvailable).toBe(true);
    if (!result.usageAvailable) return;
    expect(result.remainingMb).toBe(2048);
  });
});

describe('catalog filtering', () => {
  const listing = (code: string, active: boolean): Listing => ({
    code,
    name: code,
    active,
    categories: [],
    specs: {
      simType: 'eSIM',
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
      activationValidityDays: 30,
    },
    rawSpecifications: {},
  });

  const item = (code: string, listingCode: string, active: boolean): Item => ({
    id: code,
    code,
    name: code,
    active,
    listingCode,
    listingName: listingCode,
    days: 3,
    allowance: { unlimited: false, value: 1, unit: 'GB' },
    priceVnd: 177415,
    currency: 'VND',
  });

  it('drops an Active item that belongs to an InActive listing', () => {
    const listings = [listing('LKHM01', true), listing('LMYS01', false)];
    const items = [
      item('EKHM3DPY01GB03D', 'LKHM01', true),
      item('EMYS5DPY01GB05D', 'LMYS01', true),
      item('EVNM03GBFX05D', 'LKHM01', false),
    ];

    // The retired-destination case: GoHub deactivates the listing and leaves
    // its items Active. Filtering on the item alone keeps selling Malaysia.
    expect(sellableItems(items, listings).map((row) => row.code)).toEqual([
      'EKHM3DPY01GB03D',
    ]);
  });
});
