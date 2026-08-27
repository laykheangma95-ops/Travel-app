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


-- ── Phase 13 review remediation: the proposal is persisted, not reconstructed ──
--
-- WHAT THE REVIEW PROVED:
--   The confirmation route used to RE-DERIVE the proposal at decision time.
--   Re-derivation could not see how the pin had been obtained, so it scored
--   with pinOrigin='unknown' where the import had scored with 'geocoder' — the
--   x0.8 penalty vanished, confidence rose by 1.25x, and any geocoder-pinned
--   match within 45m crossed AUTO_LINK_CONFIDENCE. The server then answered
--   "no-proposal" to a card the traveler was looking at: the tap did nothing,
--   canonical_place_id stayed NULL, and no feedback row was ever written.
--   Where it did still apply, it stored a confidence and a pinOrigin the
--   traveler had never been shown.
--
-- THE FIX: an ambiguous proposal becomes a row the moment it is made, in the
--   `pending` state, carrying the exact evidence that produced it. The
--   decision then UPDATEs that row. Nothing is recomputed at decision time, so
--   shown and stored cannot disagree — not because both computations are
--   careful, but because there is only one computation.
ALTER TABLE place_resolution_feedback
  ADD COLUMN IF NOT EXISTS alternative_place_ids UUID[] NOT NULL DEFAULT '{}';

-- `pending` joins the vocabulary: a proposal that has been made and shown, and
-- is waiting on the traveler.
ALTER TABLE place_resolution_feedback DROP CONSTRAINT IF EXISTS place_resolution_feedback_decision_check;
ALTER TABLE place_resolution_feedback DROP CONSTRAINT IF EXISTS place_resolution_feedback_decision_check1;
ALTER TABLE place_resolution_feedback
  ALTER COLUMN decision SET DEFAULT 'pending';
DO $do$
BEGIN
  -- The CHECK was written inline in the CREATE TABLE above, so on a database
  -- that already applied the pre-remediation revision it carries the system
  -- name. Dropped by discovery rather than by a guessed name.
  EXECUTE (
    SELECT coalesce(string_agg(format('ALTER TABLE place_resolution_feedback DROP CONSTRAINT %I;', conname), ' '), '')
    FROM pg_constraint
    WHERE conrelid = 'place_resolution_feedback'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%decision%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%corrected_place_id%'
  );
END
$do$;
ALTER TABLE place_resolution_feedback ADD CONSTRAINT place_resolution_feedback_decision_check
  CHECK (decision IN ('pending', 'confirmed', 'rejected', 'corrected'));

-- A pending proposal must sit in the ambiguous band it claims to be in. This
-- is the last line of defence on a stored confidence: even a caller who
-- reached the insert cannot record a `pending` row claiming 0.99.
ALTER TABLE place_resolution_feedback DROP CONSTRAINT IF EXISTS place_resolution_feedback_pending_band;
ALTER TABLE place_resolution_feedback ADD CONSTRAINT place_resolution_feedback_pending_band CHECK (
  decision <> 'pending'
  OR (resolution_confidence IS NOT NULL AND resolution_confidence >= 0.5 AND resolution_confidence < 0.85)
);

-- A pending proposal is still open, so it has no correction yet — the existing
-- pairing CHECK already forbids `corrected_place_id` on any decision that is
-- not 'corrected', which covers 'pending' unchanged.

-- Only the OPEN proposals, for the "is this place still waiting on me?" read.
CREATE INDEX IF NOT EXISTS place_resolution_feedback_pending_idx
  ON place_resolution_feedback (user_id, destination_place_id) WHERE decision = 'pending';

