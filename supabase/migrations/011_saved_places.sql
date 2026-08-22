-- Saved places: let a destination-guide "save" action find or create the
-- matching catalogue row by a stable slug instead of inserting a duplicate
-- every time it's pressed, and mark trips that were auto-created by a save.

-- content_slug ties a destination_places row to the guide content it came
-- from (e.g. "bangkok:wat-pho"), so a repeat save resolves to the same row
-- instead of inserting a duplicate. NULL for every existing row: none of
-- them came from the guide, so none has a slug to look up by.
ALTER TABLE destination_places
  ADD COLUMN IF NOT EXISTS content_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS destination_places_content_slug_idx
  ON destination_places (content_slug)
  WHERE content_slug IS NOT NULL;

-- is_wishlist marks a trip that was auto-created by saving a place, as
-- opposed to one filled out through the "New trip" form. Defaults false:
-- every existing trip came from the form, not a save.
ALTER TABLE trip_plans
  ADD COLUMN IF NOT EXISTS is_wishlist BOOLEAN NOT NULL DEFAULT false;
