// ─────────────────────────────────────────────────────────────────────────────
// The saved-place library — GET, POST and DELETE on one address.
//
// NOT /api/travel/places/save. That endpoint puts a place on a TRIP and is
// unchanged; this one is a traveler's own library, with no trip in it. Two
// verbs on two nouns, kept apart deliberately: a caller that wants a bookmark
// should not have to answer "which trip?".
//
// Deliberately thin, like every other travel route: it validates the wire shape
// and hands off to lib/places/saved.ts, where the decisions live (rule 9). It
// runs on the CALLER'S session client, never the service role — RLS is what
// confines a traveler to their own library.
//
// THE CLIENT NAMES A PLACE, IT DOES NOT DESCRIBE ONE. The only thing accepted
// here is a canonical place id. No name, no coordinates, no verification level,
// and no `collection_id` — collections do not exist yet, and a field the API
// accepts is a field somebody will fill in.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import {
  getSavedDestinations,
  getSavedPlaces,
  isPlaceSaved,
  savePlace,
  unsavePlace,
  SAVED_PLACES_PAGE_SIZE,
} from '@/lib/places/saved';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const saveRequest = z
  .object({
    placeId: z.string().uuid(),
    /**
     * The import this save came from, when it came from one. Optional, and
     * only ever provenance — nothing about a save depends on it. Phase 2 has
     * no importer wired to canonical places, so in practice this is absent.
     */
    sourceImportId: z.string().uuid().optional(),
  })
  .strict();

const unsaveRequest = z.object({ placeId: z.string().uuid() }).strict();

/** The caller's session client, or a 503 in the shape every other route uses. */
function clientFor(request: Request) {
  if (!getSupabase()) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Saved places are unavailable right now.');
  }
  const supabase = supabaseFromRequest(request);
  if (!supabase) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Saved places are unavailable right now.');
  }
  return supabase;
}

/**
 * GET — three questions, one address.
 *
 *   ?placeId=…      is this one saved?           → { saved }
 *   ?destination=…  my library, one country      → { places, destinations }
 *   (neither)       my library                   → { places, destinations }
 *
 * The single-place form exists so a place card can ask about itself without
 * fetching the whole library. A LIST of cards must not use it once per card —
 * `savedPlaceIdsAmong` answers a whole screen in one query.
 */
export const GET = route(
  async (request) => {
    // requireUser FIRST. A signed-out caller must get 401, not the 503 that
    // "no session client" would otherwise produce — the two mean entirely
    // different things to a client deciding whether to offer a sign-in link.
    const user = await requireUser(request);
    const supabase = clientFor(request);
    const url = new URL(request.url);

    const placeId = url.searchParams.get('placeId');
    if (placeId) {
      if (!z.string().uuid().safeParse(placeId).success) {
        throw new ApiError('BAD_REQUEST', 'That is not a place we recognise.');
      }
      return ok({ saved: await isPlaceSaved(supabase, user.id, placeId) });
    }

    const destination = url.searchParams.get('destination')?.trim() || null;
    const limitParam = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : SAVED_PLACES_PAGE_SIZE;

    const [places, destinations] = await Promise.all([
      getSavedPlaces(supabase, user.id, { destination, limit }),
      getSavedDestinations(supabase, user.id),
    ]);

    return ok({ places, destinations });
  },
  { rateLimit: 'catalog', name: 'travel.places.saved.list' }
);

/**
 * POST — save a place. Idempotent: saving twice is saving once, and the
 * response says which happened so the UI can stay honest without guessing.
 */
export const POST = route(
  async (request) => {
    const user = await requireUser(request);
    const supabase = clientFor(request);

    const parsed = saveRequest.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      throw new ApiError('BAD_REQUEST', 'That place could not be saved.');
    }

    const result = await savePlace(supabase, user.id, parsed.data.placeId, {
      sourceImportId: parsed.data.sourceImportId ?? null,
    });

    // Null means the write was refused, and the only way that happens for a
    // well-formed request is a place this traveler is not allowed to see. Said
    // as NOT_FOUND rather than FORBIDDEN: "you may not see this" and "this does
    // not exist" should look identical from outside, or the error becomes a way
    // to enumerate other people's unverified places.
    if (!result) throw new ApiError('NOT_FOUND', 'We could not find that place.');

    return ok(result);
  },
  { rateLimit: 'tripWrite', name: 'travel.places.saved.save' }
);

/**
 * DELETE — unsave. Idempotent, and it cannot reach the canonical place: it
 * removes a row from `saved_places`, which is ON DELETE RESTRICT against
 * `places` and has no bearing on it whatsoever.
 */
export const DELETE = route(
  async (request) => {
    const user = await requireUser(request);
    const supabase = clientFor(request);

    // Accepts the id in the body or the query string. A DELETE with a body is
    // legal but awkward for some clients, and `navigator.sendBeacon` cannot do
    // it at all.
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get('placeId');
    const body = fromQuery ? { placeId: fromQuery } : await readJson<unknown>(request);

    const parsed = unsaveRequest.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('BAD_REQUEST', 'That place could not be removed.');
    }

    return ok(await unsavePlace(supabase, user.id, parsed.data.placeId));
  },
  { rateLimit: 'tripWrite', name: 'travel.places.saved.unsave' }
);