-- ── The SQL twin of lib/places/resolutionConfidence.ts ───────────────────────
--
-- WHY THE DATABASE COMPUTES THE SCORE RATHER THAN STORING ONE IT IS HANDED:
--   The review proved a traveler could PATCH/POST place_resolution_feedback
--   directly with the anon key and write confidence=1, resolver_version=
--   'resolution-v999' and fabricated reason_signals. Migration 012 already
--   diagnosed this exact shape for ai_usage_log — "the policy constrained
--   WHOSE row could be written but not what was in it… A ledger anybody can
--   write is not a ledger" — and closed it by removing the write policy.
--
--   The same reasoning applies here, but a traveler legitimately needs to
--   record their own decision, so the door cannot simply be shut. Instead the
--   evidence stops being something a caller states and becomes something the
--   database derives: the proposal RPC below takes NO confidence, NO version
--   and NO signals. It measures the distance itself, counts the competing
--   candidates itself, checks the countries itself, and computes the score
--   with this function. There is no argument to any of it that writes a
--   number of the caller's choosing.
--
-- IT MUST AGREE WITH THE TYPESCRIPT, EXACTLY. The application computes the
-- same score to decide auto/ambiguous/none before it ever calls the RPC, so a
-- divergence would resurrect the very "shown one thing, stored another" bug
-- this remediation exists to kill. tests/resolutionConfidence.sqlTwin.test.ts
-- runs both over the same matrix and asserts equality, exactly as
-- tests/places.normalize.test.ts pins normalizePlaceName and geohash_encode.
CREATE OR REPLACE FUNCTION public.place_distance_meters(
  lat1 NUMERIC, lng1 NUMERIC, lat2 NUMERIC, lng2 NUMERIC
) RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE AS $fn$
  -- Haversine, character for character the constants in
  -- lib/places/normalize.ts's distanceMeters (EARTH_RADIUS_M = 6371000).
  SELECT 2 * 6371000 * asin(least(1, sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
    + sin(radians(lng2 - lng1) / 2) ^ 2 * cos(radians(lat1)) * cos(radians(lat2))
  )));
$fn$;

CREATE OR REPLACE FUNCTION public.place_resolution_score(
  distance_m DOUBLE PRECISION,
  alternative_count INT,
  country_mismatch BOOLEAN,
  pin_origin TEXT
) RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  s DOUBLE PRECISION;
BEGIN
  -- proximityConfidence: 1.0 touching, 0.5 at the 150m radius, 0 at or beyond.
  --
  -- ROUNDED THE WAY JAVASCRIPT ROUNDS, NOT THE WAY round(numeric) DOES, and
  -- the whole calculation stays in DOUBLE PRECISION to match.
  --
  -- The twin test caught this: `round(x::numeric, 3)` first converts the
  -- double to its shortest round-tripping decimal, so 0.7224999999999999
  -- becomes exactly 0.7225 and then rounds half-up to 0.723, where
  -- Number(x.toFixed(3)) reads the double's real value and gives 0.722. Twelve
  -- combinations across the matrix disagreed by 0.001 — enough to move a
  -- proposal across a threshold. `floor(x * 1000 + 0.5) / 1000` on the double
  -- itself reproduces toFixed(3) for the [0,1] range this function works in,
  -- and tests/resolutionConfidence.sqlTwin.test.ts proves it over the matrix
  -- rather than trusting the reasoning.
  -- EVERY literal is cast to float8. An un-cast `0.85` is a NUMERIC literal,
  -- and Postgres then does the multiplication in exact decimal — which is
  -- precisely what JavaScript does not do. That alone accounted for twelve
  -- disagreements in the matrix test (0.85 * 0.85 is exactly 0.7225 in
  -- numeric and 0.7224999999999999 as a double, rounding to 0.723 and 0.722
  -- respectively).
  -- Rounded ONCE, at the end. The TypeScript inlines the same curve for the
  -- same reason: rounding the proximity base here and the score again below
  -- made the result depend on an intermediate the two languages round
  -- differently.
  IF distance_m >= 150::float8 THEN
    s := 0::float8;
  ELSE
    s := 1::float8 - (distance_m / 150::float8) * 0.5::float8;
  END IF;

  IF country_mismatch IS TRUE THEN s := s * 0.85::float8; END IF;
  IF pin_origin = 'geocoder'  THEN s := s * 0.8::float8;  END IF;
  IF alternative_count > 0    THEN s := s * 0.7::float8;  END IF;

  s := greatest(0::float8, least(1::float8, s));
  RETURN (floor(s * 1000::float8 + 0.5::float8) / 1000::float8)::numeric;
END;
$fn$;

