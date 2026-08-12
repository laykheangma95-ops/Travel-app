// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/support?q=<order number | email | phone>
//
// The call-centre lookup. Exact match only — see the header of lib/support.ts
// for why a substring search is not offered here.
//
// Rate limited on the 'auth' bucket: even exact-match lookups are a guessing
// surface if you let someone run thousands of them.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, ok, route } from '@/lib/http';
import { requirePermission } from '@/lib/serverAuth';
import { lookupOrders } from '@/lib/support';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const { user: admin } = await requirePermission(request, 'customers.lookup');

    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (!query) {
      throw new ApiError('BAD_REQUEST', 'Enter an order number, email address, or phone number.');
    }
    if (query.length > 128) {
      throw new ApiError('BAD_REQUEST', 'That search term is too long.');
    }

    const orders = await lookupOrders(query, admin.email ?? admin.id);

    return ok({ orders, found: orders.length });
  },
  { rateLimit: 'auth', name: 'admin.support.lookup' }
);
