-- Phase 13: canonical-resolution confidence, confirmation, and ground truth.
--
-- THE GAP THIS CLOSES:
--   lib/places/repository.ts's resolvePlaceForTraveler used to attach
--   `nearby[0]` — the nearest same-name match within 150m — unconditionally.
--   Two branches of one café, a mall unit and a street unit, a caption
--   naming a landmark next to the place it is actually about: all of these
--   silently linked a traveler's saved place to whichever canonical row
--   happened to be nearest, with no record that a decision was even made.
--
--   This migration does not change what counts as "nearby" (migration 013's
--   150m/name-match rule is untouched). It adds the table Phase 13's
--   application code (lib/places/resolutionConfidence.ts,
--   lib/places/repository.ts) uses to record what a traveler actually
--   confirmed, rejected or corrected, so a wrong link is now explainable and
--   measurable instead of silent.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   No change to `places`, `place_external_ids`, `destination_places`'s
--   columns, or any existing policy on them (`destination_places`'s own
--   `UPDATE ... own` policy is what the RPC below relies on, unmodified).
--   No change to `verification_status`, its CHECK, or its trigger — a
--   traveler confirming a match NEVER promotes a place toward
--   `provider_verified` or `domner_public`; that is a service-role decision
--   migration 013 already restricts, and nothing here touches it.
--   No change to `place_imports.status` or its vocabulary — Phase 13's
--   ambiguity is discovered AFTER a place is already saved to a trip, not
--   during extraction, so `needs_confirmation` (reserved since migration
--   015 for a future connector-level ambiguity) stays exactly that:
--   reserved, unused by this phase.
--
-- WHY ONE NEW TABLE RATHER THAN A COLUMN ON AN EXISTING ONE:
--   `import_candidates.resolved_place_id` already means something —
--   "which destination_places row did this extraction guess become" — and
--   is extraction ground truth (Phase 1). Conflating it with "which
--   canonical place did the traveler confirm" would make one column answer
--   two different questions depending on which phase wrote it. The two
--   confidences (lib/places/resolutionConfidence.ts's header) stay separate
--   in the schema the same way they stay separate in the code.

-- ── place_resolution_feedback ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS place_resolution_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The traveler's own copy this decision is about. NOT `places.id` — a
  -- destination_places row can exist with canonical_place_id still NULL
  -- (unresolved, or a proposal awaiting this very decision), and this table
  -- has to be reachable in that state.
  destination_place_id UUID NOT NULL REFERENCES destination_places(id) ON DELETE CASCADE,

  -- Provenance, best-effort. NULL for a place added outside the importer (a
  -- manual add, or a saved-library heart with no import behind it) and for
  -- an import row the reaper or a later migration has since removed.
  import_id UUID REFERENCES place_imports(id) ON DELETE SET NULL,
  import_candidate_id UUID REFERENCES import_candidates(id) ON DELETE SET NULL,

  -- What the resolver proposed. NULL only for a decision made with no
  -- proposal on record (should not happen through the app's own route, which
  -- always re-derives one before writing — kept nullable because a place
  -- this pointed at can be deleted out from under it, migration 013 has no
  -- DELETE policy on `places` but a future admin path might).
  proposed_place_id UUID REFERENCES places(id) ON DELETE SET NULL,

  decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'corrected')),
  -- The traveler's own alternative pick. Required exactly when decision is
  -- 'corrected', forbidden otherwise — enforced below, not by convention.
  corrected_place_id UUID REFERENCES places(id) ON DELETE SET NULL,

  -- Phase 13's OWN confidence — resolution, not extraction. See
  -- lib/places/resolutionConfidence.ts's header for why the two are never
  -- the same number.
  resolution_confidence NUMERIC CHECK (
    resolution_confidence IS NULL OR (resolution_confidence >= 0 AND resolution_confidence <= 1)
  ),
  -- Which scoring formula produced `resolution_confidence` and the
  -- thresholds that turned it into a decision. A re-tuning of
  -- AUTO_LINK_CONFIDENCE next month must never be read as having applied to
  -- a decision made under this month's thresholds.
  resolver_version TEXT NOT NULL CHECK (length(resolver_version) BETWEEN 1 AND 40),
  -- The evidence the score was built from (distance, alternative count,
  -- country/city agreement, pin origin) — kept so a wrong decision is
  -- explainable, the same reasoning migration 013 gives
  -- `place_external_ids.match_confidence`.
  reason_signals JSONB CHECK (reason_signals IS NULL OR jsonb_typeof(reason_signals) = 'object'),

  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A correction must name what it corrects to; a confirmation or rejection