-- ── The guard ────────────────────────────────────────────────────────────────
--
-- Two jobs now.
--
-- 1. THE LEDGER IS NOT DIRECTLY WRITABLE. Every INSERT and UPDATE must carry a
--    transaction-local marker that only the two functions below set. PostgREST
--    runs each request in its own transaction and exposes no way to call
--    set_config and then write in that same transaction, so a direct
--    POST/PATCH on this table arrives without the marker and is refused. This
--    is the RLS-compatible equivalent of migration 012 removing ai_usage_log's
--    write policy: the row can only be written through a path that derives its
--    own evidence.
--
--    `set_config(..., true)` is transaction-local, so the marker cannot leak
--    into a later request on a pooled connection — it is discarded at COMMIT
--    or ROLLBACK either way.
--
-- 2. WHAT MAY NEVER CHANGE, ONCE WRITTEN. `user_id`, `destination_place_id`
--    and the import context were already pinned. The remediation adds the four
--    evidence columns the review found forgeable: a decision may change the
--    `decision` and its `corrected_place_id`, and nothing else. The proposal
--    that was shown is the proposal that stays on the record.
CREATE OR REPLACE FUNCTION public.place_resolution_feedback_guard() RETURNS TRIGGER AS $fn$
BEGIN
  IF coalesce(current_setting('domner.resolution_trusted', true), '') <> '1' THEN
    RAISE EXCEPTION 'resolution feedback may only be written through the resolution functions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.decided_at := NOW();
  ELSE
    NEW.user_id               := OLD.user_id;
    NEW.destination_place_id  := OLD.destination_place_id;
    NEW.import_id             := OLD.import_id;
    NEW.import_candidate_id   := OLD.import_candidate_id;
    -- The evidence is the proposal's, not the decision's.
    NEW.proposed_place_id     := OLD.proposed_place_id;
    NEW.resolution_confidence := OLD.resolution_confidence;
    NEW.resolver_version      := OLD.resolver_version;
    NEW.reason_signals        := OLD.reason_signals;
    NEW.alternative_place_ids := OLD.alternative_place_ids;
    NEW.decided_at            := NOW();
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS place_resolution_feedback_guard_trg ON place_resolution_feedback;
CREATE TRIGGER place_resolution_feedback_guard_trg
  BEFORE INSERT OR UPDATE ON place_resolution_feedback
  FOR EACH ROW EXECUTE FUNCTION public.place_resolution_feedback_guard();

-- ── Row Level Security ───────────────────────────────────────────────────────
--
-- Still a real boundary, and still the ONLY one that decides whose rows these
-- are: both functions below are SECURITY INVOKER, so every statement inside
-- them runs as the caller and is filtered by exactly these policies. The guard
-- above is an additional constraint on top of RLS, never a replacement for it.

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

-- ── Recording a proposal ─────────────────────────────────────────────────────
--
-- Called once, by the importer, at the moment an ambiguous proposal is made
-- (lib/travel/placeImport.ts). It takes only FACTS THE CALLER ACTUALLY KNOWS
-- and the database cannot: which place was proposed, which others were offered
-- alongside it, how the pin was obtained, and what the geocoder saw. It takes
-- no confidence, no resolver version and no reason signals — those are derived
-- here and returned, so what the screen renders is read back from the row
-- rather than computed a second time.
--
-- SECURITY INVOKER. Ownership of the destination place and visibility of every
-- proposed/alternative place are enforced by RLS on the statements below
-- exactly as they would be for the caller's own queries: an invisible or
-- fabricated place id simply matches nothing, so neither can be distinguished
-- from the other, and neither yields an existence oracle.
--
-- The proposal must be GENUINE, not merely well-formed: every id named has to
-- be a real same-normalized-name match inside the 150m radius of the
-- traveler's own coordinates. A caller cannot nominate an unrelated place and
-- have the registry record that it was ever offered.
CREATE OR REPLACE FUNCTION public.create_place_resolution_proposal(
  p_destination_place_id UUID,
  p_proposed_place_id UUID,
  p_alternative_place_ids UUID[],
  p_pin_origin TEXT,
  p_geocoder_result_count INT,
  p_geocoder_country_mismatch BOOLEAN,
  p_import_id UUID,
  p_import_candidate_id UUID
) RETURNS place_resolution_feedback
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_dp             destination_places%ROWTYPE;
  v_proposed       places%ROWTYPE;
  v_distance       DOUBLE PRECISION;
  v_alt_count      INT;
  v_country_mismatch BOOLEAN;
  v_confidence     NUMERIC;
  v_signals        JSONB;
  v_row            place_resolution_feedback;
