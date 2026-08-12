// GET /api/flights/predict?number=QH215&date=2026-07-08
// Domner Intelligence inbound-aircraft delay prediction.

import { predictDelay } from '@/lib/delayPrediction';
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
      const prediction = await predictDelay(number, date);
      return ok(prediction, {
        headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
      });
    } catch (error) {
      log.warn('flights.prediction_unavailable', { number, date, error });
      throw new ApiError('SERVICE_UNAVAILABLE', 'Delay prediction is unavailable right now.');
    }
  },
  { rateLimit: 'flightData', name: 'flights.predict' }
);
