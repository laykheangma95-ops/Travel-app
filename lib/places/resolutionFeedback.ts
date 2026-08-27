// ─────────────────────────────────────────────────────────────────────────────
// Applying a traveler's confirm/reject/correct decision about a canonical
// resolution proposal — Phase 13.
//
// THE PROPOSAL IS READ, NOT REBUILT.
//   The first cut of this module RE-DERIVED the proposal at decision time, by
//   running the resolver again over the traveler's `destination_places` row.
//   The Phase 13 review proved why that cannot work: the row does not record
//   how its pin was obtained, so re-derivation scored with pinOrigin
//   'unknown' where the import had scored with 'geocoder'. The x0.8 penalty
//   vanished, confidence rose by 1.25x, and every geocoder-pinned match within
//   45m re-derived as `auto` — so the server answered "no-proposal" to a card
//   the traveler was looking at. The tap did nothing, `canonical_place_id`
//   stayed NULL, and no feedback row was ever written. Where re-derivation did
//   still land in the ambiguous band, it stored a confidence and a pinOrigin
//   the traveler had never been shown.
//
//   So nothing is recomputed here. `lib/travel/placeImport.ts` records the
//   proposal as a `pending` row at the moment it is made (migration 017's
//   create_place_resolution_proposal), and this reads that row back. Shown and
//   stored cannot disagree, because there is only ever one computation of
//   either.
//
// THE CLIENT SENDS ALMOST NOTHING. app/api/travel/destination-places/[id]/
// resolution/route.ts accepts only `{ decision, correctedPlaceId? }`. There is
// no confidence, no resolver version, no signals and no proposed place on the
// wire — a caller cannot state any of them, here or through PostgREST, because
// migration 017's guard refuses any write that did not come through the
// resolution functions themselves.
//
// THE WRITE is one atomic call: apply_place_resolution_feedback flips the
// pending row to the decision AND applies/clears
// destination_places.canonical_place_id in a single transaction. See that
// migration's own comment for why this cannot be two calls.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

export type ResolutionFeedbackDecision = 'confirmed' | 'rejected' | 'corrected';

export interface ApplyResolutionFeedbackInput {
  destinationPlaceId: string;
  decision: ResolutionFeedbackDecision;
  /** Required, and only meaningful, when decision === 'corrected'. It must name
   *  the proposal itself or one of the alternatives that proposal actually
   *  offered — the database checks that against the stored
   *  `alternative_place_ids`, so "a place I can see" is not enough. */
  correctedPlaceId?: string | null;
}

export type ApplyResolutionFeedbackResult =
  | { outcome: 'applied'; canonicalPlaceId: string | null }
  | { outcome: 'not-found' }
  /** No proposal was ever recorded for this place — it resolved automatically,
   *  or not closely enough to ask about. Not an error, and no longer something
   *  a scoring difference can cause. */
  | { outcome: 'no-proposal' }
  /** `corrected` named a place this proposal did not offer. */
  | { outcome: 'invalid-correction' }
  | { outcome: 'failed' };

/** Postgres SQLSTATEs the RPC raises, mapped to outcomes the route can answer
 *  with. Matched on `code`, never on message text, for the same reason
 *  lib/supabaseError.ts matches 23505 rather than the words "duplicate key". */
const NO_PROPOSAL = 'P0002'; // no_data_found
const NOT_AUTHORIZED = '42501'; // insufficient_privilege
const CHECK_VIOLATION = '23514';

interface PostgrestFailure {
  code?: string;
  message?: string;
}

/**
 * Apply a traveler's decision about their own canonical-resolution proposal.
 *
 * TRAVELER-SCOPED. Runs entirely on the caller's session client — RLS is what
 * confines both the RPC's reads and its writes to rows this traveler actually
 * owns; there is no service_role anywhere in this path, and the RPC is
 * SECURITY INVOKER so every statement inside it is filtered by the same
 * policies.
 */
export async function applyResolutionFeedback(
  supabase: SupabaseClient,
  userId: string,
  input: ApplyResolutionFeedbackInput
): Promise<ApplyResolutionFeedbackResult> {
  // Ownership first, so "this place is not yours" and "this place has no
  // proposal" stay different answers to their owner while remaining the SAME
  // answer to everyone else. The SELECT is RLS-scoped, so a foreign id and a
  // fabricated one both read as nothing here and both become NOT_FOUND —
  // no existence oracle either way. The RPC re-asserts this independently;
  // this is not the security boundary, it is the honest 404.
  const { data: owned } = await supabase
    .from('destination_places')
    .select('id,created_by')
    .eq('id', input.destinationPlaceId)
    .maybeSingle();
  if (!owned || (owned as { created_by: string | null }).created_by !== userId) {
    return { outcome: 'not-found' };
  }

  const { data, error } = await supabase.rpc('apply_place_resolution_feedback', {
    p_destination_place_id: input.destinationPlaceId,
    p_decision: input.decision,
    p_corrected_place_id: input.decision === 'corrected' ? (input.correctedPlaceId ?? null) : null,
  });

  if (error) {
    const failure = error as PostgrestFailure;
    const message = failure.message ?? '';

    // "There is no proposal here" and "this place is not yours" are answered
    // the same way to the caller (the route turns both into NOT_FOUND for a
    // foreign id) — but they are distinguished internally so a legitimate
    // owner whose place simply resolved automatically gets the honest
    // `no-proposal` rather than a 404 about their own place.
    if (failure.code === NO_PROPOSAL) return { outcome: 'no-proposal' };
    if (failure.code === NOT_AUTHORIZED) return { outcome: 'not-found' };
    if (failure.code === CHECK_VIOLATION) {
      if (message.includes('was not offered') || message.includes('must name the place')) {
        return { outcome: 'invalid-correction' };
      }
      return { outcome: 'failed' };
    }

    log.warn('place_resolution_feedback.apply_failed', {
      code: failure.code,
      reason: message.slice(0, 160),
    });
    return { outcome: 'failed' };
  }

  if (!data) return { outcome: 'failed' };

  const row = data as { decision: string; proposed_place_id: string | null; corrected_place_id: string | null };
  const canonicalPlaceId =
    row.decision === 'rejected' ? null : (row.corrected_place_id ?? row.proposed_place_id ?? null);

  return { outcome: 'applied', canonicalPlaceId };
}