BEGIN
  IF p_pin_origin IS NULL OR p_pin_origin NOT IN ('maps-link', 'geocoder', 'unknown') THEN
    RAISE EXCEPTION 'unrecognised pin origin' USING ERRCODE = 'check_violation';
  END IF;

  -- Ownership. Not a pre-check that something else re-does: this SELECT is
  -- filtered by destination_places' own policies, and the explicit created_by
  -- makes a row the caller can merely READ (the editorial catalogue) fail too.
  SELECT * INTO v_dp FROM destination_places
   WHERE id = p_destination_place_id AND created_by = auth.uid();
  IF v_dp.id IS NULL THEN
    RAISE EXCEPTION 'that place is not yours to resolve' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Visibility of the proposal, under places_read_public_or_own.
  SELECT * INTO v_proposed FROM places WHERE id = p_proposed_place_id;
  IF v_proposed.id IS NULL THEN
    RAISE EXCEPTION 'that place is not visible to you' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The proposal has to be a real match, not just a visible row.
  v_distance := public.place_distance_meters(v_dp.lat, v_dp.lng, v_proposed.latitude, v_proposed.longitude);
  IF v_distance >= 150
     OR v_proposed.name_normalized IS DISTINCT FROM public.place_name_normalized(v_dp.name) THEN
    RAISE EXCEPTION 'that place is not a match for this one' USING ERRCODE = 'check_violation';
  END IF;

  -- Every alternative must be a genuine competing match too, and the count
  -- that feeds the ambiguity penalty is the one measured HERE, never the one
  -- the caller claimed.
  IF p_alternative_place_ids IS NOT NULL AND array_length(p_alternative_place_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_alternative_place_ids) AS alt(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM places p
        WHERE p.id = alt.id
          AND p.id <> p_proposed_place_id
          AND p.name_normalized = public.place_name_normalized(v_dp.name)
          AND public.place_distance_meters(v_dp.lat, v_dp.lng, p.latitude, p.longitude) < 150
      )
    ) THEN
      RAISE EXCEPTION 'an alternative offered is not a match for this place'
        USING ERRCODE = 'check_violation';
    END IF;
    v_alt_count := array_length(p_alternative_place_ids, 1);
  ELSE
    v_alt_count := 0;
  END IF;

  -- ONE combined country signal, mirroring lib/places/repository.ts: either
  -- the geocoder reporting every candidate disagreed with the expected
  -- country, or the matched canonical row's own country differing from the
  -- traveler's destination. NULL on both sides stays NULL — never coerced.
  IF p_geocoder_country_mismatch IS TRUE THEN
    v_country_mismatch := TRUE;
  ELSIF v_proposed.country_name IS NULL OR v_dp.destination IS NULL THEN
    v_country_mismatch := NULL;
  ELSE
    v_country_mismatch := public.place_name_normalized(v_dp.destination)
                       IS DISTINCT FROM public.place_name_normalized(v_proposed.country_name);
  END IF;

  v_confidence := public.place_resolution_score(v_distance, v_alt_count, v_country_mismatch, p_pin_origin);

  -- Only an ambiguous score is a proposal. An auto-linkable or too-weak match
  -- has nothing to ask a traveler about, and recording one would put a
  -- question on the record that was never asked.
  IF v_confidence >= 0.85 OR v_confidence < 0.5 THEN
    RAISE EXCEPTION 'that match is not ambiguous' USING ERRCODE = 'check_violation';
  END IF;

  v_signals := jsonb_build_object(
    'distanceMeters',      v_distance,
    'alternativeCount',    v_alt_count,
    'countryMatch',        CASE WHEN v_country_mismatch IS NULL THEN NULL ELSE NOT v_country_mismatch END,
    'pinOrigin',           p_pin_origin,
    'geocoderResultCount', p_geocoder_result_count
  );

  PERFORM set_config('domner.resolution_trusted', '1', true);

  INSERT INTO place_resolution_feedback (
    user_id, destination_place_id, import_id, import_candidate_id,
    proposed_place_id, alternative_place_ids, decision,
    resolution_confidence, resolver_version, reason_signals
  ) VALUES (
    auth.uid(), p_destination_place_id, p_import_id, p_import_candidate_id,
    p_proposed_place_id, coalesce(p_alternative_place_ids, '{}'), 'pending',
    v_confidence, 'resolution-v1', v_signals
  )
  -- A re-import of the same place re-states the proposal rather than failing,
  -- but it must never overwrite a decision the traveler has already made.
  ON CONFLICT (user_id, destination_place_id) DO UPDATE SET
    proposed_place_id     = EXCLUDED.proposed_place_id,
    alternative_place_ids = EXCLUDED.alternative_place_ids,
    resolution_confidence = EXCLUDED.resolution_confidence,
    resolver_version      = EXCLUDED.resolver_version,
    reason_signals        = EXCLUDED.reason_signals
  WHERE place_resolution_feedback.decision = 'pending'
  RETURNING * INTO v_row;

  -- The ON CONFLICT WHERE clause filtered the update out: a decision already
  -- stands, so the existing row is returned untouched rather than reopened.
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM place_resolution_feedback
     WHERE user_id = auth.uid() AND destination_place_id = p_destination_place_id;
  END IF;

  RETURN v_row;
