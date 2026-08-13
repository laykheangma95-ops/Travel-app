-- ═══════════════════════════════════════════════════════════════════════════
-- 007 — Trip itineraries, saved places and stays
--
-- The storage behind the trip planner: save places from social media, tell us
-- where you are staying, get a day-by-day itinerary you can actually reorder.
--
-- ADDITIVE ONLY. No table is dropped, no column is removed, no row is
-- rewritten. `trip_plans` gains columns and keeps every one it had.
--
-- WHY THE ITINERARY BECOMES ROWS INSTEAD OF STAYING JSONB
--   `trip_plans.generated_itinerary` is a single JSONB blob written by the
--   generator. That shape can be displayed and nothing else:
--     · you cannot drag day 3's museum to day 4 without rewriting the document
--     · you cannot store the travel leg between two stops, which is the whole
--       point of routing a day on a map
--     · you cannot mark one stop as "I chose this, do not touch it" and
--       regenerate the rest
--     · two devices editing one trip overwrite each other wholesale
--   The brief asks for an itinerary that is "fully adjustable", so the unit of
--   storage has to be the stop, not the document.
--
--   generated_itinerary IS DELIBERATELY LEFT IN PLACE. It holds live rows, and
--   rule 12 forbids destroying data. It becomes the raw record of what the
--   generator last produced, while the tables below hold what the traveler
--   actually has. Dropping it is a later migration, never this one.
--
-- MONEY: `estimated_cost_usd` is DECIMAL(10,2), matching esim_orders and the
-- rest of the live schema. CLAUDE.md §4 wants integer minor units; §12 records
-- that the shipped decimals stand until the owner decides to convert. Adding a
-- second, inconsistent convention here would make that conversion harder, not
-- easier, so this follows what is shipped.
--
-- Apply after 006_travel_notifications.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. trip_plans gains what the planner needs ───────────────────────────────

ALTER TABLE trip_plans
  -- `destination` is free text, so lib/travel/context.ts fuzzy-matches it
  -- against the catalogue in JavaScript on every read to find a flag and a
  -- link. Storing the slug once, when the trip is created, makes that a join
  -- instead of a guess. The old column stays: it carries what the traveler
  -- typed, which is not always a country we sell.
  ADD COLUMN IF NOT EXISTS destination_slug TEXT,

  -- Where the itinerary stands. Drives whether the UI offers "generate" or
  -- "regenerate", and records that a human has taken it over.
  ADD COLUMN IF NOT EXISTS itinerary_status TEXT NOT NULL DEFAULT 'none'
    CHECK (itinerary_status IN ('none', 'generating', 'generated', 'adjusted', 'failed')),

  ADD COLUMN IF NOT EXISTS itinerary_generated_at TIMESTAMPTZ,

  -- trip_plans was created without one, so nothing could tell a stale cached
  -- trip from a fresh one.
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_trip_plans_user ON trip_plans(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_trip_plans_slug ON trip_plans(destination_slug);

-- Every CREATE below is guarded, so a migration that fails halfway (a dropped
-- connection, a timeout) can simply be run again instead of needing the
-- half-applied half unpicked by hand first.
DROP TRIGGER IF EXISTS trip_plans_touch ON trip_plans;
CREATE TRIGGER trip_plans_touch
  BEFORE UPDATE ON trip_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 2. Saved places ──────────────────────────────────────────────────────────
--
-- The premise of the whole feature: people already collect places on TikTok and
-- Instagram long before they book anything. Saving is therefore NOT scoped to a
-- trip — `trip_id` is nullable, and most rows will start null. Someone saves a
-- restaurant in March and decides it is a Bangkok trip in July; forcing a trip
-- at save time would mean the collection can only start after the commitment,
-- which is backwards from how people actually plan.

CREATE TABLE IF NOT EXISTS saved_places (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Nullable on purpose. See above.
  trip_id UUID REFERENCES trip_plans(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  -- What kind of place. This is what the generator personalises on — the brief
  -- asks it to notice you are a climbing-and-museums traveler rather than a
  -- shopping one. Free text would make that impossible to group, so it is
  -- constrained; 'other' is the escape hatch rather than a silent NULL.
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN (
      'food', 'cafe', 'shopping', 'museum', 'nature', 'hiking', 'climbing',
      'beach', 'nightlife', 'temple', 'landmark', 'activity', 'stay', 'other'
    )),

  -- Where it came from. Kept because a place saved off a TikTok can be shown
  -- back with its clip, and because a place the traveler typed by hand deserves
  -- more trust than one auto-extracted from a caption.
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'tiktok', 'instagram', 'facebook', 'youtube', 'web', 'search')),
  source_url TEXT,
  /** Whatever the share sheet handed us, before parsing. Keeping it means a
      parser bug can be re-run over the original text instead of losing it. */
  source_payload JSONB,

  country_slug TEXT,
  city TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  /** The map provider's own id, so a place can be re-resolved for hours,
      ratings or closures without re-geocoding a free-text address. */
  external_place_id TEXT,

  image_url TEXT,
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_places_trip ON saved_places(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saved_places_country ON saved_places(user_id, country_slug);

DROP TRIGGER IF EXISTS saved_places_touch ON saved_places;
CREATE TRIGGER saved_places_touch
  BEFORE UPDATE ON saved_places
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 3. Stays ─────────────────────────────────────────────────────────────────
--
-- "Ask them where they stay." A stay is not just a fact about the trip, it is
-- the anchor every day's route is measured from — the first and last leg of
-- each day start and end here. Separate from saved_places because it has dates
-- and a booking reference, and because a trip can legitimately have several
-- (three nights in Osaka, then four in Kyoto).

CREATE TABLE IF NOT EXISTS trip_stays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  external_place_id TEXT,

  check_in DATE,
  check_out DATE,
  booking_reference TEXT,
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A stay that ends before it starts is a data-entry slip, and it would break
  -- every "which stay covers this day?" lookup downstream.
  CONSTRAINT trip_stays_dates_ordered CHECK (
    check_in IS NULL OR check_out IS NULL OR check_out >= check_in
  )
);

