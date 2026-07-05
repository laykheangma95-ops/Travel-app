import { NextResponse } from 'next/server';
import { fetchFlightStatus } from '@/lib/aeroDataBox';
import { getSupabaseAdmin } from '@/lib/supabase';
import { todayIso } from '@/lib/utils';

// GET /api/flights?number=QH215&date=2026-07-04 — live flight status
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get('number');
  const date = searchParams.get('date') ?? todayIso();

  if (!number) {
    return NextResponse.json({ error: 'Missing flight number' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const status = await fetchFlightStatus(number, date);
    return NextResponse.json(status, {
      headers: { 'Cache-Control': 's-maxage=90, stale-while-revalidate=30' },
    });
  } catch {
    return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
  }
}

// POST /api/flights — save a flight to the user's trip (and create share row)
export async function POST(request: Request) {
  const body = (await request.json()) as { flightNumber?: string; date?: string };
  if (!body.flightNumber || !body.date) {
    return NextResponse.json({ error: 'Missing flightNumber or date' }, { status: 400 });
  }

  const shareToken = `${body.flightNumber.replace(/\s+/g, '').toLowerCase()}-${body.date}`;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: saved } = await supabase
      .from('saved_flights')
      .insert({
        flight_number: body.flightNumber.replace(/\s+/g, '').toUpperCase(),
        flight_date: body.date,
        share_token: shareToken,
      })
      .select('id')
      .single();
    if (saved) {
      await supabase.from('flight_shares').insert({ saved_flight_id: saved.id, share_token: shareToken });
    }
  }

  return NextResponse.json({ ok: true, shareToken });
}
