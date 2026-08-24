-- Phase 3: the social-link intake layer.
--
-- WHAT THIS IS FOR:
--   A traveler pastes a link. Domner validates it, works out which platform it
--   is, gives it a stable identity, and records an import job. That is all.
--   Nothing here fetches anything, and nothing here understands the content.
--
--   The extraction pipeline (app/api/travel/extract) already exists and is
--   unchanged. This adds the columns an intake needs and the vocabulary a
--   queue needs, so the connector layer can be built against a table that is
--   already the right shape.
--
-- WHY THE STATUS CHANGE IS AN EXPANSION, NOT A REPLACEMENT:
--   Migration 012 shipped `extracting | ready | failed`, written by a
--   synchronous pipeline. Phase 3 needs a queue's vocabulary. Both are allowed
--   here, and the old rows are backfilled onto the new names, because a
--   migration that narrows a CHECK is a migration that breaks the moment a
--   deploy is rolled back and the previous release writes the old value again.
--   The old names are deprecated, not removed; a later migration drops them
--   once no released code can write one (CLAUDE.md Step 1: reshape and
--   backfill, then deprecate in a LATER migration, never the same one).

-- ── The columns an intake needs ──────────────────────────────────────────────
ALTER TABLE place_imports
  -- What the traveler actually pasted, before normalization. Kept so a support
  -- conversation can start from what they saw rather than from what we made of
  -- it. Capped, because a URL is not a document.
  ADD COLUMN IF NOT EXISTS original_url TEXT,
  -- Why an import failed, in two registers: a code for us to branch and count
  -- on, and a message for a human reading the row. Deliberately NOT CHECK-
  -- constrained: an error vocabulary grows, and a constraint here would turn
  -- "a new kind of failure happened" into "the row recording it could not be
  -- written".
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  -- When work actually began, as distinct from when the job was created. The
  -- gap between the two is queue latency, and it is the number that tells you
  -- whether a connector is keeping up.
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE place_imports DROP CONSTRAINT IF EXISTS place_imports_url_lengths;
ALTER TABLE place_imports ADD CONSTRAINT place_imports_url_lengths CHECK (
  (original_url  IS NULL OR length(original_url)  <= 2048) AND
  (normalized_url IS NULL OR length(normalized_url) <= 2048) AND
  (error_code    IS NULL OR length(error_code)    <= 64) AND
  (error_message IS NULL OR length(error_message) <= 500)
);

-- ── Platform: classification only ───────────────────────────────────────────
--
-- `xiaohongshu` joins the vocabulary because Domner's travelers use RED and a
-- link we cannot name is a link we cannot even record honestly.
--
-- CLASSIFYING A HOST IS NOT TRUSTING IT. This value says what a URL is, not
-- that we may fetch it. The outbound allowlists live in lib/travel/linkPreview
-- and lib/travel/mapsResolve and are NOT touched by this migration or by
-- anything in Phase 3 — a RED link is recorded and never requested.
--
-- `web` is the generic bucket and keeps its name; it is what the brief calls
-- `generic_web`, and renaming a live value to gain a synonym would be churn.
ALTER TABLE place_imports DROP CONSTRAINT place_imports_platform_check;
ALTER TABLE place_imports ADD CONSTRAINT place_imports_platform_check CHECK (
  platform IN ('instagram','tiktok','facebook','youtube','xiaohongshu','google-maps','web','text')
);

-- ── Status: the queue vocabulary, plus the two legacy values ────────────────
--
--   queued             recorded, waiting for a connector
--   processing         a connector is working on it        (was: extracting)
--   needs_confirmation extracted, waiting on the traveler
--   completed          finished, results are reusable      (was: ready)
--   failed             finished, and did not work
ALTER TABLE place_imports DROP CONSTRAINT place_imports_status_check;
ALTER TABLE place_imports ADD CONSTRAINT place_imports_status_check CHECK (
  status IN (
    'queued','processing','needs_confirmation','completed','failed',
    -- Deprecated. Written by releases before Phase 3; removed in a later
    -- migration once no deployed code can produce one.
    'extracting','ready'
  )
);

