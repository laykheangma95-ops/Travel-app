-- ═══════════════════════════════════════════════════════════════════════════
-- CORNER MAP (ជ្រុង) — schema, RLS and the auto-hide trigger.
-- Spec: docs/corner-map-spec.md §4. Run after supabase/schema.sql.
--
-- GUARDRAILS — these are product rules, enforced here in the data layer:
--   1. A shot attaches to a corner_id (a venue). Raw GPS is never stored.
--      There is deliberately no lat/lng column on `shots`.
--   2. EXIF is stripped server-side on upload, unconditionally (lib/corner-map/image.ts).
--   3. No view, function or policy here may return "which users are at X".
--   4. Poster identity stays off the map layer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ll_to_earth() for the radius search in §5.1.
create extension if not exists cube;
create extension if not exists earthdistance;

-- ── corners ────────────────────────────────────────────────────────────────
-- A place. Canonical, deduped, shared by all users.
create table if not exists corners (
  id              uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  name_en         text not null,
  name_km         text,
  category        text not null
    check (category in ('cafe','restaurant','bar','temple','market','hotel','viewpoint','other')),
  lat             double precision not null,
  lng             double precision not null,
  address_en      text,
  address_km      text,
  bookable        boolean default false,   -- reservation hook, v2
  supplier_ref    text,                    -- partner venue id, v2
  created_at      timestamptz default now()
);

create index if not exists corners_geo on corners using gist (ll_to_earth(lat, lng));
create index if not exists corners_category on corners (category);

-- ── shots ──────────────────────────────────────────────────────────────────
-- A photo attached to a corner. Note the absence of any coordinate column:
-- location is expressed only by which corner the shot hangs off.
create table if not exists shots (
  id           uuid primary key default gen_random_uuid(),
  corner_id    uuid not null references corners(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  blurhash     text,
  width        int,
  height       int,
  captured_at  timestamptz not null,     -- client clock at capture, not upload
  uploaded_at  timestamptz default now(),
  caption      text check (char_length(caption) <= 140),
  caption_lang text check (caption_lang in ('en','km')),
  status       text not null default 'live'
    check (status in ('live','held','hidden','removed')),
  expires_at   timestamptz,              -- null = permanent in owner's map
  created_at   timestamptz default now()
);

create index if not exists shots_corner_time
  on shots (corner_id, captured_at desc) where status = 'live';
create index if not exists shots_user_time
  on shots (user_id, captured_at desc);

-- ── saves ──────────────────────────────────────────────────────────────────
-- User keeps a corner. This is the memory journal.
--
-- DEVIATION from spec v1: the spec introduced a new `trips` table. Domner
-- already has `trip_plans` (supabase/schema.sql), seeded by the arrival-flight
-- flow, so trip_id points there rather than creating a second trip concept.
create table if not exists saves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  corner_id  uuid not null references corners(id) on delete cascade,
  trip_id    uuid references trip_plans(id) on delete set null,
  note       text,
  created_at timestamptz default now(),
  unique (user_id, corner_id)
);

create index if not exists saves_user on saves (user_id, created_at desc);

-- ── shot_reports ───────────────────────────────────────────────────────────
create table if not exists shot_reports (
  id          uuid primary key default gen_random_uuid(),
  shot_id     uuid not null references shots(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null
    check (reason in ('person','unsafe','spam','wrong_place','other')),
  created_at  timestamptz default now(),
  unique (shot_id, reporter_id)
);

create index if not exists shot_reports_shot on shot_reports (shot_id);

-- ── corner_blocks ──────────────────────────────────────────────────────────
-- §7: "Block a user: their shots disappear from your view everywhere."
-- The table exists from day one because every shot feed has to be written
-- against it — retrofitting a block filter later means auditing every query.
create table if not exists corner_blocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, blocked_id),
  check (user_id <> blocked_id)
);

-- ── Under-18: capture disabled, view only (§7) ─────────────────────────────
alter table profiles add column if not exists date_of_birth date;

