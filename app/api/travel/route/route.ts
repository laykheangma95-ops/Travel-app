import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser } from '@/lib/serverAuth';
import type { RoutedJourney } from '@/lib/travel/itinerary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const point = z.object({ id: z.string().uuid(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const requestSchema = z.object({ points: z.array(point).min(2).max(12) }).strict();
interface OsrmResponse {
  code?: string;
  routes?: Array<{ legs?: Array<{ distance?: number; duration?: number }>; geometry?: { coordinates?: [number, number][] } }>;
}

export const POST = route(async (request) => {
  await requireUser(request);
  const parsed = requestSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) throw new ApiError('BAD_REQUEST', 'That route request is not valid.');
  const configuredBase = process.env.OSRM_BASE_URL?.trim();
  if (!configuredBase) throw new ApiError('SERVICE_UNAVAILABLE', 'Live travel times are not configured yet.');

  const { points } = parsed.data;
  const coordinates = points.map((item) => `${item.lng},${item.lat}`).join(';');
  const base = configuredBase.replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  let response: Response;
  try {
    response = await fetch(`${base}/route/v1/driving/${coordinates}?alternatives=false&steps=false&overview=full&geometries=geojson`, {
      signal: controller.signal, headers: { 'User-Agent': 'Domner-Itinerary/1.0' },
    });
  } catch {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Live travel times are temporarily unavailable.');
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw new ApiError('SERVICE_UNAVAILABLE', 'Live travel times are temporarily unavailable.');
  const body = (await response.json().catch(() => null)) as OsrmResponse | null;
  const first = body?.routes?.[0];
  if (body?.code !== 'Ok' || !first?.legs || first.legs.length !== points.length - 1) {
    throw new ApiError('NOT_FOUND', 'No road route was found between these stops.');
  }
  const journey: RoutedJourney = {
    provider: 'osrm', profile: 'driving',
    legs: first.legs.map((leg, index) => ({
      fromPlaceId: points[index].id, toPlaceId: points[index + 1].id,
      distanceMeters: Math.max(0, Math.round(leg.distance ?? 0)),
      durationSeconds: Math.max(0, Math.round(leg.duration ?? 0)),
    })),
    geometry: first.geometry?.coordinates ?? [],
  };
  return ok(journey, { headers: { 'Cache-Control': 'private, max-age=300' } });
}, { rateLimit: 'session', name: 'travel.route.read' });
