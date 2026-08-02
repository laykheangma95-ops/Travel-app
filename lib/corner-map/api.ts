// ═══════════════════════════════════════════════════════════════════════════
// CORNER MAP — client data access.
//
// Every read here goes through a query that returns *places and photos*. None
// of them select `shots.user_id`, and none of them can: §1 rule 3 says no
// endpoint returns who is at a location, and the cheapest way to keep that
// true is for the column never to enter a result set in the first place.
//
// Follows lib/supabase.ts's convention — when the project is not configured,
// fall back to local data rather than erroring, so the module is developable
// and demoable without a backend.
// ═══════════════════════════════════════════════════════════════════════════

import { getSupabase } from '@/lib/supabase';
import { SEED_CORNERS } from '@/data/cornerSeed';
import type {
  CornerWithHeat,
  OwnShot,
  ReportReason,
  SavedCorner,
  Shot,
} from './types';

/** Great-circle distance in metres. Used only to filter the local seed. */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const DEFAULT_RADIUS_M = 1200; // §5.1 — 1.2 km

const seedsNear = (lat: number, lng: number, radiusM: number) =>
  SEED_CORNERS.filter((c) => distanceM(lat, lng, c.lat, c.lng) <= radiusM);

export async function fetchNearbyCorners(
  lat: number,
  lng: number,
  radiusM: number = DEFAULT_RADIUS_M
): Promise<CornerWithHeat[]> {
  const supabase = getSupabase();
  if (!supabase) {
    // Unconfigured: cold seed corners only, so the empty state is honest.
    return seedsNear(lat, lng, radiusM);
  }

  const { data, error } = await supabase.rpc('corners_nearby', {
    in_lat: lat,
    in_lng: lng,
    radius_m: Math.round(radiusM),
    in_category: null,
  });

  if (error) {
    // The most likely error on a fresh deploy is that
    // supabase/migrations/20260727000000_corner_map.sql has not been run yet,
    // so corners_nearby() does not exist. Falling back to seeds keeps the map
    // usable instead of showing an empty screen that looks identical to "no
    // corners near you" — the one failure mode §5.1 explicitly rules out.
    console.warn(
      '[corner-map] corners_nearby() failed, falling back to seed corners. ' +
        'Has supabase/migrations/20260727000000_corner_map.sql been applied?',
      error.message
    );
    return seedsNear(lat, lng, radiusM);
  }

  // Migration applied but nobody has seeded any places yet — same fallback, so
  // the first users still have somewhere to post.
  const rows = (data ?? []) as CornerWithHeat[];
  return rows.length > 0 ? rows : seedsNear(lat, lng, radiusM);
}

/** Venue search for the capture picker (§5.3) and the map search field. */
export async function searchCorners(query: string, limit = 20): Promise<CornerWithHeat[]> {
  const q = query.trim();
  if (!q) return [];

  const searchSeeds = () => {
    const needle = q.toLowerCase();
    return SEED_CORNERS.filter(
      (c) => c.name_en.toLowerCase().includes(needle) || (c.name_km ?? '').includes(q)
    ).slice(0, limit);
  };

  const supabase = getSupabase();
  if (!supabase) return searchSeeds();

  const { data, error } = await supabase
    .from('corners')
    .select('id,name_en,name_km,category,lat,lng,address_en,address_km,bookable')
    .or(`name_en.ilike.%${q}%,name_km.ilike.%${q}%`)
    .limit(limit);

  // Same reasoning as fetchNearbyCorners: before the migration lands, the
  // table does not exist, and a dead search box is worse than a seeded one.
  if (error) return searchSeeds();

  return (data ?? []).map((c) => ({
    ...(c as CornerWithHeat),
    shot_count: 0,
    last_shot_at: null,
    heat: 0,
  }));
}

/**
 * Shots at a corner, newest first. RLS restricts this to live rows (plus the
 * viewer's own held rows), and blocked users' shots are filtered in the policy.
 */
export async function fetchCornerShots(cornerId: string, limit = 30): Promise<Shot[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('shots')
    // Note the columns: no user_id. See the header comment.
    .select(
      'id,corner_id,storage_path,blurhash,width,height,captured_at,caption,caption_lang,status'
    )
    .eq('corner_id', cornerId)
    .eq('status', 'live')
    .order('captured_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Shot[];
}

/** The "near you" rail: newest shots across the corners currently on screen. */
export async function fetchShotsForCorners(
  cornerIds: readonly string[],
  limit = 24
): Promise<Shot[]> {
  const supabase = getSupabase();
  if (!supabase || cornerIds.length === 0) return [];

  const { data, error } = await supabase
    .from('shots')
    .select(
      'id,corner_id,storage_path,blurhash,width,height,captured_at,caption,caption_lang,status'
    )
    .in('corner_id', [...cornerIds])
    .eq('status', 'live')
    .order('captured_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Shot[];
}

// ── Saves — the memory journal. Private to the user, always (§4 RLS). ───────

export async function fetchSavedCornerIds(): Promise<Set<string>> {
  const supabase = getSupabase();
  if (!supabase) return new Set();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Set();

  const { data, error } = await supabase.from('saves').select('corner_id');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.corner_id as string));
}

export async function saveCorner(cornerId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not-signed-in');

  const { error } = await supabase
    .from('saves')
    .upsert({ user_id: auth.user.id, corner_id: cornerId }, { onConflict: 'user_id,corner_id' });
  if (error) throw error;
}

export async function unsaveCorner(cornerId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from('saves').delete().eq('corner_id', cornerId);
  if (error) throw error;
}

export async function fetchSavedCorners(): Promise<SavedCorner[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('saves')
    .select(
      'id,note,created_at,corners(id,name_en,name_km,category,lat,lng,address_en,address_km,bookable)'
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.corners)
    .map((row) => {
      const c = row.corners as unknown as SavedCorner;
      return {
        ...c,
        save_id: row.id as string,
        note: (row.note as string | null) ?? null,
        saved_at: row.created_at as string,
        last_shot_at: null,
        shot_count: 0,
      };
    });
}

/** The viewer's own shots, for My Map (§5.4). Own rows only, by RLS. */
export async function fetchMyShots(limit = 200): Promise<OwnShot[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase
    .from('shots')
    .select(
      'id,corner_id,storage_path,blurhash,width,height,captured_at,caption,caption_lang,status,' +
        'corners(id,name_en,name_km,category,lat,lng)'
    )
    .eq('user_id', auth.user.id)
    .neq('status', 'removed')
    .order('captured_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  // PostgREST types the embedded relation loosely; reshape `corners` → `corner`
  // and drop any row whose corner was deleted out from under it.
  type Row = Shot & { corners: OwnShot['corner'] | null };
  return ((data ?? []) as unknown as Row[])
    .filter((row): row is Row & { corners: OwnShot['corner'] } => Boolean(row.corners))
    .map(({ corners, ...shot }) => ({ ...shot, corner: corners }));
}

// ── Report → 3 strikes → auto-hide (§4, §7) ────────────────────────────────

export async function reportShot(shotId: string, reason: ReportReason): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not-signed-in');

  // The unique (shot_id, reporter_id) constraint makes a second report from
  // the same person a no-op rather than a second strike.
  const { error } = await supabase
    .from('shot_reports')
    .upsert(
      { shot_id: shotId, reporter_id: auth.user.id, reason },
      { onConflict: 'shot_id,reporter_id' }
    );
  if (error) throw error;
}