create or replace function public.corner_can_capture(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Unknown birthdate is treated as adult; the capture screen asks for it
  -- before the first upload. An explicitly under-18 birthdate blocks capture.
  select coalesce(
    (select date_of_birth is null or date_of_birth <= current_date - interval '18 years'
       from profiles where id = uid),
    true
  );
$$;

-- ── Auto-hide: 3 distinct reports → held (§4) ──────────────────────────────
create or replace function public.corner_autohide_shot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(distinct reporter_id) from shot_reports where shot_id = new.shot_id) >= 3 then
    update shots
       set status = 'held'
     where id = new.shot_id
       and status = 'live';
  end if;
  return new;
end;
$$;

drop trigger if exists shot_reports_autohide on shot_reports;
create trigger shot_reports_autohide
  after insert on shot_reports
  for each row execute function public.corner_autohide_shot();

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════

alter table corners      enable row level security;
alter table shots        enable row level security;
alter table saves        enable row level security;
alter table shot_reports enable row level security;
alter table corner_blocks enable row level security;

-- corners: world-readable. Writes only via the service role, which dedupes
-- against Google Places before inserting — no anon/authenticated write policy
-- exists, so RLS denies those by default.
drop policy if exists corners_public_read on corners;
create policy corners_public_read on corners
  for select using (true);

-- shots: only live rows are public. An author additionally sees their own
-- held/hidden rows so the "this is for places, try the spot itself" prompt in
-- §7 has something to render against.
drop policy if exists shots_public_read on shots;
create policy shots_public_read on shots
  for select using (
    (status = 'live' and not exists (
      select 1 from corner_blocks b
       where b.user_id = auth.uid() and b.blocked_id = shots.user_id
    ))
    or auth.uid() = user_id
  );

drop policy if exists shots_insert_own on shots;
create policy shots_insert_own on shots
  for insert with check (auth.uid() = user_id and public.corner_can_capture(auth.uid()));

drop policy if exists shots_update_own on shots;
create policy shots_update_own on shots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists shots_delete_own on shots;
create policy shots_delete_own on shots
  for delete using (auth.uid() = user_id);

-- saves: the memory journal. Private, full stop — never readable by others.
drop policy if exists saves_all_own on saves;
create policy saves_all_own on saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- shot_reports: a reporter may file and read back their own report. Reports
-- are never readable by the reported author (that would deanonymize reporting).
drop policy if exists reports_insert_own on shot_reports;
create policy reports_insert_own on shot_reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists reports_select_own on shot_reports;
create policy reports_select_own on shot_reports
  for select using (auth.uid() = reporter_id);

