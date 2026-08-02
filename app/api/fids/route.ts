// GET /api/fids?airport=PNH — live departure board for an airport.

import { fetchAirportBoard } from '@/lib/aeroDataBox';
import { ApiError, ok, route } from '@/lib/http';
import { parseAirportCode } from '@/lib/flightInput';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

export const GET = route(
  async (request) => {
    const { searchParams } = new URL(request.url);
    const airport = parseAirportCode(searchParams.get('airport'));

    try {
      const flights = await fetchAirportBoard(airport);
      return ok(
        { airport, flights },
        { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=60' } }
      );
    } catch (error) {
      log.warn('fids.board_unavailable', { airport, error });
      throw new ApiError('SERVICE_UNAVAILABLE', 'The live board is unavailable right now.');
    }
  },
  { rateLimit: 'flightData', name: 'fids.board' }
);
