import { NextResponse } from 'next/server';
import { fetchSkySnapshot } from '@/lib/liveSky';

// GET /api/flights/sky — compact snapshot of every airborne aircraft near the
// home globe's hub cities, from the open ADS-B network (no API key required).
// Feeds the globe's cinematic live-flight layer.
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await fetchSkySnapshot();
  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
  });
}
