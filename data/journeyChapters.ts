import type { DictKey } from '@/lib/i18n';

/**
 * The homepage's scroll narrative, as a list of chapters.
 *
 * The spine (components/home/JourneySpine) reads this to draw its rail, and
 * each entry pairs with a `data-journey-id` on the section it narrates. Order
 * here is the reading order — the spine does not sort, it trusts this list.
 *
 * `lat`/`lon` is where the chapter "happens" on the globe. The stage chapters
 * (origin, cambodia) use it to dock the 3D hero globe; the night-canvas
 * chapters use it for the spine traveller's world dial, so scrolling the page
 * turns a planet rather than filling a progress bar.
 */
export interface JourneyChapter {
  /** Matches `data-journey-id` on the section this chapter narrates. */
  id: string;
  /** Short bilingual name shown on the spine (resolved through lib/i18n). */
  labelKey: DictKey;
  lat: number;
  lon: number;
}

export const journeyChapters: JourneyChapter[] = [
  // Stage chapters — these two sit under the shared 3D globe.
  { id: 'origin', labelKey: 'chapter.origin', lat: 20, lon: 128 }, // East Asia rising
  { id: 'cambodia', labelKey: 'chapter.cambodia', lat: 11.56, lon: 104.92 }, // Phnom Penh
  // Night-canvas chapters — the globe is a mini world dial from here down.
  { id: 'why', labelKey: 'features.eyebrow', lat: 11.56, lon: 104.92 },
  { id: 'how', labelKey: 'how.eyebrow', lat: 13.75, lon: 100.5 }, // Bangkok
  { id: 'where', labelKey: 'dest.eyebrow', lat: 35.68, lon: 139.69 }, // Tokyo
  { id: 'stories', labelKey: 'testi.eyebrow', lat: 1.35, lon: 103.82 }, // Singapore
];

/** Phnom Penh — the chapter the hero globe docks to. */
export const HOME_CHAPTER = journeyChapters[1];
