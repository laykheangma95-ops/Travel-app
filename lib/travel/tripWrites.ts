// ─────────────────────────────────────────────────────────────────────────────
// The server half of trip writes: parsing a request body into a validated
// draft, and reading one trip back out through the shared loader.
//
// Kept out of the route files so the create and edit routes cannot drift apart,
// and out of lib/travel/trips.ts so that module stays pure and client-safe.
//
// SERVER ONLY.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { z } from 'zod';
import { ApiError } from '@/lib/http';
import { loadTravelerContext } from './context';
import type { TripSummary } from './state';
import {
  TRIP_INTERESTS,
  validateTripDraft,
  type TripDraft,
} from './trips';

/**
 * The wire shape. Deliberately `.strict()`: an unknown key means the client is
 * out of date or trying to set a column that is not the traveler's to set
 * (`user_id`, `is_public`, `share_token`), so the body is rejected rather than
 * partially applied.
 *
 * Shape only. The *rules* — date ordering, length caps, traveller counts — live
 * in validateTripDraft so the form enforces exactly what the server does.
 */
const draftSchema = z
  .object({
    title: z.string(),
    destination: z.string(),
    startDate: z.string().nullable().default(null),
    endDate: z.string().nullable().default(null),
    travelers: z.number().default(1),
    interests: z.array(z.enum(TRIP_INTERESTS)).default([]),
  })
  .strict();

/**
 * Request body → a draft that has passed every rule, or an ApiError carrying
 * the first problem in English.
 *
 * The client re-runs the same validateTripDraft and renders all the errors
 * inline in the traveler's language, so this message is the fallback for a
 * caller that skipped the form — not the primary way anyone sees a validation
 * failure.
 */
export function parseTripDraft(body: unknown): TripDraft {
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('BAD_REQUEST', 'That trip is missing something we need.');
  }

  const draft: TripDraft = {
    title: parsed.data.title,
    destination: parsed.data.destination,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    travelers: parsed.data.travelers,
    interests: parsed.data.interests,
  };

  const errors = validateTripDraft(draft);
  if (errors.length > 0) {
    throw new ApiError('BAD_REQUEST', errors[0].message.en, {
      fields: errors.map((error) => error.field),
    });
  }

  return draft;
}

/**
 * One trip, shaped exactly like the ones in the list.
 *
 * Goes back through loadTravelerContext rather than mapping the inserted row
 * directly. That costs an extra round of queries on a write, which is rare, and
 * buys the guarantee that a freshly created trip can never render differently
 * from the same trip on the next page load — including its readiness, which
 * depends on flights and eSIM orders this row knows nothing about.
 */
export async function tripById(request: Request, tripId: string): Promise<TripSummary> {
  // `ensureTripId` matters here: the context's trip query is capped at 20 and
  // ordered by start_date, so past twenty trips a freshly written row fell
  // outside it and this threw NOT_FOUND on a trip that had just been created.
  const context = await loadTravelerContext(request, { ensureTripId: tripId });
  const trip = context.trips.find((candidate) => candidate.id === tripId);
  // The row was written a moment ago and we simply could not read it back, so
  // saying it "could not be found" told the traveler their trip had failed when
  // it had not — and they pressed create again, leaving a duplicate behind. Say
  // what is actually true: it is saved, we just cannot open it right now.
  if (!trip) {
    throw new ApiError(
      'INTERNAL',
      'Your trip was saved, but we could not open it just now. You will find it in your Trips list.'
    );
  }
  return trip;
}
