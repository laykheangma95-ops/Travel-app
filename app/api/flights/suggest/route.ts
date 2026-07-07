import { NextResponse } from 'next/server';
import { suggestFlights } from '@/lib/aeroDataBox';

// GET /api/flights/suggest?q=TG — autocomplete flight numbers as the user types
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  if (q.trim().length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = await suggestFlights(q);
  return NextResponse.json(
    { suggestions },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=600' } }
  );
}