CREATE INDEX IF NOT EXISTS idx_trip_stays_trip ON trip_stays(trip_id, check_in);

DROP TRIGGER IF EXISTS trip_stays_touch ON trip_stays;
CREATE TRIGGER trip_stays_touch
  BEFORE UPDATE ON trip_stays
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 4. Itinerary days ────────────────────────────────────────────────────────
--
-- `day_number` rather than `date` is the primary ordering, because a trip can
-- exist before its dates do — people plan "five days in Vietnam, sometime in
-- March". `date` is filled in once the trip is committed.

CREATE TABLE IF NOT EXISTS itinerary_days (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  day_number INTEGER NOT NULL CHECK (day_number >= 1),
  date DATE,
  title TEXT,
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One day 3 per trip. Without this, a retried generation silently produces
  -- two of every day and the itinerary renders twice.
  CONSTRAINT itinerary_days_unique_per_trip UNIQUE (trip_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_days_trip ON itinerary_days(trip_id, day_number);

DROP TRIGGER IF EXISTS itinerary_days_touch ON itinerary_days;
CREATE TRIGGER itinerary_days_touch
  BEFORE UPDATE ON itinerary_days
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 5. Itinerary items ───────────────────────────────────────────────────────
--
-- One stop. The unit the traveler drags, deletes and argues with.

CREATE TABLE IF NOT EXISTS itinerary_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  -- Denormalised from the day so that "everything in this trip" is one query
  -- and RLS does not need a join on every row.
  trip_id UUID NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Order within the day. A gapped sequence (10, 20, 30) lets a stop be dropped
  -- between two others by picking a number in between, instead of renumbering
  -- every row after it on every drag.
  position INTEGER NOT NULL,

  item_type TEXT NOT NULL DEFAULT 'place'
    CHECK (item_type IN ('place', 'meal', 'transport', 'rest', 'flight', 'checkin', 'note')),

  /** Set when this stop came from something the traveler saved. Nulled rather
      than cascaded if they later delete the saved place — the stop is still in
      their plan and deleting a bookmark should not silently edit the trip. */
  saved_place_id UUID REFERENCES saved_places(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  note TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  external_place_id TEXT,

  start_time TIME,
  end_time TIME,
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),

  -- ── The leg from the previous stop ──
  -- Stored on the arriving stop, so reordering a day only has to recompute the
  -- items that actually moved.
  travel_minutes INTEGER CHECK (travel_minutes IS NULL OR travel_minutes >= 0),
  travel_distance_metres INTEGER CHECK (travel_distance_metres IS NULL OR travel_distance_metres >= 0),
  travel_mode TEXT CHECK (travel_mode IS NULL OR travel_mode IN
    ('walk', 'transit', 'car', 'taxi', 'bike', 'ferry', 'flight')),

  -- ── "Is this a bad time to go?" ──
  -- The brief asks for the reason a stop is a poor idea — weather, a public
  -- holiday, a queue. Two columns rather than a sentence: the code is what the
  -- UI styles and filters on, the note is what the traveler reads.
  --
  -- NULL means "we have not checked", NOT "it is fine". Queue times and holiday
  -- calendars are per-country paid data we do not have for every destination,
  -- and rendering "no wait" for a place we know nothing about is the kind of
  -- confident wrong answer that loses trust (same rule as data/planPolicy.ts).
  advisory_code TEXT CHECK (advisory_code IS NULL OR advisory_code IN
    ('weather', 'public_holiday', 'closed', 'long_queue', 'peak_hour', 'seasonal', 'safety')),
  advisory_note TEXT,
  expected_wait_minutes INTEGER CHECK (expected_wait_minutes IS NULL OR expected_wait_minutes >= 0),
  advisory_checked_at TIMESTAMPTZ,

  estimated_cost_usd DECIMAL(10,2) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),

  -- Who put this here. 'ai' rows may be replaced by a regeneration; the others
  -- are the traveler's own decisions.
  source TEXT NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai', 'user', 'saved_place')),

  -- The one flag that makes "adjust it if you don't like it" survivable. A
  -- traveler who moves the temple to Thursday and then asks for a better
  -- itinerary must not find it back on Tuesday. Regeneration is expected to
  -- rebuild unlocked rows and leave locked ones alone.
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT itinerary_items_times_ordered CHECK (
    start_time IS NULL OR end_time IS NULL OR end_time >= start_time
  )
);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_day ON itinerary_items(day_id, position);
CREATE INDEX IF NOT EXISTS idx_itinerary_items_trip ON itinerary_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_items_place ON itinerary_items(saved_place_id)
  WHERE saved_place_id IS NOT NULL;