-- must not carry one — there is nothing to point at Alice's decision that a
-- confirmed proposal was fine.
ALTER TABLE place_resolution_feedback DROP CONSTRAINT IF EXISTS place_resolution_feedback_corrected_pairing;
ALTER TABLE place_resolution_feedback ADD CONSTRAINT place_resolution_feedback_corrected_pairing CHECK (
  (decision = 'corrected' AND corrected_place_id IS NOT NULL) OR
  (decision <> 'corrected' AND corrected_place_id IS NULL)
);

-- One standing decision per traveler per place. A double-tap or a changed
-- mind updates this row rather than accumulating duplicates — the RPC below
-- upserts on exactly this pair.
CREATE UNIQUE INDEX IF NOT EXISTS place_resolution_feedback_user_place_idx
  ON place_resolution_feedback (user_id, destination_place_id);

CREATE INDEX IF NOT EXISTS place_resolution_feedback_destination_idx
  ON place_resolution_feedback (destination_place_id);
-- "How often is THIS canonical place rejected or corrected away from?" — the
-- signal a future phase reads to decide a row deserves a second look.
CREATE INDEX IF NOT EXISTS place_resolution_feedback_proposed_idx
  ON place_resolution_feedback (proposed_place_id) WHERE proposed_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS place_resolution_feedback_user_idx
  ON place_resolution_feedback (user_id, decided_at DESC);

-- ── The guard: what a caller may not forge, whichever door they write through ──
--
-- Mirrors migration 012's place_imports_guard exactly: this table is reached
-- both by the SECURITY INVOKER RPC below AND, because the RLS policies further
-- down permit it, by a direct PostgREST call from the traveler's own anon-key
-- session — a determined caller can always do the latter, so "the app always
-- calls the RPC" cannot be the only thing enforcing these rules.
--
-- `decided_at` is server time, never client time — an INSERT or UPDATE that
-- supplied its own timestamp gets NOW() instead. `user_id`, `destination_
-- place_id`, `import_id` and `import_candidate_id` are pinned to their
-- original value on UPDATE: a re-decision may change the decision itself,
-- the confidence, the corrected pick and the reason signals, but it may not
-- retarget whose feedback this is, which place it is about, or which import
-- produced it.
CREATE OR REPLACE FUNCTION public.place_resolution_feedback_guard() RETURNS TRIGGER AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.decided_at := NOW();
  ELSE
    NEW.user_id := OLD.user_id;
    NEW.destination_place_id := OLD.destination_place_id;
    NEW.import_id := OLD.import_id;
    NEW.import_candidate_id := OLD.import_candidate_id;
    NEW.decided_at := NOW();
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS place_resolution_feedback_guard_trg ON place_resolution_feedback;
CREATE TRIGGER place_resolution_feedback_guard_trg
  BEFORE INSERT OR UPDATE ON place_resolution_feedback
  FOR EACH ROW EXECUTE FUNCTION public.place_resolution_feedback_guard();

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE place_resolution_feedback ENABLE ROW LEVEL SECURITY;

-- Read: your own feedback, and nobody else's. This links a traveler to a
-- private opinion about a place — the same privacy posture migration 012
-- gives `place_sources`.
DROP POLICY IF EXISTS "place_resolution_feedback_select_own" ON place_resolution_feedback;
CREATE POLICY "place_resolution_feedback_select_own" ON place_resolution_feedback
  FOR SELECT USING (user_id = auth.uid());

-- Write: your own feedback, about a destination_places row you actually own.
-- `destination_places_update_own` (migration 009) is the same ownership
-- boundary this re-checks — possession of a destination_place_id is not
-- authorization on its own, so the EXISTS is required, not decorative.
DROP POLICY IF EXISTS "place_resolution_feedback_insert_own" ON place_resolution_feedback;
CREATE POLICY "place_resolution_feedback_insert_own" ON place_resolution_feedback
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM destination_places dp
      WHERE dp.id = place_resolution_feedback.destination_place_id AND dp.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "place_resolution_feedback_update_own" ON place_resolution_feedback;
CREATE POLICY "place_resolution_feedback_update_own" ON place_resolution_feedback
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM destination_places dp
      WHERE dp.id = place_resolution_feedback.destination_place_id AND dp.created_by = auth.uid()
    )
  );

-- No DELETE policy. Like place_sources, a decision that can be erased is not
-- ground truth — RLS defaults to deny, so this is the absence of a grant,
-- not a separate rule to maintain.

