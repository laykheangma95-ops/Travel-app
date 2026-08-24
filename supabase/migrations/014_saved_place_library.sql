-- Saved places: a traveler's own library, independent of any trip.
--
-- WHAT ALREADY EXISTED, AND WHY THIS IS NOT IT:
--   Domner has had a "save" since the destination guides shipped, and it means
--   "put this on a trip": lib/travel/savedPlaces.ts resolves a guide's
--   content_slug to a `destination_places` row, finds or creates a trip for that
--   country, and files it into the trip's day_index 0 Ideas list. That save is
--   trip-bound by construction — it cannot exist without a trip, and it asks
--   which trip when the answer is ambiguous.
--
--   This is a different action on a different key. A saved place here is a
--   traveler's bookmark of a CANONICAL place (migration 013), with no trip
--   anywhere in it. Both survive; neither is changed. A traveler may have a
--   place in their library and on three trips, and those facts do not interact.
--
-- WHAT THIS DOES NOT DO:
--   No AI, no social parsing, no collections table. `collection_id` exists as a
--   nullable column because the shape is known and adding a column later to a
--   table with rows is more disruptive than carrying one that is always NULL —
--   but it has no foreign key and no write path, so nothing can put a value in
--   it until the collections table arrives with its constraint.

-- ── saved_places ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_places (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ON DELETE RESTRICT, deliberately. Unsaving must never be able to reach the
  -- canonical place, and neither must anything else while somebody has it
  -- saved. `places` has no DELETE policy either, so this is belt and braces on
  -- a rule worth being certain about: a library is a pointer, never an owner.
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE RESTRICT,

  -- The collections table does not exist yet, so there is no REFERENCES clause
  -- to write. Nothing accepts this column on the way in — the API schema does
  -- not have the field — so it is NULL on every row until collections ship and
  -- add the foreign key in their own migration.
  collection_id UUID,

  -- Which import produced this save, when one did. Provenance, same as
  -- place_sources in migration 012. SET NULL so pruning import history never
  -- takes a traveler's library with it.
  source_import_id UUID REFERENCES place_imports(id) ON DELETE SET NULL,

  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saving twice is the same as saving once. This is what makes the API
-- idempotent rather than the API remembering to be.
CREATE UNIQUE INDEX IF NOT EXISTS saved_places_user_place_idx
  ON saved_places (user_id, place_id);

-- "My saved places, newest first" — the list query, served by one index.
CREATE INDEX IF NOT EXISTS saved_places_user_idx
  ON saved_places (user_id, saved_at DESC);

-- "How many people saved this" — the counter's own maintenance, and the
-- reconciliation query in the docs.
CREATE INDEX IF NOT EXISTS saved_places_place_idx ON saved_places (place_id);

CREATE INDEX IF NOT EXISTS saved_places_collection_idx
  ON saved_places (collection_id) WHERE collection_id IS NOT NULL;

-- ── place_stats ──────────────────────────────────────────────────────────────
--
-- WHY A TABLE AND NOT A COUNT:
--   A place card renders in a list. `SELECT count(*) FROM saved_places WHERE
--   place_id = …` per card is a query per card, and on a screen showing twenty
--   places that is twenty queries that all get slower as the product succeeds.
--   A counter maintained by a trigger is one row read, and it does not care how
--   many saves exist.
--
-- WHY IT CARRIES NO IDENTITIES:
--   This is the only table here that is publicly readable, and it holds a place
--   id and a number. Who saved what lives in `saved_places`, which is own-row
--   only. An aggregate that can be joined back to a person is not an aggregate.
CREATE TABLE IF NOT EXISTS place_stats (
  place_id UUID PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  save_count INTEGER NOT NULL DEFAULT 0 CHECK (save_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── The counter ──────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER because `place_stats` has no write policy: the whole point
-- is that nobody can write it directly, including the traveler whose save is
-- causing the change. The function therefore runs as its owner.
--
-- `search_path` is pinned to empty and every name below is schema-qualified.
-- A SECURITY DEFINER function that resolves names through the caller's
-- search_path is the classic way to hand someone else's privileges away.
CREATE OR REPLACE FUNCTION public.place_stats_apply() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.place_stats (place_id, save_count, updated_at)
    VALUES (NEW.place_id, 1, NOW())
    ON CONFLICT (place_id) DO UPDATE
      SET save_count = public.place_stats.save_count + 1, updated_at = NOW();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- GREATEST(…, 0) rather than a bare subtraction: the CHECK constraint would
    -- otherwise turn a counter that has drifted below zero into a failure to
    -- unsave, which would be a worse bug than a wrong number.
    UPDATE public.place_stats
       SET save_count = GREATEST(public.place_stats.save_count - 1, 0), updated_at = NOW()
     WHERE place_id = OLD.place_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS saved_places_stats_trg ON saved_places;
CREATE TRIGGER saved_places_stats_trg
  AFTER INSERT OR DELETE ON saved_places
  FOR EACH ROW EXECUTE FUNCTION public.place_stats_apply();

-- ── saved_places_detailed ────────────────────────────────────────────────────
--
-- A saved place is only useful with the place attached — a library screen shows
-- names and countries, not uuids. Filtering that list by destination has to
-- happen in the database, on an indexed column, in ONE query.
--
-- WHY A VIEW RATHER THAN AN EMBEDDED SELECT:
--   PostgREST can express this as `places!inner(...)` with a filter on the
--   embedded relation, and that works — but it puts the shape of the join into
--   every caller and into the test harness. A view names it once.
--
-- security_invoker = true is the load-bearing word. Without it the view would
-- run as its owner and quietly bypass RLS on both underlying tables, turning a
-- convenience into a data leak. With it, a caller sees exactly the saves they
-- own, joined to exactly the places they are allowed to see.
CREATE OR REPLACE VIEW saved_places_detailed WITH (security_invoker = true) AS
SELECT
  s.id            AS saved_id,
  s.user_id,
  s.place_id,
  s.collection_id,
  s.source_import_id,
  s.saved_at,
  p.slug,
  p.name,
  p.local_name,
  p.country_name,
  p.country_code,
  p.city,
  p.category,
  p.subcategory,
  p.latitude,
  p.longitude,
  p.address,
  p.website,
  p.phone,
  p.price_level,
  p.verification_status,
  COALESCE(st.save_count, 0) AS save_count
FROM saved_places s
JOIN places p ON p.id = s.place_id
LEFT JOIN place_stats st ON st.place_id = s.place_id;

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE saved_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_stats  ENABLE ROW LEVEL SECURITY;

-- A library is private. Read, add to and remove from your own; there is no
-- policy under which one traveler's saves are visible to another.
DROP POLICY IF EXISTS "saved_places_select_own" ON saved_places;
CREATE POLICY "saved_places_select_own" ON saved_places
  FOR SELECT USING (user_id = auth.uid());

-- WITH CHECK carries two conditions, and the second one is easy to leave out.
--
-- `user_id = auth.uid()` alone is not enough. A foreign key is enforced by the
-- database regardless of row-level security — that is what a foreign key is —
-- so a policy that only pins the owner still lets a traveler insert a save
-- naming a place they cannot see. Nothing leaks directly, because the library
-- view joins `places` and RLS filters it back out. But a save that succeeds for
-- one id and fails for another is an oracle for enumerating other travelers'
-- unverified places, and it moves a save_count for a place the caller has no
-- business knowing exists.
--
-- So the visibility rule from migration 013 is restated here as a condition of
-- saving: published, or your own.
DROP POLICY IF EXISTS "saved_places_insert_own" ON saved_places;
CREATE POLICY "saved_places_insert_own" ON saved_places
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM places p
      WHERE p.id = saved_places.place_id
        AND (p.verification_status = 'domner_public' OR p.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "saved_places_delete_own" ON saved_places;
CREATE POLICY "saved_places_delete_own" ON saved_places
  FOR DELETE USING (user_id = auth.uid());

-- UPDATE exists for one future reason only: filing a save into a collection.
-- It cannot be used to move a save to another traveler or to another place —
-- the guard below pins both, so the only column that can ever change is
-- collection_id.
DROP POLICY IF EXISTS "saved_places_update_own" ON saved_places;
CREATE POLICY "saved_places_update_own" ON saved_places
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.saved_places_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.saved_at := NOW();
    RETURN NEW;
  END IF;

  -- Re-pointing a save at a different place would move the save_count of two
  -- places at once without the counter trigger noticing, because it only fires
  -- on INSERT and DELETE. Changing the owner would hand somebody else's
  -- library a row. Neither is a thing this table supports.
  NEW.user_id  := OLD.user_id;
  NEW.place_id := OLD.place_id;
  NEW.saved_at := OLD.saved_at;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS saved_places_guard_trg ON saved_places;
CREATE TRIGGER saved_places_guard_trg
  BEFORE INSERT OR UPDATE ON saved_places
  FOR EACH ROW EXECUTE FUNCTION public.saved_places_guard();

-- place_stats: readable by anyone signed in, writable by nobody. The trigger
-- above is the only thing that changes it, and it runs as the function's owner.
-- No INSERT, UPDATE or DELETE policy exists, so RLS denies all three.
DROP POLICY IF EXISTS "place_stats_read" ON place_stats;
CREATE POLICY "place_stats_read" ON place_stats
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── Backfill ─────────────────────────────────────────────────────────────────
--
-- Every canonical place starts at zero saves, which is true: this migration
-- introduces the only table that can record one. Written explicitly rather than
-- left to the trigger so a place card can read a row instead of coping with a
-- missing one, and so the reconciliation query in docs/SOCIAL-SAVE.md has
-- something to compare against.
INSERT INTO place_stats (place_id, save_count)
SELECT id, 0 FROM places
ON CONFLICT (place_id) DO NOTHING;
