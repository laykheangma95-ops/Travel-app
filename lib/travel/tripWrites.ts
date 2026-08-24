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
import { log } from '@/lib/logger';
import { loadTravelerContext } from './context';
import { emptyReadiness, type TripSummary } from './state';
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
 * Goes back through loadTravelerContext rather than mapping the row directly.
 * That costs an extra round of queries on a write, which is rare, and buys the
 * guarantee that a freshly created trip can never render differently from the
 * same trip on the next page load — including its readiness, which depends on
 * flights and eSIM orders this row knows nothing about.
 *
 * WHAT WENT WRONG HERE, AND WHAT CHANGED:
 *   This used to search the context's trip list and answer NOT_FOUND when the
 *   id was absent. The list is capped and, until now, was blanked entirely by a
 *   single unknown column on a half-migrated database — so "absent from the
 *   list" was never a reliable synonym for "does not exist". A traveler who had
 *   just successfully created a trip was told, on the create screen, that the
 *   trip could not be found. The row was in the database; only the read-back
 *   had failed. Pressing the button again made a second one.
 *
 *   Two things now stand between that and the traveler: `ensureTripId`, which
 *   fetches the row by id when the list does not carry it, and the outage check
 *   below, which refuses to call an unreadable table an empty one.
 */
export async function tripById(request: Request, tripId: string): Promise<TripSummary> {
  const context = await loadTravelerContext(request, { ensureTripId: tripId });
  const trip = context.trips.find((candidate) => candidate.id === tripId);
  if (trip) return trip;

  if (context.tripsUnavailable) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'We could not reach your trips just now.');
  }

  // Reached only by a genuine read now — a trip that is not there, or is
  // somebody else's. The write paths go through `tripAfterWrite` below, which
  // is why this can go back to saying plainly that the trip is missing: it can
  // no longer be the answer to "I just created this".
  throw new ApiError('NOT_FOUND', 'That trip could not be found.');
}

/**
 * The trip as the traveler just wrote it, for the one case where the row is
 * known to exist but could not be read back.
 *
 * A write that has already committed must not be reported as a failure. If the
 * read-back is what broke, the honest answer is still "your trip was created" —
 * with the derived parts (readiness, destination flag) left at their neutral
 * values, because the very next page load derives them properly. Getting this
 * wrong is worse than getting it thin: an error here sends the traveler back to
 * a Create button that has already succeeded once.
 */
export function provisionalTrip(id: string, draft: TripDraft): TripSummary {
  return {
    id,
    title: draft.title.trim(),
    destination: draft.destination.trim(),
    destinationSlug: null,
    flag: null,
    startDate: draft.startDate,
    endDate: draft.endDate,
    travelers: draft.travelers,
    interests: draft.interests,
    readiness: emptyReadiness(),
    coverImageUrl: null,
    isWishlist: false,
  };
}

/**
 * `tripById`, but a failed read-back never loses a committed write.
 * Used by the create and edit routes; the plain reads still 404 honestly.
 */
export async function tripAfterWrite(
  request: Request,
  tripId: string,
  draft: TripDraft
): Promise<TripSummary> {
  try {
    return await tripById(request, tripId);
  } catch (error) {
    log.warn('travel.trip_readback_failed', {
      tripId,
      error: error instanceof Error ? error.message : String(error),
    });
    return provisionalTrip(tripId, draft);
  }
}
