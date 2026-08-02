// GET /api/health — deployment readiness.
//
// Reports which integrations are configured WITHOUT revealing any secret. Point
// an uptime monitor at this: it returns 503 the moment a production deploy is
// missing something that would otherwise degrade into demo behavior.

import { NextResponse } from 'next/server';
import { configReport, demoModeAllowed, isProduction } from '@/lib/env';
import { providerStatus } from '@/lib/providers/esim/registry';
import { availablePaymentProviders } from '@/lib/providers/payments/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Missing any of these in production means we cannot safely take money. */
const PRODUCTION_CRITICAL = ['supabase', 'supabaseAdmin', 'stripeWebhook', 'admin'] as const;

export function GET() {
  const services = configReport();

  const degraded: string[] = isProduction
    ? PRODUCTION_CRITICAL.filter((service) => !services[service])
    : [];

  const esimProviders = providerStatus();
  const paymentProviders = availablePaymentProviders();

  // Deliberately excluded from the health probe rather than folded into it:
  //
  //   • No eSIM supplier is not an outage. Orders still complete and land in
  //     the ops queue for manual delivery — degraded, not down.
  //   • At least one working payment gateway IS critical. With none, a customer
  //     cannot buy anything at all.
  //
  // A cheap status check must never call a supplier's API, so this reports
  // configuration and circuit state only. Live probes are in /api/admin/providers.
  if (isProduction && !paymentProviders.some((provider) => provider.configured)) {
    degraded.push('payments:none-configured');
  }

  const healthy = degraded.length === 0;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      environment: isProduction ? 'production' : 'development',
      demoFallbacksAllowed: demoModeAllowed,
      services,
      degraded,
      providers: {
        esim: esimProviders.map((provider) => ({
          id: provider.id,
          configured: provider.configured,
          circuitOpen: provider.circuitOpen,
        })),
        payments: paymentProviders,
        // Surfaced so an operator can see at a glance whether orders are being
        // delivered automatically or piling up for a human.
        automaticFulfilment: esimProviders.some((p) => p.configured && !p.circuitOpen),
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
