// GET /api/orders — the signed-in customer's own orders, with line items.
//
// This is what makes "My eSIMs" real. Orders are matched by user_id and by the
// email used at checkout, so a purchase made as a guest still appears once the
// customer creates an account with that address.

import { ok, route } from '@/lib/http';
import { requireUser } from '@/lib/serverAuth';
import { listOrdersForUser, ordersPersistenceAvailable } from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const user = await requireUser(request);

    if (!ordersPersistenceAvailable()) {
      return ok({ orders: [], persisted: false });
    }

    const orders = await listOrdersForUser(user.id, user.email ?? null);
    return ok({ orders, persisted: true });
  },
  { rateLimit: 'catalog', name: 'orders.mine' }
);
