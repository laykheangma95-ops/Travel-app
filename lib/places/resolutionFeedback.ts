// ─────────────────────────────────────────────────────────────────────────────
// Applying a traveler's confirm/reject/correct decision about a canonical
// resolution proposal — Phase 13.
//
// THE CLIENT SENDS ALMOST NOTHING. app/api/travel/destination-places/[id]/
// resolution/route.ts accepts only `{ decision, correctedPlaceId? }`. Every
// other fact this module needs — which place was proposed, what the
// confidence and reason signals were, which import produced the place, which
// canonical id an INSERT trigger elsewhere could not have forged — is
// RE-DERIVED here, server-side, from the traveler's own `destination_places`
// row. Possession of a destinationPlaceId in a URL is not authorization, and
// a client-supplied confidence or resolverVersion would not be evidence of
// anything.
//
// WHY THE PROPOSAL IS RE-DERIVED RATHER THAN READ BACK FROM SOMEWHERE IT WAS
// STORED: nothing stores a pending proposal. Phase 13 deliberately adds no
// "awaiting confirmation" status anywhere (see docs/PLACE-IMPORT.md — this is
// NOT place_imports.needs_confirmation, which stays reserved and unused).
// The proposal a traveler saw on the import "saved" screen is reproducible
// on demand from the same name+coordinates lib/places/repository.ts's
// proposeCanonicalResolution already used to build it — deterministic input,
// deterministic output, same resolver_version. The one honest cost: if the
// registry has changed in between (a new nearby place appeared, the proposed
// one was deleted), re-derivation can disagree with what was shown, and this
// module reports that as `no-proposal` rather than applying a decision about
// a proposal that no longer holds.
//
// THE ACTUAL WRITE goes through ONE call: the SECURITY INVOKER RPC
// (migration 017's apply_place_resolution_feedback), which updates
// destination_places.canonical_place_id AND inserts/updates
// place_resolution_feedback in one transaction. See that migration's own
// comment for why this needs to be one statement rather than two.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { proposeCanonicalResolution } from './repository';

export type ResolutionFeedbackDecision = 'confirmed' | 'rejected' | 'corrected';

export interface ApplyResolutionFeedbackInput {
  destinationPlaceId: string;
  decision: ResolutionFeedbackDecision;
  /** Required, and only meaningful, when decision === 'corrected'. Ignored
   *  otherwise — a client sending it alongside 'confirmed' is not an error,
   *  it is simply not read. */
  correctedPlaceId?: string | null;
}

export type ApplyResolutionFeedbackResult =
  | { outcome: 'applied'; canonicalPlaceId: string | null }
  | { outcome: 'not-found' }
  /** The registry has moved on since the traveler was shown a question — a
   *  re-derived proposal no longer exists or is no longer ambiguous. Not an
   *  error: the caller reports this plainly rather than applying a decision
   *  about a proposal that no longer holds. */
  | { outcome: 'no-proposal' }
  /** decision === 'corrected' named a place that is not among the
   *  alternatives this proposal actually offered. */
  | { outcome: 'invalid-correction' }
  | { outcome: 'failed' };

interface DestinationPlaceRow {
  id: string;
  name: string;
  destination: string;
  lat: number | string;
  lng: number | string;
  created_by: string | null;
}

/**
 * Apply a traveler's decision about their own canonical-resolution proposal.
 *
 * TRAVELER-SCOPED. Runs entirely on the caller's session client — RLS is what
 * confines the destination_places lookup and the RPC call both to rows this
 * traveler actually owns; there is no service_role anywhere in this path.
 */
export async function applyResolutionFeedback(
  supabase: SupabaseClient,
  userId: string,
  input: ApplyResolutionFeedbackInput
): Promise<ApplyResolutionFeedbackResult> {
  const { data, error } = await supabase
    .from('destination_places')
    .select('id,name,destination,lat,lng,created_by')
    .eq('id', input.destinationPlaceId)
    .maybeSingle();

  if (error || !data) return { outcome: 'not-found' };
  const row = data as DestinationPlaceRow;
  // Editorial rows (created_by NULL) and another traveler's rows both fail
  // this the same way — RLS already limits what SELECT can even see, this is
  // the explicit ownership check the RPC's own UPDATE...WHERE will re-assert
  // regardless.
  if (row.created_by !== userId) return { outcome: 'not-found' };

  const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat);
  const lng = typeof row.lng === 'number' ? row.lng : Number(row.lng);

  // Re-derived, never trusted from the client. See this module's header.
  const proposal = await proposeCanonicalResolution(
    supabase,
    { name: row.name, countryName: row.destination, city: null, latitude: lat, longitude: lng },
    { pinOrigin: 'unknown', geocoderResultCount: null }
  );

  if (!proposal || proposal.decision !== 'ambiguous') {
    return { outcome: 'no-proposal' };
  }

  let correctedPlaceId: string | null = null;
  if (input.decision === 'corrected') {
    const offered = new Set([proposal.place.id, ...proposal.alternatives.map((a) => a.place.id)]);
    if (!input.correctedPlaceId || !offered.has(input.correctedPlaceId)) {
      return { outcome: 'invalid-correction' };
    }
    correctedPlaceId = input.correctedPlaceId;
  }

  // Provenance, best-effort — the accepted candidate this destination_places
  // row came from, if it came from one. markCandidateAccepted (Phase 1) is
  // the only writer of `resolved_place_id`, so this lookup is exactly its
  // inverse.
  let importId: string | null = null;
  let importCandidateId: string | null = null;
  try {
    const { data: candidateRow } = await supabase
      .from('import_candidates')
      .select('id,import_id')
      .eq('resolved_place_id', row.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (candidateRow) {
      const candidate = candidateRow as { id: string; import_id: string };
      importCandidateId = candidate.id;
      importId = candidate.import_id;
    }
  } catch {
    // Provenance only — a lookup failure here must not block the decision.
  }

  const { data: applied, error: rpcError } = await supabase.rpc('apply_place_resolution_feedback', {
    p_destination_place_id: row.id,
    p_decision: input.decision,
    p_proposed_place_id: proposal.place.id,
    p_corrected_place_id: correctedPlaceId,
    p_resolution_confidence: proposal.confidence,
    p_resolver_version: proposal.resolverVersion,
    p_reason_signals: proposal.reasonSignals,
    p_import_id: importId,
    p_import_candidate_id: importCandidateId,
  });

  if (rpcError || !applied) {
    log.warn('place_resolution_feedback.apply_failed', {
      reason: rpcError && typeof rpcError === 'object' && 'message' in rpcError
        ? String((rpcError as { message: unknown }).message).slice(0, 160)
        : 'unknown',
    });
    return { outcome: 'failed' };
  }

  const row2 = applied as { decision: string; corrected_place_id: string | null };
  const canonicalPlaceId =
    row2.decision === 'rejected' ? null : (row2.corrected_place_id ?? proposal.place.id);

  return { outcome: 'applied', canonicalPlaceId };
}
