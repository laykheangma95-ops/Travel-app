-- Saving a place straight from a destination guide.
--
-- WHAT WAS WRONG:
--   Nothing in the product could capture intent. A traveler reading a guide had
--   no way to keep a place: the only "add" path in the whole codebase is the
--   sheet inside the itinerary editor, four screens deep, and reachable only
--   after a trip already exists. Inspiration led nowhere, which is the exact
--   loop CLAUDE.md §2 rule 15 asks for and the repo did not have.
--
-- WHAT THIS CHANGES:
--   Two additive columns. No existing column, constraint or policy is touched,
--   and no row is rewritten.
--
--   `content_slug` links a destination_places row back to the static guide entry
--   it was created from (content/destinations/*.ts, rendered by
--   DestinationJourney). Guide places carry no id and no coordinates, so without
--   a stable key every save of the same place would insert another row.
--
--   `is_wishlist` marks a trip that exists only because someone saved a place
--   into it, rather than because they filled in the New trip form. It lets the
--   Trips screen file those separately instead of presenting a traveler with a
--   trip they do not remember creating.

ALTER TABLE destination_places
  ADD COLUMN IF NOT EXISTS content_slug TEXT;

-- Scoped to the owner, NOT globally unique on content_slug alone.
--
-- Migration 009's insert policy is `WITH CHECK (created_by = auth.uid())`, so a
-- row inserted through a traveler's own session client must carry their id — an
-- editorial row (created_by NULL) is rejected by RLS. That means every traveler
-- saving "bangkok:wat-pho" gets their own row, and a global unique index would
-- make the second traveler's insert collide with a row that 009's read policy
-- forbids them from seeing: the save would fail, or silently resolve to a row
-- they cannot read.
--
-- Partial, so the 75 seeded editorial rows (content_slug NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS destination_places_owner_content_slug_idx
  ON destination_places (created_by, content_slug)
  WHERE content_slug IS NOT NULL;

ALTER TABLE trip_plans
  ADD COLUMN IF NOT EXISTS is_wishlist BOOLEAN NOT NULL DEFAULT false;

-- The Trips screen reads "which of my trips are wishlist trips" on every render.
CREATE INDEX IF NOT EXISTS trip_plans_user_wishlist_idx
  ON trip_plans (user_id, is_wishlist);
