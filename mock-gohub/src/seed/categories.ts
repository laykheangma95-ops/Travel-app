import type { CategorySeed } from './schema';

/**
 * Country Region rows are the ones our product pages key off. The list leads
 * with our actual market — Cambodia and the neighbours a Khmer traveller
 * crosses into — then the wider regional bundles.
 *
 * `MMR` is deliberately InActive so the filtering layer has something to drop.
 */
export const CATEGORY_SEED: CategorySeed[] = [
  { categoryType: 'Country Region', categoryCode: 'KH', categoryName: 'Cambodia', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'TH', categoryName: 'Thailand', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'VN', categoryName: 'Vietnam', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'SG', categoryName: 'Singapore', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'MY', categoryName: 'Malaysia', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'ID', categoryName: 'Indonesia', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'LA', categoryName: 'Laos', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'PH', categoryName: 'Philippines', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'JP', categoryName: 'Japan', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'KR', categoryName: 'South Korea', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'STA', categoryName: 'Southeast Asia', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'ASI', categoryName: 'Asia', status: 'Active' },
  { categoryType: 'Country Region', categoryCode: 'GLO', categoryName: 'Global', status: 'Active' },
  {
    categoryType: 'Country Region',
    categoryCode: 'SMT',
    categoryName: 'Singapore - Malaysia - Thailand',
    status: 'Active',
  },
  // Retired destination — present in the API, must never reach a product page.
  { categoryType: 'Country Region', categoryCode: 'MMR', categoryName: 'Myanmar', status: 'InActive' },

  { categoryType: 'ProductType', categoryCode: 'DATA', categoryName: 'Data Only', status: 'Active' },
  {
    categoryType: 'ProductType',
    categoryCode: 'DATA_VOICE',
    categoryName: 'Data and Voice',
    status: 'Active',
  },
  { categoryType: 'ProductType', categoryCode: 'TOPUP', categoryName: 'Top-up', status: 'Active' },
];

/**
 * `parentCategoryCode` grouping. GoHub exposes the filter on /api/categories;
 * every Country Region row hangs off `REGION`, every ProductType off `TYPE`.
 */
export const CATEGORY_PARENTS: Record<string, string> = {
  'Country Region': 'REGION',
  ProductType: 'TYPE',
};