-- ── The atomic apply ─────────────────────────────────────────────────────────
--
-- A confirmation changes two facts that must never disagree: the feedback
-- record, and destination_places.canonical_place_id. Two sequential
-- PostgREST calls from the route could succeed and fail independently — a
-- dropped connection between them would leave one written and not the
-- other. This function makes both writes one statement's worth of
-- transaction: either the whole thing commits, or nothing does.
--
-- SECURITY INVOKER, deliberately — not DEFINER. Every statement inside runs
-- AS THE CALLING ROLE, so it is bound by exactly the RLS policies above and
-- by destination_places_update_own and places_read_public_or_own, the same
-- as if the caller had run each statement themselves. This function adds
-- atomicity; it does not add privilege. A DEFINER function would have had to
-- re-implement every one of those checks by hand to avoid becoming a
-- privilege-escalation path, for a problem SECURITY INVOKER already solves.
--
-- OWNERSHIP IS THE UPDATE'S OWN WHERE CLAUSE, NOT A PRE-CHECK: a foreign or
-- fabricated destination_place_id updates zero rows here, the same way any
-- other UPDATE under destination_places_update_own would. Zero rows is
-- treated as "not yours to decide about" and raises, so the function never
-- silently no-ops on a call it should have refused.
--
-- VISIBILITY OF THE TARGET PLACE IS RE-CHECKED HERE, NOT TRUSTED FROM THE
-- CALLER: `places_read_public_or_own` applies to the EXISTS checks below
-- exactly as it would to a caller's own SELECT — an invisible or fabricated
-- place id simply matches nothing, so "I can see it in a JSON body" can
-- never stand in for "I can see it under RLS".
CREATE OR REPLACE FUNCTION public.apply_place_resolution_feedback(
  p_destination_place_id UUID,
  p_decision TEXT,
  p_proposed_place_id UUID,
  p_corrected_place_id UUID,
  p_resolution_confidence NUMERIC,
  p_resolver_version TEXT,
  p_reason_signals JSONB,
  p_import_id UUID,
  p_import_candidate_id UUID
) RETURNS place_resolution_feedback
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_target UUID;
  v_updated UUID;
  v_row place_resolution_feedback;
BEGIN
  IF p_decision NOT IN ('confirmed', 'rejected', 'corrected') THEN
    RAISE EXCEPTION 'unrecognised resolution decision' USING ERRCODE = 'check_violation';
  END IF;

  IF p_decision = 'corrected' THEN
    IF p_corrected_place_id IS NULL THEN
      RAISE EXCEPTION 'a correction must name the place it corrects to' USING ERRCODE = 'check_violation';
    END IF;
    v_target := p_corrected_place_id;
  ELSIF p_decision = 'confirmed' THEN
    IF p_proposed_place_id IS NULL THEN
      RAISE EXCEPTION 'a confirmation must name the place it confirms' USING ERRCODE = 'check_violation';
    END IF;
    v_target := p_proposed_place_id;
  ELSE
    -- rejected: the traveler's own place is never linked to a wrong canonical
    -- row merely because a proposal existed.
    v_target := NULL;
  END IF;

  IF v_target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM places WHERE id = v_target) THEN
    RAISE EXCEPTION 'that place is not visible to you' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_proposed_place_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM places WHERE id = p_proposed_place_id) THEN
    RAISE EXCEPTION 'that place is not visible to you' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE destination_places
     SET canonical_place_id = v_target
   WHERE id = p_destination_place_id
     AND created_by = auth.uid()
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'that place is not yours to decide about' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO place_resolution_feedback (
    user_id, destination_place_id, import_id, import_candidate_id,
    proposed_place_id, decision, corrected_place_id,
    resolution_confidence, resolver_version, reason_signals
  ) VALUES (
    auth.uid(), p_destination_place_id, p_import_id, p_import_candidate_id,
    p_proposed_place_id, p_decision, p_corrected_place_id,
    p_resolution_confidence, p_resolver_version, p_reason_signals
  )
  ON CONFLICT (user_id, destination_place_id) DO UPDATE SET
    import_id = COALESCE(place_resolution_feedback.import_id, EXCLUDED.import_id),
    import_candidate_id = COALESCE(place_resolution_feedback.import_candidate_id, EXCLUDED.import_candidate_id),
    proposed_place_id = EXCLUDED.proposed_place_id,
    decision = EXCLUDED.decision,
    corrected_place_id = EXCLUDED.corrected_place_id,
    resolution_confidence = EXCLUDED.resolution_confidence,
    resolver_version = EXCLUDED.resolver_version,
    reason_signals = EXCLUDED.reason_signals
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$;

-- A signed-out or service caller has no auth.uid() to check ownership
-- against, so this is authenticated-only — the route itself also requires a
-- signed-in user before ever calling this, matching every other place route.
REVOKE ALL ON FUNCTION public.apply_place_resolution_feedback(
  UUID, TEXT, UUID, UUID, NUMERIC, TEXT, JSONB, UUID, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_place_resolution_feedback(
  UUID, TEXT, UUID, UUID, NUMERIC, TEXT, JSONB, UUID, UUID
) TO authenticated;
