// GET /api/flights/suggest?q=TG — autocomplete flight numbers as the user types.

import { suggestFlights } from '@/lib/aeroDataBox';
import { ok, route } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = route(
  async (request) => {
    const { searchParams } = new URL(request.url);
    // Bounded before it reaches the upstream lookup: this fires on every
    // keystroke, so it is the easiest endpoint in the app to abuse.
    const q = (searchParams.get('q') ?? '').trim().slice(0, 10);

    if (q.length < 2) return ok({ suggestions: [] });

    const suggestions = await suggestFlights(q);
    return ok(
      { suggestions },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=600' } }
    );
  },
  { rateLimit: 'flightData', name: 'flights.suggest' }
);
