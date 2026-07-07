import { NextResponse } from 'next/server';
import { fetchAirportBoard } from '@/lib/aeroDataBox';

// GET /api/fids?airport=KTI — live departure board for an airport
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const airport = searchParams.get('airport');
  if (!airport || !/^[A-Za-z]{3}$/.test(airport)) {
    return NextResponse.json({ error: 'Provide a 3-letter airport code, e.g. ?airport=KTI' }, { status: 400 });
  }

  try {
    const flights = await fetchAirportBoard(airport);
    return NextResponse.json(
      { airport: airport.toUpperCase(), flights },
      { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=60' } }
    );
  } catch {
    return NextResponse.json({ error: 'Board unavailable' }, { status: 502 });
  }
}
