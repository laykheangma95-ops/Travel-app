-- Optional factual opening hours for itinerary conflict detection.
-- Missing is NULL: the UI never invents hours when the catalogue does not know them.
ALTER TABLE destination_places
  ADD COLUMN IF NOT EXISTS opening_hours JSONB,
  ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE destination_places DROP CONSTRAINT IF EXISTS destination_places_opening_hours_object;
ALTER TABLE destination_places ADD CONSTRAINT destination_places_opening_hours_object
  CHECK (opening_hours IS NULL OR jsonb_typeof(opening_hours) = 'object');
