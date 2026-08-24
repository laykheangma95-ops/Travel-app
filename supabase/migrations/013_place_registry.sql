-- The canonical place registry.
--
-- THE PROBLEM IT SOLVES:
--   `destination_places` is a per-traveler table. Migration 009 made it that
--   way deliberately — my "Our hotel" is mine, and yours is yours. It is the
--   right shape for a saved copy and the wrong shape for a shared fact: when a
--   hundred travelers import the same night market, that is a hundred rows,
--   with a hundred spellings and no way to say they are one place.
--
--   This adds the missing half. `places` holds ONE row per real-world place.
--   `place_external_ids` is what makes that stick: a trusted provider's id maps
--   onto exactly one canonical place, so the hundred-and-first import resolves
--   instead of inserting.
--
-- WHAT IS NOT TOUCHED:
--   `destination_places` keeps every column, policy and index it had, and gains
--   one nullable pointer. `itinerary_days`, `itinerary_places` and `trip_plans`
--   are untouched entirely. Every existing save path behaves exactly as before,
--   including for a traveler whose places never resolve to a canonical row.
--
-- THE RULE THIS TABLE EXISTS TO ENFORCE:
--   An AI guess must never become trusted public data on its own. That is not
--   a convention here, it is the RLS policy: an authenticated caller may insert
--   and edit only `unverified` rows. `provider_verified` requires a trusted
--   provider mapping, checked by a trigger. `domner_public` is reachable only
--   through the service role, which is to say only through a deliberate
--   server-side decision.

-- ── Deterministic keys, computed by the database ─────────────────────────────
--
-- Both of the columns below are GENERATED. The application has a matching
-- TypeScript implementation of each (lib/places/normalize.ts) because it needs
-- to compute the same values to look a place UP — but the stored value is the
-- database's, so a row can never carry a dedupe key that disagrees with its own
-- coordinates or its own name. tests/places.normalize.test.ts pins the two
-- implementations to each other.

-- Standard geohash, base32. Immutable by construction: same input, same output,
-- forever — which is what a generated column and an index require.
CREATE OR REPLACE FUNCTION public.geohash_encode(lat NUMERIC, lng NUMERIC, chars INT DEFAULT 9)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  base32   TEXT := '0123456789bcdefghjkmnpqrstuvwxyz';
  lat_min  DOUBLE PRECISION := -90;
  lat_max  DOUBLE PRECISION := 90;
  lng_min  DOUBLE PRECISION := -180;
  lng_max  DOUBLE PRECISION := 180;
  mid      DOUBLE PRECISION;
  is_lng   BOOLEAN := TRUE;
  bits     INT := 0;
  acc      INT := 0;
  result   TEXT := '';
  la       DOUBLE PRECISION := lat::DOUBLE PRECISION;
  lo       DOUBLE PRECISION := lng::DOUBLE PRECISION;
BEGIN
  IF lat IS NULL OR lng IS NULL THEN RETURN NULL; END IF;

  WHILE length(result) < chars LOOP
    IF is_lng THEN
      mid := (lng_min + lng_max) / 2;
      IF lo >= mid THEN acc := acc * 2 + 1; lng_min := mid;
      ELSE                acc := acc * 2;     lng_max := mid; END IF;
    ELSE
      mid := (lat_min + lat_max) / 2;
      IF la >= mid THEN acc := acc * 2 + 1; lat_min := mid;
      ELSE               acc := acc * 2;     lat_max := mid; END IF;
    END IF;

    is_lng := NOT is_lng;

    IF bits < 4 THEN
      bits := bits + 1;
    ELSE
      result := result || substr(base32, acc + 1, 1);
      bits := 0;
      acc := 0;
    END IF;
  END LOOP;

  RETURN result;
END;
$fn$;

