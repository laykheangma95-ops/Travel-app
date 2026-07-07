import { NextResponse } from 'next/server';
import { fetchLiveFlight } from '@/lib/liveFlight';

// GET /api/flights/live?number=VN841 — real-time aircraft position from the
// open ADS-B network (no API key required).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get('number');
  if (!number) {
    return NextResponse.json({ error: 'Missing flight number' }, { status: 400 });
  }

  const result = await fetchLiveFlight(number);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 's-maxage=15, stale-while-revalidate=15' },
  });
}