END;
$fn$;

-- ── Deciding a proposal ──────────────────────────────────────────────────────
--
-- Takes the decision and nothing else. Every evidence field was written when
-- the proposal was made and is pinned by the guard, so this cannot change what
-- the record says was shown — only what the traveler said about it.
--
-- ATOMIC. A confirmation changes two facts that must never disagree: the
-- feedback row and destination_places.canonical_place_id. Two sequential
-- PostgREST calls could succeed and fail independently; this is one
-- transaction, so either both land or neither does.
--
-- SECURITY INVOKER, deliberately — not DEFINER. Every statement runs AS THE
-- CALLING ROLE, bound by exactly the policies above plus
-- destination_places_update_own and places_read_public_or_own. This adds
-- atomicity and evidence integrity; it adds no privilege.
DROP FUNCTION IF EXISTS public.apply_place_resolution_feedback(UUID, TEXT, UUID, UUID, NUMERIC, TEXT, JSONB, UUID, UUID);

CREATE OR REPLACE FUNCTION public.apply_place_resolution_feedback(
  p_destination_place_id UUID,
  p_decision TEXT,
  p_corrected_place_id UUID
) RETURNS place_resolution_feedback
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_existing place_resolution_feedback;
  v_target   UUID;
  v_updated  UUID;
  v_row      place_resolution_feedback;
BEGIN
  IF p_decision NOT IN ('confirmed', 'rejected', 'corrected') THEN
    RAISE EXCEPTION 'unrecognised resolution decision' USING ERRCODE = 'check_violation';
  END IF;

  -- The proposal that was actually shown. RLS scopes this to the caller's own
  -- rows, so a foreign or fabricated destination id finds nothing and is
  -- reported identically to "there was never a proposal here".
  SELECT * INTO v_existing FROM place_resolution_feedback
   WHERE user_id = auth.uid() AND destination_place_id = p_destination_place_id;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'there is no proposal to decide' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_decision = 'corrected' THEN
    IF p_corrected_place_id IS NULL THEN
      RAISE EXCEPTION 'a correction must name the place it corrects to' USING ERRCODE = 'check_violation';
    END IF;
    -- Only among what was OFFERED. Not "any visible place": the traveler is
    -- answering a specific question, and a correction to something that was
    -- never on the card is not an answer to it.
    IF p_corrected_place_id <> v_existing.proposed_place_id
       AND NOT (p_corrected_place_id = ANY (v_existing.alternative_place_ids)) THEN
      RAISE EXCEPTION 'that place was not offered for this proposal' USING ERRCODE = 'check_violation';
    END IF;
    -- Still has to be visible NOW, not merely visible when it was offered.
    IF NOT EXISTS (SELECT 1 FROM places WHERE id = p_corrected_place_id) THEN
      RAISE EXCEPTION 'that place is not visible to you' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_target := p_corrected_place_id;
  ELSIF p_decision = 'confirmed' THEN
    IF NOT EXISTS (SELECT 1 FROM places WHERE id = v_existing.proposed_place_id) THEN
      RAISE EXCEPTION 'that place is not visible to you' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_target := v_existing.proposed_place_id;
  ELSE
    -- rejected: the traveler's own place is never linked to a canonical row
    -- merely because a proposal existed.
    v_target := NULL;
  END IF;

  UPDATE destination_places
     SET canonical_place_id = v_target
   WHERE id = p_destination_place_id
     AND created_by = auth.uid()
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'that place is not yours to decide about' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config('domner.resolution_trusted', '1', true);

  UPDATE place_resolution_feedback
     SET decision = p_decision,
         corrected_place_id = CASE WHEN p_decision = 'corrected' THEN p_corrected_place_id ELSE NULL END
   WHERE id = v_existing.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$;

-- Both functions need auth.uid() to establish ownership, so both are
-- authenticated-only; the routes require a signed-in user before either is
-- reached, matching every other place route.
REVOKE ALL ON FUNCTION public.create_place_resolution_proposal(UUID, UUID, UUID[], TEXT, INT, BOOLEAN, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_place_resolution_proposal(UUID, UUID, UUID[], TEXT, INT, BOOLEAN, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_place_resolution_feedback(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_place_resolution_feedback(UUID, TEXT, UUID) TO authenticated;
