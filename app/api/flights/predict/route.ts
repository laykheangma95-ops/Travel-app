import { NextResponse } from 'next/server';
import { predictDelay } from '@/lib/delayPrediction';
import { todayIso } from '@/lib/utils';

// GET /api/flights/predict?number=QH215&date=2026-07-08 — Domer Intelligence
// inbound-aircraft delay prediction.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get('number');
  const date = searchParams.get('date') ?? todayIso();

  if (!number) {
    return NextResponse.json({ error: 'Missing flight number' }, { status: 400 });
  }

  try {
    const prediction = await predictDelay(number, date);
    return NextResponse.json(prediction, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });
  } catch {
    return NextResponse.json({ error: 'Prediction unavailable' }, { status: 500 });
  }
}
