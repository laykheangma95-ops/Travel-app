// ─────────────────────────────────────────────────────────────────────────────
// GET /api/esim/usage?order=DMN-2026-00042
//
// "How much data have I got left?" — the single most-asked question of any eSIM
// customer, and until now the app could not answer it.
//
// THE HONESTY RULE, which is the whole reason this route is more than four
// lines: GoHub's data-usage endpoint returns a fully zeroed package for several
// perfectly healthy eSIMs (an eSIM not yet activated, an ICCID the telco has
// not reported on yet). `normalizeDataUsage` already distinguishes those with
// `usageAvailable`. Rendering those zeros would tell a customer standing in a
// foreign airport that their data is gone when it is not — so when the supplier
// cannot answer, this route says `available: false` and the UI shows the plan
// facts instead of a number. A missing number is a small disappointment. A
// wrong number is a support ticket and a refund request.
//
// Ownership is enforced by construction: we only ever look at orders that
// `listOrdersForUser` returned for THIS user. An ICCID is a credential-shaped
// thing, and it is never accepted from the query string.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, ok, route } from '@/lib/http';
import { requireUser } from '@/lib/serverAuth';
import { listOrdersForUser, ordersPersistenceAvailable } from '@/lib/orders';
import { gohub, isConfigured } from '@/lib/gohub';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Why we cannot show a number. The UI renders a different sentence for each. */
export type UsageUnavailableReason =
  | 'not_configured'
  | 'no_iccid'
  | 'not_activated'
  | 'supplier_silent'
  | 'supplier_error';

export const GET = route(
  async (request) => {
    const user = await requireUser(request);
    const orderNumber = new URL(request.url).searchParams.get('order')?.trim();

    if (!orderNumber) {
      throw new ApiError('BAD_REQUEST', 'An order number is required.');
    }

    if (!ordersPersistenceAvailable()) {
      return ok({ available: false, reason: 'not_configured' satisfies UsageUnavailableReason });
    }

    const orders = await listOrdersForUser(user.id, user.email ?? null);
    const order = orders.find((o) => o.order_number === orderNumber);

    // Deliberately NOT_FOUND rather than FORBIDDEN for an order that exists but
    // belongs to someone else: a 403 confirms the order number is real, which
    // turns this into an order-number oracle.
    if (!order) {
      throw new ApiError('NOT_FOUND', 'Order not found.');
    }

    // The eSIM has not been issued yet — the order is still pending or paid.
    if (!order.esim_iccid) {
      return ok({
        available: false,
        reason: 'no_iccid' satisfies UsageUnavailableReason,
        plan: planFacts(order),
      });
    }

    if (!isConfigured()) {
      return ok({
        available: false,
        reason: 'not_configured' satisfies UsageUnavailableReason,
        plan: planFacts(order),
      });
    }

    try {
      const usage = await gohub.getDataUsage(order.esim_iccid);

      if (!usage.usageAvailable) {
        return ok({
          available: false,
          reason: (usage.activatedAt
            ? 'supplier_silent'
            : 'not_activated') satisfies UsageUnavailableReason,
          plan: planFacts(order),
        });
      }

      return ok({
        available: true,
        usedMb: usage.usedMb,
        remainingMb: usage.remainingMb,
        grantedMb: usage.grantedMb,
        activatedAt: usage.activatedAt,
        expiresAt: usage.activationExpiryDate,
        status: usage.status,
        // The client stamps "updated N minutes ago" off this. Carrier-reported
        // usage lags reality by anywhere from minutes to hours, and presenting
        // a lagging number as live is how you get accused of stealing data.
        fetchedAt: new Date().toISOString(),
        plan: planFacts(order),
      });
    } catch (error) {
      // A supplier outage must not blank out the page. Degrade to the plan
      // facts we hold ourselves, which are still useful.
      log.warn('esim.usage.supplier_failed', {
        orderNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return ok({
        available: false,
        reason: 'supplier_error' satisfies UsageUnavailableReason,
        plan: planFacts(order),
      });
    }
  },
  { rateLimit: 'esimUsage', name: 'esim.usage' }
);

/**
 * What we know without asking anyone. Always returned, so the card has
 * something true to render even when the supplier says nothing.
 */
function planFacts(order: {
  country: string;
  plan_name: string;
  duration_days: number;
  data_gb_daily: number;
  fulfilled_at: string | null;
}) {
  return {
    country: order.country,
    planName: order.plan_name,
    durationDays: order.duration_days,
    dataGbDaily: order.data_gb_daily,
    fulfilledAt: order.fulfilled_at,
  };
}
