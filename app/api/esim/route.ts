// ─────────────────────────────────────────────────────────────────────────────
// eSIM catalog.
//
//   GET /api/esim            — all destinations + plans
//   GET /api/esim?country=x  — plans for one destination
//
// The PATCH handler that used to live here marked ANY order fulfilled and
// attached ANY QR code URL, with no authentication whatsoever. It has moved to
// PATCH /api/admin/orders, behind requireAdmin().
// ─────────────────────────────────────────────────────────────────────────────

import { destinations } from '@/data/destinations';
import { esimPlans, getPlansForCountry } from '@/data/esimPlans';
import { ApiError, ok, route } from '@/lib/http';

export const runtime = 'nodejs';

// The catalog is static per deploy, so it can be cached hard at the edge.
const CATALOG_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

export const GET = route(
  async (request) => {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country');

    if (country) {
      const plans = getPlansForCountry(country);
      if (plans.length === 0) {
        throw new ApiError('NOT_FOUND', 'We do not offer that destination yet.');
      }
      return ok({ plans }, { headers: { 'Cache-Control': CATALOG_CACHE } });
    }

    return ok(
      { destinations, plans: esimPlans },
      { headers: { 'Cache-Control': CATALOG_CACHE } }
    );
  },
  { rateLimit: 'catalog', name: 'esim.catalog' }
);
