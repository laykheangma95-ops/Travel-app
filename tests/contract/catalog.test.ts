import { describe, expect, it } from 'vitest';
import { sellableItems, sellableListings } from '@/lib/gohub/catalog';
import { client } from './helpers';

describe('categories', () => {
  it('paginates', async () => {
    const firstPage = await client.getCategories({ page: 1, perPage: 3 });

    expect(firstPage.rows).toHaveLength(3);
    expect(firstPage.pagination.page).toBe(1);
    expect(firstPage.pagination.perPage).toBe(3);
    expect(firstPage.pagination.count).toBe(3);
    expect(firstPage.pagination.total).toBeGreaterThan(3);
    expect(firstPage.pagination.totalPages).toBe(
      Math.ceil(firstPage.pagination.total / firstPage.pagination.perPage)
    );

    const secondPage = await client.getCategories({ page: 2, perPage: 3 });
    const firstCodes = firstPage.rows.map((row) => row.code);
    // A page 2 that repeats page 1 means the offset is being ignored, which
    // looks fine on a small catalog and silently truncates a large one.
    expect(secondPage.rows.every((row) => !firstCodes.includes(row.code))).toBe(true);
  });

  it('covers our launch destinations', async () => {
    const page = await client.getCategories({ perPage: 100 });
    const codes = page.rows.map((row) => row.code);

    for (const code of ['KH', 'TH', 'VN', 'SG', 'STA', 'ASI', 'GLO']) {
      expect(codes).toContain(code);
    }
  });
});

describe('listings', () => {
  it('paginates', async () => {
    const page = await client.getListings({ page: 1, perPage: 2 });

    expect(page.rows.length).toBeLessThanOrEqual(2);
    expect(page.pagination.perPage).toBe(2);
    expect(page.pagination.total).toBeGreaterThanOrEqual(page.rows.length);
  });

  it('flattens the specification array into keyed fields', async () => {
    const page = await client.getListings({ simType: 'eSIM', perPage: 100 });
    expect(page.rows.length).toBeGreaterThan(0);

    for (const listing of page.rows) {
      expect(listing.specs.simType).toBe('eSIM');
      // Empty upstream values must arrive as null, never as ''.
      for (const value of Object.values(listing.specs)) {
        expect(value).not.toBe('');
      }
      if (listing.specs.activationValidityDays !== null) {
        expect(typeof listing.specs.activationValidityDays).toBe('number');
      }
    }
  });

  it('filters by simType', async () => {
    const page = await client.getListings({ simType: 'eSIM', perPage: 100 });

    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((listing) => listing.specs.simType === 'eSIM')).toBe(true);
  });

  it('filters by categoryCode', async () => {
    const page = await client.getListings({ categoryCode: 'KH', perPage: 100 });

    expect(page.rows.length).toBeGreaterThan(0);
    expect(
      page.rows.every((listing) =>
        listing.categories.some((category) => category.code === 'KH')
      )
    ).toBe(true);
  });

  it('excludes InActive listings through the filtering layer', async () => {
    const page = await client.getListings({ perPage: 100 });
    const sellable = sellableListings(page.rows);

    expect(sellable.every((listing) => listing.active)).toBe(true);
    expect(sellable.length).toBeLessThanOrEqual(page.rows.length);
  });
});

describe('items', () => {
  it('paginates', async () => {
    const page = await client.getItems({ page: 1, perPage: 5 });

    expect(page.rows.length).toBeLessThanOrEqual(5);
    expect(page.pagination.perPage).toBe(5);
  });

  it('filters by listingCode', async () => {
    const listings = await client.getListings({ perPage: 1 });
    const listingCode = listings.rows[0]!.code;

    const page = await client.getItems({ listingCode, perPage: 100 });
    expect(page.rows.every((item) => item.listingCode === listingCode)).toBe(true);
  });

  it('returns only eSIM items when simType is eSIM', async () => {
    const [items, listings] = await Promise.all([
      client.getItems({ simType: 'eSIM', perPage: 200 }),
      client.getListings({ perPage: 200 }),
    ]);

    expect(items.rows.length).toBeGreaterThan(0);

    const simTypeByListing = new Map(
      listings.rows.map((listing) => [listing.code, listing.specs.simType])
    );
    expect(items.rows.every((item) => simTypeByListing.get(item.listingCode) === 'eSIM')).toBe(
      true
    );
  });

  it('parses prices, days and allowances into usable numbers', async () => {
    const page = await client.getItems({ perPage: 200 });

    for (const item of page.rows) {
      // "177415" must become 177415, not NaN and not a string.
      expect(typeof item.priceVnd).toBe('number');
      expect(Number.isInteger(item.priceVnd)).toBe(true);
      expect(item.priceVnd).toBeGreaterThan(0);

      // "03" must become 3.
      expect(typeof item.days).toBe('number');
      expect(item.days).toBeGreaterThan(0);

      expect(item.currency).toBe('VND');
    }
  });

  it('parses unlimited items as unlimited rather than a number', async () => {
    const page = await client.getItems({ perPage: 200 });
    const unlimited = page.rows.filter((item) => item.allowance.unlimited);

    expect(unlimited.length).toBeGreaterThan(0);
    for (const item of unlimited) {
      // The failure this guards against is "UNGB" parsing to NaN or 0 and the
      // product page advertising an unlimited plan as 0 GB.
      expect(item.allowance).toEqual({ unlimited: true });
    }

    const measured = page.rows.filter((item) => !item.allowance.unlimited);
    for (const item of measured) {
      if (item.allowance.unlimited) continue;
      expect(Number.isFinite(item.allowance.value)).toBe(true);
      expect(item.allowance.value).toBeGreaterThan(0);
    }
  });

  it('excludes InActive items, and Active items under an InActive listing', async () => {
    const [items, listings] = await Promise.all([
      client.getItems({ perPage: 200 }),
      client.getListings({ perPage: 200 }),
    ]);

    const sellable = sellableItems(items.rows, listings.rows);
    const activeListingCodes = new Set(
      listings.rows.filter((listing) => listing.active).map((listing) => listing.code)
    );

    expect(sellable.every((item) => item.active)).toBe(true);
    expect(sellable.every((item) => activeListingCodes.has(item.listingCode))).toBe(true);
  });
});