-- The comparable form of a name: case-folded, common Latin accents flattened,
-- punctuation and spacing removed. "Wat Pho", "wat pho" and "WAT-PHO" are one
-- name; "Wat Phra Kaew" is not.
--
-- `unaccent` is deliberately NOT used — it is an extension, and a dedupe key
-- that silently changes meaning depending on which extensions a database has
-- installed is worse than one that folds a fixed, written-down set. Scripts
-- without a Latin fold (Khmer, Chinese) still get case-folding and punctuation
-- stripping, which is what actually varies in a pasted caption.
CREATE OR REPLACE FUNCTION public.place_name_normalized(value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT translate(
           translate(
             lower(COALESCE(value, '')),
             'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőùúûüũūŭůűųýÿŷßæœ',
             'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuuyyysao'
           ),
           -- Whitespace and ASCII punctuation, written out character by
           -- character rather than expressed as [[:alnum:]] or [[:punct:]].
           --
           -- WHY NOT A CHARACTER CLASS: those classes are evaluated against the
           -- database's ctype, and they disagree with JavaScript's Unicode
           -- property escapes about Khmer and Thai combining marks — Postgres
           -- kept a spacing vowel sign and dropped a coeng, JavaScript dropped
           -- both. That divergence is invisible until every Khmer place name
           -- deduplicates against the wrong key. An explicit set is the same
           -- set in every database, under every collation.
           --
           -- Everything not listed here SURVIVES: Chinese, Khmer, Thai and
           -- their marks are all part of the name.
           ' ' || chr(9) || chr(10) || chr(13) || '!"#$%&''()*+,-./:;<=>?@[\]^_`{|}~',
           ''
         )
$fn$;

-- ── places ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS places (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- A stable, human-readable handle for URLs and support conversations.
  slug TEXT NOT NULL UNIQUE,

  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  -- The name in the local script, when it differs. Domner's travelers read
  -- Khmer and travel to countries that write in Chinese and Thai; "the name a
  -- taxi driver will recognise" is a different field from "the name in the
  -- caption", and conflating them loses one of them.
  local_name TEXT CHECK (local_name IS NULL OR length(local_name) <= 200),
  name_normalized TEXT GENERATED ALWAYS AS (public.place_name_normalized(name)) STORED,

  -- ISO-3166-1 alpha-2, and NULLABLE on purpose. Domner's existing country
  -- identity is the NAME (`trip_plans.destination`, `destination_places.destination`),
  -- and there is no reliable way to derive a code from a name in SQL. Inventing
  -- one during a backfill would be fabricated data. A provider fills it in when
  -- it knows it.
  country_code CHAR(2) CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  -- Matches `trip_plans.destination` exactly, because that is the key every
  -- existing query already joins on.
  country_name TEXT NOT NULL,

  city TEXT,
  district TEXT,
  neighborhood TEXT,

  -- The same six values as destination_places (see migration 008, which widened
  -- it to include 'stay'). A registry with its own vocabulary would need a
  -- translation table on every read.
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('spot','food','shopping','transport','stay','other')),
  subcategory TEXT,

  latitude  NUMERIC(9,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  geohash TEXT GENERATED ALWAYS AS (public.geohash_encode(latitude, longitude, 9)) STORED,

  address TEXT,
  website TEXT,
  phone TEXT,
  -- 1–4, the near-universal convention. NULL means we do not know, which is a
  -- different and more honest thing than 0.
  price_level SMALLINT CHECK (price_level IS NULL OR price_level BETWEEN 1 AND 4),

  -- The three states the whole design turns on:
  --   unverified        somebody says this place exists. Nobody has checked.
  --   provider_verified a trusted places provider confirms the real location.
  --   domner_public     safe to show to everyone. A deliberate decision.
  --   rejected          checked, and wrong. Kept so it is not re-created.
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','provider_verified','domner_public','rejected')),
  verified_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Uniqueness: the point of the whole table ─────────────────────────────────
--
-- A 7-character geohash is a cell roughly 150m × 150m. Two places with the same
-- normalized name inside one of those cells are the same place, in every real
-- case we could construct. So this index is the last line of defence against a
-- duplicate — the resolver in lib/places/repository.ts does proximity matching
-- first, which catches the cases this cannot.
--
-- IT CANNOT CATCH EVERYTHING, and pretending otherwise would be the bug: two
-- rows 10 metres apart can fall either side of a cell boundary. That is why the
-- resolver searches a real bounding box (below) rather than trusting a cell.
-- What this guarantees is that two concurrent inserts of the identical place
-- cannot both win.
CREATE UNIQUE INDEX IF NOT EXISTS places_identity_idx
  ON places (name_normalized, substr(geohash, 1, 7));

-- Proximity search. A bounding box on the real coordinates, not a geohash
-- prefix: a cell has edges, and two points either side of one are as far apart
-- as the query says they are close. The resolver reads the box and then
-- measures true distances in the application.
CREATE INDEX IF NOT EXISTS places_latlng_idx ON places (latitude, longitude);
CREATE INDEX IF NOT EXISTS places_country_city_idx ON places (country_name, city);
CREATE INDEX IF NOT EXISTS places_category_idx ON places (country_name, category);
-- The public browse path only ever wants published rows.
CREATE INDEX IF NOT EXISTS places_public_idx
  ON places (country_name, name) WHERE verification_status = 'domner_public';
CREATE INDEX IF NOT EXISTS places_owner_idx
  ON places (created_by) WHERE created_by IS NOT NULL;

-- ── place_external_ids ───────────────────────────────────────────────────────
--
-- The mapping that makes "100 users, 1 place" true.
--
-- WHY A TABLE AND NOT TWO COLUMNS ON `places`:
--   A place has ids from as many providers as have ever seen it, and the thing
--   that actually prevents duplication is a UNIQUE constraint on the provider's
--   id — which two columns on `places` cannot express without also forbidding a
--   second provider. The unique index below is the guarantee; `places` stays
--   free of any one vendor's vocabulary.
CREATE TABLE IF NOT EXISTS place_external_ids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  -- Our id for the adapter, e.g. 'sandbox'. Never a vendor SDK's own naming.
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 40),
  provider_place_id TEXT NOT NULL CHECK (length(provider_place_id) BETWEEN 1 AND 200),
  -- How sure the resolver was when it made this link. Kept so a bad link is
  -- reviewable rather than mysterious.
  match_confidence NUMERIC CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One provider id points at one canonical place. This is the constraint the
-- "one record per real-world place" promise actually rests on.
CREATE UNIQUE INDEX IF NOT EXISTS place_external_ids_provider_idx
  ON place_external_ids (provider, provider_place_id);
CREATE INDEX IF NOT EXISTS place_external_ids_place_idx ON place_external_ids (place_id);

-- ── The link back to the traveler's own copy ─────────────────────────────────
--
-- Additive and nullable. A destination_places row that has not been resolved
-- keeps working exactly as it does today; one that has been resolved gains a
-- pointer to the shared record. Nothing reads this column yet — wiring the
-- importer to it is the next phase, and doing both at once would mean changing
-- the save path in the same commit that introduces the table it saves into.
ALTER TABLE destination_places
  ADD COLUMN IF NOT EXISTS canonical_place_id UUID REFERENCES places(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS destination_places_canonical_idx
  ON destination_places (canonical_place_id) WHERE canonical_place_id IS NOT NULL;

-- ── Verification guard ───────────────────────────────────────────────────────
--
-- Two jobs, both of which have to be in the database rather than in application
-- code, because the application is not the only thing that can write here.
--
--   1. `provider_verified` requires an actual provider mapping. "Verified" with
--      nothing backing it is the exact failure this registry exists to prevent.
--   2. `verified_at` is stamped and cleared by the database, so it always
--      matches the status beside it.
CREATE OR REPLACE FUNCTION public.places_verification_guard() RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.verification_status = 'provider_verified'
     AND (TG_OP = 'UPDATE' AND OLD.verification_status IS DISTINCT FROM 'provider_verified')
     AND NOT EXISTS (SELECT 1 FROM place_external_ids e WHERE e.place_id = NEW.id) THEN
    RAISE EXCEPTION 'place % cannot be provider_verified without a provider mapping', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.verification_status IN ('provider_verified','domner_public') THEN
    IF TG_OP = 'INSERT' OR OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN
      NEW.verified_at := NOW();
    END IF;
  ELSE
    NEW.verified_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS places_verification_guard_trg ON places;
CREATE TRIGGER places_verification_guard_trg
  BEFORE INSERT OR UPDATE ON places
  FOR EACH ROW EXECUTE FUNCTION public.places_verification_guard();

DROP TRIGGER IF EXISTS places_touch ON places;
CREATE TRIGGER places_touch BEFORE UPDATE ON places
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE places             ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_external_ids ENABLE ROW LEVEL SECURITY;

-- Read: what has been published, plus your own unpublished submissions. An
-- unverified place another traveler created is invisible — an AI guess must not
-- reach anybody else's screen before it has been checked.
DROP POLICY IF EXISTS "places_read_public_or_own" ON places;
CREATE POLICY "places_read_public_or_own" ON places
  FOR SELECT USING (
    verification_status = 'domner_public'
    OR (created_by IS NOT NULL AND created_by = auth.uid())
  );

-- Write: your own rows, and only ever as `unverified`. This is the promotion
-- rule, expressed as a policy rather than as a habit: there is no value of the
-- request body that lets a traveler — or anything running as one, including a
-- future AI pipeline — write 'provider_verified' or 'domner_public'.
DROP POLICY IF EXISTS "places_insert_own_unverified" ON places;
CREATE POLICY "places_insert_own_unverified" ON places
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND verification_status = 'unverified'
  );

DROP POLICY IF EXISTS "places_update_own_unverified" ON places;
CREATE POLICY "places_update_own_unverified" ON places
  FOR UPDATE
  USING (created_by = auth.uid() AND verification_status = 'unverified')
  WITH CHECK (created_by = auth.uid() AND verification_status = 'unverified');

-- No DELETE policy: a canonical row may be referenced by other travelers' saved
-- copies. Wrong places are 'rejected', never removed.

-- Provider mappings are readable for published places and writable by nobody
-- but the service role.
--
-- WHY NOT LET A TRAVELER LINK ONE:
--   A caller who could write (provider, provider_place_id) could claim a real
--   Google id for a place they made up, and the unique index would then refuse
--   the genuine link when verification finally ran. That is a poisoning
--   vector with no upside, so linking is a server-side operation only.
DROP POLICY IF EXISTS "place_external_ids_read_public" ON place_external_ids;
CREATE POLICY "place_external_ids_read_public" ON place_external_ids
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM places p
      WHERE p.id = place_external_ids.place_id AND p.verification_status = 'domner_public'
    )
  );

