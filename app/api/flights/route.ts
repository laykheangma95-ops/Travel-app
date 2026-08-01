// GET /api/flights?number=QH215&date=2026-07-04 — scheduled flight status.

import { fetchFlightStatus } from '@/lib/aeroDataBox';
import { todayIso } from '@/lib/utils';
import { ApiError, ok, route } from '@/lib/http';
import { parseFlightNumber, parseIsoDate } from '@/lib/flightInput';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

export const GET = route(
  async (request) => {
    const { searchParams } = new URL(request.url);
    const number = parseFlightNumber(searchParams.get('number'));
    const date = parseIsoDate(searchParams.get('date'), todayIso());

    try {
      const status = await fetchFlightStatus(number, date);
      return ok(status, {
        headers: { 'Cache-Control': 's-maxage=90, stale-while-revalidate=30' },
      });
    } catch (error) {
      log.warn('flights.status_unavailable', { number, date, error });
      throw new ApiError('NOT_FOUND', 'We could not find that flight. Check the number and date.');
    }
  },
  { rateLimit: 'flightData', name: 'flights.status' }
);
