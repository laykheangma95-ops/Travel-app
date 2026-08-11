import { Router } from 'express';
import { paginated } from '../envelope';
import { categoryParentOf, categories, findListing, items, listings } from '../state';

export const catalogRouter: Router = Router();

/**
 * The catalog endpoints return InActive rows too. Dropping them is our
 * filtering layer's job, not the supplier's — and a supplier that silently
 * stopped returning a listing would look identical to one that never had it.
 */

catalogRouter.get('/categories', (req, res) => {
  const parent = str(req.query.parentCategoryCode);
  const rows = parent
    ? categories.filter((category) => categoryParentOf(category) === parent)
    : categories;

  paginated(res, rows, req.query, 'Get categories successfully');
});

catalogRouter.get('/listings', (req, res) => {
  const categoryCode = str(req.query.categoryCode);
  const simType = str(req.query.simType);

  const rows = listings.filter((listing) => {
    if (categoryCode && !listing.categories.some((c) => c.categoryCode === categoryCode)) {
      return false;
    }
    // Case-sensitive on purpose: GoHub matches "eSIM" exactly and returns an
    // empty list for "esim". Better we fail the same way in development.
    if (simType && specValue(listing.listingCode, 'S1') !== simType) return false;
    return true;
  });

  paginated(res, rows, req.query, 'Get listings successfully');
});

catalogRouter.get('/items', (req, res) => {
  const listingCode = str(req.query.listingCode);
  const simType = str(req.query.simType);

  const rows = items.filter((item) => {
    if (listingCode && item.listing.listingCode !== listingCode) return false;
    if (simType && specValue(item.listing.listingCode, 'S1') !== simType) return false;
    return true;
  });

  paginated(res, rows, req.query, 'Get items successfully');
});

function specValue(listingCode: string, code: string): string {
  const listing = findListing(listingCode);
  return listing?.specifications.find((s) => s.specificationCode === code)?.specificationValue ?? '';
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
