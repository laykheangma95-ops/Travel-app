'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Your map.
//
// Every destination you have looked into leaves a faint line on the globe from
// Phnom Penh; every one you have actually bought an eSIM for leaves a gold one
// with the city lit at the end. Come back a month later and the planet is no
// longer a stock globe — it is yours, and it shows where you have been.
//
// This is the collectible system, and it is deliberately not a collectible
// system. There are no drops, no rarities, no seasonal sets, nothing random.
// Those mechanics work by manufacturing scarcity and then charging to relieve
// it, and this product's entire argument is that it tells you the truth when
// the category will not. A reward loop you can farm would undercut that on the
// same screen where we ask you to trust a visa rule.
//
// So the only thing that earns a mark is something you actually did. Two tiers,
// because one would be either meaningless (everyone gets all seven in a minute)
// or invisible (almost nobody buys on the first visit):
//
//   explored  — you read the guide.        Faint, cool, thin.
//   travelled — you bought an eSIM for it. Gold, brighter, city lit.
//
// Storage is local for now. When trip records land in Supabase (roadmap.md §1)
// this becomes a read of real trips and the marks follow you across devices —
// the shape below is already the shape that needs.
// ─────────────────────────────────────────────────────────────────────────────

export type JourneyKind = 'explored' | 'travelled';

export interface JourneyMark {
  slug: string;
  kind: JourneyKind;
  /** ISO timestamp of the first time this mark was earned. */
  at: string;
}

const KEY = 'domner-journeys';

function read(): JourneyMark[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is JourneyMark =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as JourneyMark).slug === 'string' &&
        ((m as JourneyMark).kind === 'explored' || (m as JourneyMark).kind === 'travelled'),
    );
  } catch {
    return [];
  }
}

function write(marks: JourneyMark[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(marks));
  } catch {
    /* private browsing — the map is simply not kept */
  }
}

export function getJourneys(): JourneyMark[] {
  return read();
}

/**
 * Record a mark. Returns true only when this is genuinely new — a first visit,
 * or an upgrade from explored to travelled — so the caller knows whether a
 * moment just happened and something should acknowledge it.
 *
 * A mark never downgrades. Once you have been somewhere, you have been there.
 */
export function recordJourney(slug: string, kind: JourneyKind): boolean {
  const marks = read();
  const existing = marks.find((m) => m.slug === slug);

  if (!existing) {
    marks.push({ slug, kind, at: new Date().toISOString() });
    write(marks);
    return true;
  }
  if (existing.kind === 'explored' && kind === 'travelled') {
    existing.kind = 'travelled';
    write(marks);
    return true;
  }
  return false;
}

/** How many places are on the map, and how many you actually went to. */
export function journeyCounts(): { explored: number; travelled: number } {
  const marks = read();
  return {
    explored: marks.length,
    travelled: marks.filter((m) => m.kind === 'travelled').length,
  };
}
