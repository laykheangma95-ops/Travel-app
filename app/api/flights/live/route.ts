// GET /api/flights/live?number=VN841 — real-time aircraft position from the
// open ADS-B network (no API key required).

import { fetchLiveFlight } from '@/lib/liveFlight';
import { ok, route } from '@/lib/http';
import { parseFlightNumber } from '@/lib/flightInput';

export const runtime = 'nodejs';

export const GET = route(
  async (request) => {
    const { searchParams } = new URL(request.url);
    const number = parseFlightNumber(searchParams.get('number'));

    const result = await fetchLiveFlight(number);
    return ok(result, {
      headers: { 'Cache-Control': 's-maxage=15, stale-while-revalidate=15' },
    });
  },
  // These providers are free, community-funded networks we do not own. Being a
  // bad neighbour here gets our egress IP banned for every user.
  { rateLimit: 'flightData', name: 'flights.live' }
);