UPDATE place_imports SET status = 'processing' WHERE status = 'extracting';
UPDATE place_imports SET status = 'completed'  WHERE status = 'ready';

-- THE DEFAULT HAS TO MOVE WITH THE VOCABULARY.
--
-- Migration 012 declared `DEFAULT 'extracting'`, and expanding the CHECK and
-- backfilling the rows does not touch it. Left alone, every INSERT that omits
-- `status` would keep writing a value this file calls deprecated — and such a
-- row is invisible to the whole Phase 3 model: it is not in
-- place_imports_open_idx, so the one-open-job-per-link guarantee does not cover
-- it; it is not `completed`, so it is never reusable. An orphan no code path
-- can see or clean up.
--
-- It would also block the promised contraction: a later migration that removes
-- 'extracting' from the CHECK cannot run while the DEFAULT still produces one.
--
-- `queued` is the intake's initial state, so it is what a row with no stated
-- status means: recorded, waiting for a connector.
ALTER TABLE place_imports ALTER COLUMN status SET DEFAULT 'queued';

-- ── The reuse index has to follow the rename ────────────────────────────────
--
-- 012 built this partial index WHERE status = 'ready'. Backfilling the rows
-- without rebuilding the index would leave the reuse lookup — the whole cost
-- control — doing a sequential scan, silently, with every test still passing.
DROP INDEX IF EXISTS place_imports_reuse_idx;
CREATE INDEX IF NOT EXISTS place_imports_reuse_idx
  ON place_imports (user_id, url_hash, created_at DESC)
  WHERE url_hash IS NOT NULL AND status IN ('completed','ready');

-- AT MOST ONE OPEN JOB PER LINK PER TRAVELER, enforced rather than checked.
--
-- The intake asks "is there already a job open for this link?" and inserts if
-- not. Read-then-write has a window, and a double tap or a retrying client
-- lands squarely in it — five simultaneous submissions produced five queued
-- jobs for one link, and five connectors would then do the same work five
-- times. A partial unique index closes the window; the application turns the
-- resulting 23505 back into "here is the job you already have".
--
-- PARTIAL, and that is the whole design. A plain unique index on
-- (user_id, url_hash) would forbid ever importing a link a second time, which
-- is a thing travelers legitimately do — next month, after the first import
-- finished. The constraint is only on jobs that are still OPEN.
DROP INDEX IF EXISTS place_imports_open_idx;
CREATE UNIQUE INDEX IF NOT EXISTS place_imports_open_idx
  ON place_imports (user_id, url_hash)
  WHERE url_hash IS NOT NULL AND status IN ('queued','processing','needs_confirmation');

-- ── The replay guard follows the rename too ─────────────────────────────────
--
-- 012's guard requires a reuse marker to name a COMPLETED import of the same
-- link by the same traveler, and it spelled completed as 'ready'. Left alone,
-- every genuine replay would start failing the moment the vocabulary moved.
-- The rule is unchanged; only the spelling of one word in it is.
CREATE OR REPLACE FUNCTION public.place_imports_guard() RETURNS TRIGGER AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW();
  ELSE
    NEW.user_id    := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.url_hash   := OLD.url_hash;
  END IF;

  IF NEW.reused_from_import_id IS NOT NULL THEN
    IF NEW.url_hash IS NULL THEN
      RAISE EXCEPTION 'an import with no link cannot be a replay'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM place_imports source
      WHERE source.id       = NEW.reused_from_import_id
        AND source.id      <> NEW.id
        AND source.user_id  = NEW.user_id
        AND source.url_hash = NEW.url_hash
        AND source.status  IN ('completed','ready')
    ) THEN
      RAISE EXCEPTION 'a replay must name a completed import of the same link by the same traveler'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- RLS is unchanged: place_imports keeps the own-row SELECT/INSERT/UPDATE
-- policies and the absent DELETE policy from 012. An intake row belongs to the
-- traveler who created it and to nobody else, which is what makes cross-user
-- reuse a deliberate decision rather than an accident waiting to happen.