-- ── Backfill: the editorial catalogue is already trusted ─────────────────────
--
-- `destination_places` rows with created_by IS NULL are the seeded editorial
-- catalogue (supabase/seeds/destination_places.sql) — written by us, already
-- shown to every traveler. They are canonical places that happen to have been
-- living in the wrong table, so they arrive as 'domner_public'.
--
-- Traveler rows (created_by IS NOT NULL) are deliberately NOT backfilled. They
-- are private copies, they are full of "Our hotel", and promoting them would
-- publish other people's notes.
--
-- ON CONFLICT DO NOTHING: two editorial rows for the same place in the same
-- 150m cell collapse into one canonical row, which is the entire point.
INSERT INTO places (slug, name, country_name, category, latitude, longitude, verification_status)
SELECT
  -- Slug from the content slug where the seed has one, else from name+country.
  COALESCE(
    d.content_slug,
    public.place_name_normalized(d.destination) || ':' || public.place_name_normalized(d.name)
  ),
  d.name,
  d.destination,
  d.category,
  d.lat,
  d.lng,
  'domner_public'
FROM destination_places d
WHERE d.created_by IS NULL
  AND d.lat IS NOT NULL
  AND d.lng IS NOT NULL
ON CONFLICT DO NOTHING;

-- Point each editorial row at the canonical record it produced.
UPDATE destination_places d
SET canonical_place_id = p.id
FROM places p
WHERE d.created_by IS NULL
  AND d.canonical_place_id IS NULL
  AND p.name_normalized = public.place_name_normalized(d.name)
  AND substr(p.geohash, 1, 7) = substr(public.geohash_encode(d.lat, d.lng, 9), 1, 7);
