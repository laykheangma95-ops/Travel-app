-- Traveler-added places.
--
-- WHAT WAS WRONG:
--   The add-place sheet offered a "Custom" option whose only behaviour was to
--   render the message "Custom places can be added after selecting a
--   destination from Explore" — describing a capability that does not exist.
--
--   That mattered more than a dead button usually would. `destination_places`
--   is seeded editorially for a handful of countries, while the trip form
--   offers every country in data/countries. For every destination without a
--   seed, the itinerary builder had nothing to add and no way to add anything,
--   so the whole feature was unreachable.
--
-- WHAT THIS CHANGES:
--   `created_by` marks a row as belonging to one traveler. NULL means
--   editorial — the seeded rows, visible to everybody, exactly as before.
--
--   The read policy widens to "editorial, or mine". A traveler's own place is
--   never visible to another traveler, and the seeded catalogue is unchanged
--   for everyone. The write policy lets an authenticated caller insert, update
--   and delete only rows stamped with their own id, so nobody can edit the
--   editorial catalogue or another person's places through this table.
--
--   Additive. Every existing row keeps created_by NULL and stays readable by
--   all authenticated callers, which is what the previous policy granted.

ALTER TABLE destination_places
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- UNIQUE (destination, name) has to go: two travelers may each add "Our hotel"
-- for Thailand, and Postgres treats NULLs as distinct so a plain three-column
-- unique would stop protecting the editorial rows it was written for.
--
-- Replaced by two partial indexes that each say what was actually meant:
-- editorial names stay unique globally, and a traveler cannot add the same name
-- twice for one destination.
ALTER TABLE destination_places
  DROP CONSTRAINT IF EXISTS destination_places_destination_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS destination_places_editorial_name_idx
  ON destination_places (destination, name)
  WHERE created_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS destination_places_owner_name_idx
  ON destination_places (created_by, destination, name)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS destination_places_owner_idx
  ON destination_places (created_by, destination)
  WHERE created_by IS NOT NULL;

-- Read: the editorial catalogue, plus your own additions. Never anyone else's.
DROP POLICY IF EXISTS "destination_places_read_authenticated" ON destination_places;
CREATE POLICY "destination_places_read_authenticated" ON destination_places
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (created_by IS NULL OR created_by = auth.uid())
  );

-- Write: only rows stamped with your own id. The editorial rows (created_by
-- NULL) fail this check, so no traveler can edit or delete the catalogue.
DROP POLICY IF EXISTS "destination_places_insert_own" ON destination_places;
CREATE POLICY "destination_places_insert_own" ON destination_places
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "destination_places_update_own" ON destination_places;
CREATE POLICY "destination_places_update_own" ON destination_places
  FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "destination_places_delete_own" ON destination_places;
CREATE POLICY "destination_places_delete_own" ON destination_places
  FOR DELETE USING (created_by = auth.uid());
