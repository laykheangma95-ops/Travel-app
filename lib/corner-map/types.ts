// Corner Map shared types. Mirrors supabase/migrations/20260727000000_corner_map.sql.
//
// Note what is absent: no shot carries a coordinate, and no type here exposes
// a poster's identity alongside a place. Both are load-bearing (§1, §7).

export type CornerCategory =
  | 'cafe'
  | 'restaurant'
  | 'bar'
  | 'temple'
  | 'market'
  | 'hotel'
  | 'viewpoint'
  | 'other';

export type ShotStatus = 'live' | 'held' | 'hidden' | 'removed';

export type ReportReason = 'person' | 'unsafe' | 'spam' | 'wrong_place' | 'other';

export interface Corner {
  id: string;
  name_en: string;
  name_km: string | null;
  category: CornerCategory;
  lat: number;
  lng: number;
  address_en: string | null;
  address_km: string | null;
  bookable: boolean;
}

/** A corner as returned by `corners_nearby()` — place plus its freshness roll-up. */
export interface CornerWithHeat extends Corner {
  shot_count: number;
  last_shot_at: string | null;
  heat: number;
}

/**
 * A photo at a corner. `user_id` is deliberately not part of this type: the map
 * and sheet layers never need it, and not carrying it means it cannot leak into
 * a location result set (§1 rule 4).
 */
export interface Shot {
  id: string;
  corner_id: string;
  storage_path: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  captured_at: string;
  caption: string | null;
  caption_lang: 'en' | 'km' | null;
  status: ShotStatus;
}

/** Shots in My Map are the viewer's own, so they carry the corner for grouping. */
export interface OwnShot extends Shot {
  corner: Pick<Corner, 'id' | 'name_en' | 'name_km' | 'category' | 'lat' | 'lng'>;
}

export interface SavedCorner extends Corner {
  save_id: string;
  note: string | null;
  saved_at: string;
  last_shot_at: string | null;
  shot_count: number;
}

/** §5.1 filter chips. `openLate` and `live` are computed, not categories. */
export type FilterId = 'live' | 'food' | 'coffee' | 'temples' | 'openLate';

export const FILTER_CATEGORIES: Partial<Record<FilterId, CornerCategory[]>> = {
  food: ['restaurant', 'market'],
  coffee: ['cafe'],
  temples: ['temple'],
  openLate: ['bar'],
};
