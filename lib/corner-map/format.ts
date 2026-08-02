// Corner Map formatting. §3 (the stamp) and §8 (bilingual rules).

import type { Corner } from './types';
import type { Lang } from '@/lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The timestamp burn: `'26 7 27 19:42` — 90s point-and-shoot date stamp.
 *
 * Built digit by digit rather than through Intl on purpose. §8: the stamp uses
 * Latin numerals *always*, because Khmer numerals break the camera-stamp read.
 * A locale-aware formatter would quietly render ១៩:៤២ under `km`.
 */
export function stampOf(d: Date): string {
  const yy = pad(d.getFullYear() % 100);
  return `'${yy} ${d.getMonth() + 1} ${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date only — what an ARCHIVE shot shows in place of a time. */
export function stampDateOnly(d: Date): string {
  return `'${pad(d.getFullYear() % 100)} ${d.getMonth() + 1} ${d.getDate()}`;
}

/** Whole minutes elapsed, floored at 0 so a skewed client clock reads as now. */
export const minutesSince = (d: Date, now: Date = new Date()): number =>
  Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60_000));

/**
 * Corner names: Khmer primary + English secondary under `km`, reversed under
 * `en` (§8).
 *
 * Both halves carry their own language tag, and callers must put them on the
 * elements. This is not cosmetic: without `lang="km"` the secondary line falls
 * back to the Latin face, which has no Khmer glyphs, and the script renders
 * as decomposed clusters with the wrong spacing — exactly the failure §3 says
 * most apps ship.
 */
export function cornerName(
  corner: Pick<Corner, 'name_en' | 'name_km'>,
  lang: Lang
): {
  primary: string;
  secondary: string | null;
  primaryLang: Lang;
  secondaryLang: Lang;
} {
  const km = corner.name_km?.trim() || null;
  const en = corner.name_en.trim();

  if (lang === 'km' && km) {
    return { primary: km, secondary: en || null, primaryLang: 'km', secondaryLang: 'en' };
  }
  // English locale, or a corner with no Khmer name yet.
  return {
    primary: en || km || '',
    secondary: en && km ? km : null,
    primaryLang: en ? 'en' : 'km',
    secondaryLang: 'km',
  };
}

/**
 * Naive script detection for `caption_lang` (§5.3). Khmer occupies U+1780–17FF;
 * a caption is Khmer if any Khmer codepoint appears, since mixed captions are
 * read as Khmer by a Khmer speaker.
 */
export const detectCaptionLang = (text: string): 'en' | 'km' =>
  /[ក-៿]/.test(text) ? 'km' : 'en';

/** Google Maps hand-off (§5.2). Venue coordinates — never the user's. */
export const directionsUrl = (corner: Pick<Corner, 'lat' | 'lng' | 'name_en'>): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${corner.lat},${corner.lng}` +
  `&destination_place_id=&travelmode=driving#${encodeURIComponent(corner.name_en)}`;

/** Public URL for a stored shot. Paths are unguessable uuids in a public bucket. */
export function shotUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return storagePath;
  return `${base}/storage/v1/object/public/shots/${storagePath}`;
}
