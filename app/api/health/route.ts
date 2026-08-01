// GET /api/health — deployment readiness.
//
// Reports which integrations are configured WITHOUT revealing any secret. Point
// an uptime monitor at this: it returns 503 the moment a production deploy is
// missing something that would otherwise degrade into demo behavior.

import { NextResponse } from 'next/server';
import { configReport, demoModeAllowed, isProduction } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Missing any of these in production means we cannot safely take money. */
const PRODUCTION_CRITICAL = ['supabase', 'supabaseAdmin', 'stripeWebhook', 'admin'] as const;

export function GET() {
  const services = configReport();

  const degraded = isProduction
    ? PRODUCTION_CRITICAL.filter((service) => !services[service])
    : [];

  const healthy = degraded.length === 0;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      environment: isProduction ? 'production' : 'development',
      demoFallbacksAllowed: demoModeAllowed,
      services,
      degraded,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
