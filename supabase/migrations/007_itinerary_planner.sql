-- Step 1 itinerary planner. This extends the existing trip_plans model; it does not
-- replace trips or alter checkout/auth tables.
CREATE TABLE IF NOT EXISTS destination_places (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  destination TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('spot', 'food', 'shopping', 'transport', 'other')),
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  description TEXT NOT NULL,
  photo_url TEXT,
  source TEXT NOT NULL DEFAULT 'editorial' CHECK (source IN ('editorial', 'ai_generated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (destination, name)
);

CREATE INDEX IF NOT EXISTS destination_places_destination_idx
  ON destination_places (destination, category, name);

CREATE TABLE IF NOT EXISTS itinerary_days (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  -- day 0 is the private, unscheduled Ideas holding area.
  day_index INTEGER NOT NULL CHECK (day_index >= 0),
  date DATE,
  theme TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, day_index)
);

CREATE TABLE IF NOT EXISTS itinerary_places (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES destination_places(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('spot', 'food', 'shopping', 'transport', 'other')),
  time_start TIME,
  time_end TIME,
  notes TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (itinerary_day_id, sort_order)
);

CREATE INDEX IF NOT EXISTS itinerary_days_trip_idx ON itinerary_days (trip_id, day_index);
CREATE INDEX IF NOT EXISTS itinerary_places_day_idx ON itinerary_places (itinerary_day_id, sort_order);

DROP TRIGGER IF EXISTS itinerary_days_touch ON itinerary_days;
CREATE TRIGGER itinerary_days_touch BEFORE UPDATE ON itinerary_days
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS itinerary_places_touch ON itinerary_places;
CREATE TRIGGER itinerary_places_touch BEFORE UPDATE ON itinerary_places
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE destination_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "destination_places_read_authenticated" ON destination_places;
CREATE POLICY "destination_places_read_authenticated" ON destination_places
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "itinerary_days_owner" ON itinerary_days;
CREATE POLICY "itinerary_days_owner" ON itinerary_days FOR ALL USING (
  EXISTS (SELECT 1 FROM trip_plans t WHERE t.id = itinerary_days.trip_id AND t.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM trip_plans t WHERE t.id = itinerary_days.trip_id AND t.user_id = auth.uid())
);
DROP POLICY IF EXISTS "itinerary_places_owner" ON itinerary_places;
CREATE POLICY "itinerary_places_owner" ON itinerary_places FOR ALL USING (
  EXISTS (SELECT 1 FROM itinerary_days d JOIN trip_plans t ON t.id = d.trip_id
          WHERE d.id = itinerary_places.itinerary_day_id AND t.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM itinerary_days d JOIN trip_plans t ON t.id = d.trip_id
          WHERE d.id = itinerary_places.itinerary_day_id AND t.user_id = auth.uid())
);