-- corner_blocks: private to the blocker.
drop policy if exists blocks_all_own on corner_blocks;
create policy blocks_all_own on corner_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Nearby corners (§5.1). Returns places and their heat — never a user id.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.corners_nearby(
  in_lat    double precision,
  in_lng    double precision,
  radius_m  int default 1200,
  in_category text default null
)
returns table (
  id           uuid,
  name_en      text,
  name_km      text,
  category     text,
  lat          double precision,
  lng          double precision,
  address_en   text,
  address_km   text,
  bookable     boolean,
  shot_count   bigint,
  last_shot_at timestamptz,
  heat         double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name_en, c.name_km, c.category, c.lat, c.lng,
         c.address_en, c.address_km, c.bookable,
         count(s.id) as shot_count,
         max(s.captured_at) as last_shot_at,
         -- half-life 6h, capped at 1 so one viral corner can't dominate
         least(1.0, coalesce(sum(
           power(0.5, greatest(0, extract(epoch from (now() - s.captured_at)) / 3600.0) / 6.0)
         ), 0))::double precision as heat
    from corners c
    left join shots s
      on s.corner_id = c.id
     and s.status = 'live'
     and not exists (
       select 1 from corner_blocks b
        where b.user_id = auth.uid() and b.blocked_id = s.user_id
     )
   where earth_box(ll_to_earth(in_lat, in_lng), radius_m) @> ll_to_earth(c.lat, c.lng)
     and earth_distance(ll_to_earth(in_lat, in_lng), ll_to_earth(c.lat, c.lng)) <= radius_m
     and (in_category is null or c.category = in_category)
   group by c.id
   order by heat desc, c.name_en asc
   limit 300;
$$;

grant execute on function public.corners_nearby(double precision, double precision, int, text)
  to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Storage: the shots bucket. Public read (paths are unguessable uuids),
-- writes only through the upload route running as the service role — that is
-- the choke point where EXIF is stripped, so clients must never write directly.
-- ═══════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('shots', 'shots', true)
on conflict (id) do nothing;

drop policy if exists shots_bucket_public_read on storage.objects;
create policy shots_bucket_public_read on storage.objects
  for select using (bucket_id = 'shots');

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed corners — the first places on the map.
--
-- These ids are deterministic (uuid5) and are duplicated in data/cornerSeed.ts,
-- which the client falls back to when this migration has not been applied yet.
-- Keeping the ids identical means a corner the user sees in the fallback is the
-- same row they post to once the database is live — otherwise the first upload
-- to a fallback corner would fail with 'unknown-corner'.
--
-- Insert only. `on conflict do nothing` so re-running the migration, or editing
-- a name in the dashboard afterwards, never clobbers live data.
-- ═══════════════════════════════════════════════════════════════════════════
insert into corners (id, name_en, name_km, category, lat, lng) values
  ('15c19329-8d00-5d6b-b8c1-4407ab69f5bc', 'Wat Phnom', 'វត្តភ្នំ', 'temple', 11.5765, 104.9215),
  ('bfb4c9f5-954a-5fa1-a07d-93e2c9bf51b2', 'Central Market', 'ផ្សារធំថ្មី', 'market', 11.5695, 104.9211),
  ('32be62f7-da05-563e-afbc-4863e5b132d8', 'Russian Market', 'ផ្សារទួលទំពូង', 'market', 11.5417, 104.9207),
  ('96500419-c62a-5fdd-92d7-2315f3cf74ba', 'Sisowath Quay', 'ផ្លូវព្រះស៊ីសុវត្ថិ', 'viewpoint', 11.5697, 104.9315),
  ('1d44085a-264c-5ec7-b18f-316a94733dfd', 'Royal Palace', 'ព្រះបរមរាជវាំង', 'temple', 11.5637, 104.9314),
  ('aa1c1faa-f1f9-56ea-8966-9b89d210367c', 'Boeung Keng Kang Café', 'ហាងកាហ្វេបឹងកេងកង', 'cafe', 11.5477, 104.9223),
  ('a91f5350-7ac5-501c-873d-be7932337d91', 'Street 240', 'ផ្លូវ ២៤០', 'cafe', 11.5595, 104.9276),
  ('d0825107-d5ca-5224-8b00-9513f24771c2', 'Naga Riverside', 'តំបន់ណាហ្គា', 'bar', 11.5619, 104.9294),
  ('9dba4867-26b1-5641-8a5c-baef320e20c8', 'Angkor Wat', 'អង្គរវត្ត', 'temple', 13.4125, 103.867),
  ('7a725a1a-f210-50ce-9fb2-65c9ba508ba9', 'Bayon', 'ប្រាសាទបាយ័ន', 'temple', 13.4413, 103.8587),
  ('f6dbcff8-da51-56f9-af58-c50158a542a7', 'Pub Street', 'ផ្លូវផាប', 'bar', 13.3549, 103.8558),
  ('598ae39e-6110-5f45-b68c-fbba736bf2ff', 'Psar Chas', 'ផ្សារចាស់', 'market', 13.3537, 103.8564),
  ('32399afc-c674-53c8-a2d6-7cbd1abe0fe6', 'Otres Beach', 'ឆ្នេរអូត្រេស', 'viewpoint', 10.5847, 103.5203),
  ('cb4fc147-b69c-5346-8d69-23d7c1b75bf6', 'Kampot Riverfront', 'មាត់ទន្លេកំពត', 'viewpoint', 10.6104, 104.1812),
  ('573442d5-03e2-5d99-bac0-4e73b127cd52', 'Kep Crab Market', 'ផ្សារក្តាមកែប', 'restaurant', 10.4833, 104.3)
on conflict (id) do nothing;
