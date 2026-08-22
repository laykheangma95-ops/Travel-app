// ─────────────────────────────────────────────────────────────────────────────
// The contract between guide content and the place catalogue.
//
// A destination guide offers "Save to my trip" on each place. That works only if
// the place's `contentSlug` names a row the seed actually creates — and the two
// live in different files, edited at different times, by different kinds of
// work: one is editorial writing, the other is a data seed.
//
// So this suite is the join. If someone adds a place to a guide and forgets the
// catalogue row, the build fails here rather than a traveler discovering it as
// "That place is not in our guide yet" on a phone in Bangkok.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guides } from '@/content/destinations';

/** The same derivation scripts/csv-to-seed-sql.mjs uses. Kept in step by the test below. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface SeedRow {
  destination: string;
  name: string;
  category: string;
  slug: string;
}

/** Parse the seed CSV the same way the generator does, quoted fields included. */
function readSeed(): SeedRow[] {
  const lines = readFileSync('supabase/seeds/destination_places.csv', 'utf8').trim().split('\n');
  const header = lines.shift()!.split(',');
  const at = (name: string) => header.indexOf(name);

  return lines.map((line) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else quoted = !quoted;
        continue;
      }
      if (character === ',' && !quoted) {
        cells.push(current);
        current = '';
        continue;
      }
      current += character;
    }
    cells.push(current);

    const destination = cells[at('destination')];
    const name = cells[at('name')];
    return {
      destination,
      name,
      category: cells[at('category')],
      slug: `${slugify(destination)}:${slugify(name)}`,
    };
  });
}

const seed = readSeed();
const bySlug = new Map(seed.map((row) => [row.slug, row]));

const guidePlaces = guides.flatMap((guide) =>
  guide.places.list.map((place) => ({
    guide: guide.slug,
    country: guide.country.en,
    name: place.name.en,
    contentSlug: place.contentSlug,
  }))
);

describe('every guide place can actually be saved', () => {
  it('has at least one place to check', () => {
    expect(guidePlaces.length).toBeGreaterThan(0);
  });

  it.each(guidePlaces)(
    '$guide → "$name" resolves to a catalogue row',
    ({ contentSlug, name, guide }) => {
      const row = bySlug.get(contentSlug);
      expect(
        row,
        `${guide}: "${name}" points at content_slug "${contentSlug}", which no row in ` +
          `supabase/seeds/destination_places.csv produces. Add the place to the CSV, or ` +
          `point the guide at an existing row.`
      ).toBeDefined();
    }
  );

  it.each(guidePlaces)('$guide → "$name" is filed under the guide\'s country', ({ contentSlug, country, name, guide }) => {
    const row = bySlug.get(contentSlug);
    if (!row) return; // the test above already reports this
    // savePlaceForTraveler refuses a place whose destination does not match the
    // one the caller names, and the caller names guide.country.en.
    expect(
      row.destination,
      `${guide}: "${name}" is a ${country} entry but its catalogue row is filed under ` +
        `"${row.destination}". Saving it would be rejected as the wrong destination.`
    ).toBe(country);
  });
});

describe('the catalogue itself', () => {
  it('gives every row a distinct slug', () => {
    const counts = new Map<string, number>();
    for (const row of seed) counts.set(row.slug, (counts.get(row.slug) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
    expect(duplicates, `duplicate content_slug: ${duplicates.map(([slug]) => slug).join(', ')}`).toEqual([]);
  });

  it('only uses categories the database will accept', () => {
    // Migration 008's CHECK constraint. A bad value here fails at seed time.
    const allowed = new Set(['spot', 'food', 'shopping', 'transport', 'stay', 'other']);
    const bad = seed.filter((row) => !allowed.has(row.category));
    expect(bad.map((row) => `${row.name}=${row.category}`)).toEqual([]);
  });

  it('generates the SQL that is checked in', () => {
    // The .sql is generated and must not be hand-edited. If the CSV moved on
    // without a regenerate, every slug assertion above would be testing a file
    // the database never sees.
    const sql = readFileSync('supabase/seeds/destination_places.sql', 'utf8');
    expect(sql).toContain(`-- ${seed.length} rows`);
    for (const row of seed) expect(sql).toContain(`'${row.slug}'`);
  });
});
