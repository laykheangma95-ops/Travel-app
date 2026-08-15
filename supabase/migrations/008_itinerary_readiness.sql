-- Trip readiness, wired to the tables that actually hold an itinerary.
--
-- WHAT WAS WRONG:
--   lib/travel/context.ts derived three of the five readiness steps — stay,
--   places and itinerary — from `trip_plans.generated_itinerary`. Nothing in
--   the codebase has ever written that column; it appears only in reads. The
--   fallback path for `places` read `trip_checklist_items`, which nothing
--   writes either.
--
--   Meanwhile the itinerary builder (migration 007) writes `itinerary_days`
--   and `itinerary_places`, which readiness never looked at. So a traveler
--   could build a complete five-day plan and their trip still reported the
--   itinerary as not started. Readiness could never exceed 40%, and the
--   "Everything is in place for this trip" state was unreachable.
--
-- WHAT THIS CHANGES:
--   Adds 'stay' to the category vocabulary, so somewhere to sleep can be
--   recorded as an itinerary place rather than inferred from a JSON blob that
--   is never populated. This also makes the "Stay" filter in the add-place
--   sheet truthful — it previously filtered to category 'other', a catch-all.
--
--   Purely additive: the CHECK constraints widen, no column changes type, no
--   row is rewritten, and every existing value stays valid. `generated_itinerary`
--   is left in place and untouched — deprecating a column is a later migration,
--   never the same one that stops depending on it.

ALTER TABLE destination_places
  DROP CONSTRAINT IF EXISTS destination_places_category_check;
ALTER TABLE destination_places
  ADD CONSTRAINT destination_places_category_check
  CHECK (category IN ('spot', 'food', 'shopping', 'transport', 'stay', 'other'));

ALTER TABLE itinerary_places
  DROP CONSTRAINT IF EXISTS itinerary_places_category_check;
ALTER TABLE itinerary_places
  ADD CONSTRAINT itinerary_places_category_check
  CHECK (category IN ('spot', 'food', 'shopping', 'transport', 'stay', 'other'));

-- Readiness asks "does this trip have any places at all, and does any numbered
-- day have one?" on every homepage and trips render. Both are answered from
-- itinerary_places joined back to its day, so the day's trip_id needs to be
-- reachable cheaply.
CREATE INDEX IF NOT EXISTS itinerary_places_day_category_idx
  ON itinerary_places (itinerary_day_id, category);
