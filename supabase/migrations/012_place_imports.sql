-- Phase 1 of Social Save: making the importer remember what it did.
--
-- WHAT WAS WRONG:
--   /api/travel/extract classified a link, fetched a caption, called a model and
--   geocoded the results — and then threw all of it away. Pasting the same
--   TikTok link twice paid for the same model call twice. Nothing recorded which
--   post a saved place came from. Nothing capped what one account could spend.
--   None of that is visible as a bug until the bill arrives.
--
-- WHAT THIS ADDS:
--   Four tables, no changes to any existing one. `destination_places`,
--   `trip_plans`, `itinerary_days` and `itinerary_places` are untouched, so
--   every existing save path behaves exactly as before.
--
--   place_imports     one row per extraction attempt, keyed by a hash of the
--                     normalized URL, so a repeat is recognised and replayed
--                     instead of re-run.
--   import_candidates what that extraction found, so a replay has something to
--                     replay and a save can be traced back to a guess.
--   place_sources     which post a place came from. Provenance, private.
--   ai_usage_log      what a model call cost. Append-only from the app's side.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   No canonical place registry, no verification tiers, no provider columns.
--   Those are Phase 2 and 3 and they are additive to this. Nothing here lets an
--   AI-created place become public — nothing here touches place visibility at
--   all.