DROP TRIGGER IF EXISTS itinerary_items_touch ON itinerary_items;
CREATE TRIGGER itinerary_items_touch
  BEFORE UPDATE ON itinerary_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 6. Row-level security ────────────────────────────────────────────────────
--
-- Default deny, then own-rows-only (rule 4). WITH CHECK is written out rather
-- than left to default from USING: on these tables a write carries a user_id
-- and a trip_id, and being explicit is what stops a row being inserted against
-- someone else's trip.

ALTER TABLE saved_places     ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_stays       ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_days   ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_places_all_own" ON saved_places;
CREATE POLICY "saved_places_all_own" ON saved_places
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trip_stays_all_own" ON trip_stays;
CREATE POLICY "trip_stays_all_own" ON trip_stays
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "itinerary_days_all_own" ON itinerary_days;
CREATE POLICY "itinerary_days_all_own" ON itinerary_days
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "itinerary_items_all_own" ON itinerary_items;
CREATE POLICY "itinerary_items_all_own" ON itinerary_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- A shared trip has to render for the person it was shared with. trip_plans
-- already publishes itself via `trips_public_read`; the itinerary follows the
-- same switch, so one toggle governs the whole trip and there is no way to
-- publish a trip while its days stay invisible.
--
-- READ ONLY, and deliberately narrower than the trip itself: stays are not
-- included. A booking reference and the address of the bed someone is sleeping
-- in are not part of "here is my itinerary", and a public link is a link
-- anybody can forward.

DROP POLICY IF EXISTS "itinerary_days_public_read" ON itinerary_days;
CREATE POLICY "itinerary_days_public_read" ON itinerary_days
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trip_plans t
      WHERE t.id = itinerary_days.trip_id AND t.is_public = TRUE
    )
  );

DROP POLICY IF EXISTS "itinerary_items_public_read" ON itinerary_items;
CREATE POLICY "itinerary_items_public_read" ON itinerary_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trip_plans t
      WHERE t.id = itinerary_items.trip_id AND t.is_public = TRUE
    )
  );