-- ── place_imports ────────────────────────────────────────────────────────────
--
-- One row per attempt, whatever the outcome. A failed extraction is as worth
-- recording as a successful one: it is the difference between "the model is
-- expensive" and "the model is being asked the impossible 40 times a day".
CREATE TABLE IF NOT EXISTS place_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- SHA-256 of the normalized URL. NULL when the traveler pasted caption text
  -- with no link in it: there is no stable key for free text, so those imports
  -- are recorded but never reused.
  url_hash TEXT,
  normalized_url TEXT,
  platform TEXT NOT NULL DEFAULT 'text'
    CHECK (platform IN ('instagram','tiktok','facebook','youtube','google-maps','web','text')),

  status TEXT NOT NULL DEFAULT 'extracting'
    CHECK (status IN ('extracting','ready','failed')),
  -- Mirrors ExtractOutcome in the route. NULL until the attempt finishes.
  outcome TEXT
    CHECK (outcome IS NULL OR outcome IN ('ok','no-places-found','caption-unavailable','link-unreadable')),

  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  used_model BOOLEAN NOT NULL DEFAULT FALSE,

  -- Set when this import answered from an earlier one instead of running the
  -- pipeline. The row that cost nothing points at the row that cost something.
  reused_from_import_id UUID REFERENCES place_imports(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- The reuse lookup: "have I already extracted this exact link successfully?"
-- Partial, because that is the only question this index is ever asked.
CREATE INDEX IF NOT EXISTS place_imports_reuse_idx
  ON place_imports (user_id, url_hash, created_at DESC)
  WHERE url_hash IS NOT NULL AND status = 'ready';

-- The quota count, and the traveler's own import history.
CREATE INDEX IF NOT EXISTS place_imports_user_idx
  ON place_imports (user_id, created_at DESC);

-- ── The quota guard ──────────────────────────────────────────────────────────
--
-- The daily quota is a COUNT over this table, so the table has to be harder to
-- lie to than the application is. A traveler holds the anon key and can call
-- PostgREST directly, which means "our code never does that" is not a control.
--
-- Two holes, both closed here:
--   INSERT with a backdated created_at would fall outside the quota window.
--   UPDATE of created_at, user_id or url_hash would do the same after the fact,
--   or re-point one traveler's import at another's.
--
-- No DELETE policy exists below, which closes the third: deleting yesterday's
-- rows to buy a fresh allowance.
CREATE OR REPLACE FUNCTION public.place_imports_guard() RETURNS TRIGGER AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW();
    RETURN NEW;
  END IF;

  NEW.user_id    := OLD.user_id;
  NEW.created_at := OLD.created_at;
  NEW.url_hash   := OLD.url_hash;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS place_imports_guard_trg ON place_imports;
CREATE TRIGGER place_imports_guard_trg
  BEFORE INSERT OR UPDATE ON place_imports
  FOR EACH ROW EXECUTE FUNCTION public.place_imports_guard();

-- ── import_candidates ────────────────────────────────────────────────────────
--
-- What one extraction found. These are AI GUESSES until a traveler ticks them,
-- and they are never read by anything public. `accepted` records the tick;
-- `resolved_place_id` records where it landed, which is what makes a saved
-- place traceable back to the guess that produced it.
CREATE TABLE IF NOT EXISTS import_candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES place_imports(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('spot','food','shopping','transport','stay','other')),
  city TEXT,
  country TEXT,
  lat NUMERIC,
  lng NUMERIC,
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  -- Which half of the pipeline produced it. 'model' is the only one that costs.
  extraction_source TEXT NOT NULL DEFAULT 'model'
    CHECK (extraction_source IN ('model','caption','maps-link')),

  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_place_id UUID REFERENCES destination_places(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS import_candidates_import_idx
  ON import_candidates (import_id, position);

-- ── place_sources ────────────────────────────────────────────────────────────
--
-- The post a place came from. This is the raw material of the data flywheel and
-- it is also the most privacy-sensitive table added here: it links a person to
-- a place they liked enough to save.
--
-- So it is PRIVATE. The policies below grant a traveler their own rows and
-- nothing else. Aggregate save counts — the thing a public surface actually
-- needs — are a Phase 4 table computed from this one, never this one exposed.
CREATE TABLE IF NOT EXISTS place_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id UUID NOT NULL REFERENCES destination_places(id) ON DELETE CASCADE,

  platform TEXT NOT NULL DEFAULT 'web'
    CHECK (platform IN ('instagram','tiktok','facebook','youtube','google-maps','web','text')),
  normalized_url TEXT,
  url_hash TEXT NOT NULL,

  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  import_id UUID REFERENCES place_imports(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One post is one source for one place, however many times it is re-imported.
CREATE UNIQUE INDEX IF NOT EXISTS place_sources_place_url_idx
  ON place_sources (place_id, url_hash);

CREATE INDEX IF NOT EXISTS place_sources_place_idx ON place_sources (place_id);
CREATE INDEX IF NOT EXISTS place_sources_hash_idx  ON place_sources (url_hash);

-- ── ai_usage_log ─────────────────────────────────────────────────────────────
--
-- What the model cost, per call. Deliberately NOT the quota mechanism — the
-- quota counts place_imports, which a traveler cannot backdate. This is the
-- bill, read by staff through the service role.
--
-- There is no SELECT policy on purpose. RLS defaults to deny, so a traveler
-- cannot read this table at all, including their own rows: it carries model
-- names and cost estimates, which are our business rather than theirs.
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  -- Integer micro-units, never a float. Money is never stored as a float here,
  -- and an estimate is still money.
  cost_estimate_micros BIGINT NOT NULL DEFAULT 0 CHECK (cost_estimate_micros >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_log_feature_idx ON ai_usage_log (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_user_idx    ON ai_usage_log (user_id, created_at DESC);

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE place_imports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_candidates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_log       ENABLE ROW LEVEL SECURITY;

-- place_imports: read, create and complete your own. No DELETE policy, which is
-- what stops the quota from being reset by deleting its evidence.
DROP POLICY IF EXISTS "place_imports_select_own" ON place_imports;
CREATE POLICY "place_imports_select_own" ON place_imports
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "place_imports_insert_own" ON place_imports;
CREATE POLICY "place_imports_insert_own" ON place_imports
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "place_imports_update_own" ON place_imports;
CREATE POLICY "place_imports_update_own" ON place_imports
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- import_candidates: reachable only through an import you own.
DROP POLICY IF EXISTS "import_candidates_owner" ON import_candidates;
CREATE POLICY "import_candidates_owner" ON import_candidates FOR ALL USING (
  EXISTS (SELECT 1 FROM place_imports i WHERE i.id = import_candidates.import_id AND i.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM place_imports i WHERE i.id = import_candidates.import_id AND i.user_id = auth.uid())
);

-- place_sources: your own provenance, and nobody else's. No UPDATE and no
-- DELETE policy — provenance that can be rewritten is not provenance.
DROP POLICY IF EXISTS "place_sources_select_own" ON place_sources;
CREATE POLICY "place_sources_select_own" ON place_sources
  FOR SELECT USING (submitted_by = auth.uid());

DROP POLICY IF EXISTS "place_sources_insert_own" ON place_sources;
CREATE POLICY "place_sources_insert_own" ON place_sources
  FOR INSERT WITH CHECK (submitted_by = auth.uid());

-- ai_usage_log: write your own line, read nothing. Staff read via service role.
DROP POLICY IF EXISTS "ai_usage_log_insert_own" ON ai_usage_log;
CREATE POLICY "ai_usage_log_insert_own" ON ai_usage_log
  FOR INSERT WITH CHECK (user_id = auth.uid());
