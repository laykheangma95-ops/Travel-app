#!/usr/bin/env node
// Converts a destination_places CSV (destination,name,category,lat,lng,
// description,photo_url,source) into a batched SQL insert file, so large
// files (e.g. an OSM pull) don't produce one unreadable multi-thousand-row
// statement.
//
//   node scripts/csv-to-seed-sql.mjs <in.csv> <out.sql> [batchSize=500]
//
// CONTENT SLUGS:
//   Each row also gets a `content_slug` — "<destination>:<name>", slugified —
//   which is the stable handle a save from a destination guide looks a place up
//   by (migration 011). Deriving it means the existing CSV needs no new column
//   and a future one gets slugs for free. A `content_slug` column in the CSV
//   overrides the derived value, which is the escape hatch for renaming a place
//   without forking its catalogue row: the derived slug follows the name, so
//   without an override a rename would look like a brand new place.
//
//   Duplicate slugs abort the run. Two rows sharing one slug would collide on
//   migration 011's unique index at apply time, and finding that out here is
//   considerably cheaper.
//
// RE-RUNNABLE:
//   The generated statements upsert on (destination, name) for editorial rows,
//   so applying this to a database that was already seeded backfills the slug
//   onto the existing rows instead of failing or duplicating them. Only
//   content_slug is written on conflict — a description someone has since
//   edited in place is left alone.

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** "Shenzhen Bao'an International Airport" → "shenzhen-baoan-international-airport" */
function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const [, , inPath, outPath, batchArg] = process.argv;
  if (!inPath || !outPath) {
    console.error("Usage: node scripts/csv-to-seed-sql.mjs <in.csv> <out.sql> [batchSize=500]");
    process.exit(1);
  }
  const batchSize = Number(batchArg) || 500;

  const fs = await import("node:fs");
  const lines = fs.readFileSync(inPath, "utf8").trim().split("\n");

  // Read the columns by name rather than by position, so an optional
  // content_slug column can be added to a CSV without disturbing the rest.
  const header = parseCsvLine(lines.shift()).map((column) => column.trim());
  const columnAt = (name) => {
    const index = header.indexOf(name);
    if (index === -1 && name !== "content_slug") {
      console.error(`Missing required CSV column: ${name}`);
      process.exit(1);
    }
    return index;
  };
  const at = {
    destination: columnAt("destination"),
    name: columnAt("name"),
    category: columnAt("category"),
    lat: columnAt("lat"),
    lng: columnAt("lng"),
    description: columnAt("description"),
    photo_url: columnAt("photo_url"),
    source: columnAt("source"),
    content_slug: columnAt("content_slug"),
  };

  const slugSeen = new Map();
  const rows = lines.map((line, index) => {
    const cells = parseCsvLine(line);
    const destination = cells[at.destination];
    const name = cells[at.name];
    const override = at.content_slug === -1 ? "" : (cells[at.content_slug] ?? "").trim();
    const contentSlug = override || `${slugify(destination)}:${slugify(name)}`;

    const clash = slugSeen.get(contentSlug);
    if (clash) {
      console.error(
        `Duplicate content_slug "${contentSlug}" on CSV lines ${clash} and ${index + 2}.\n` +
          `Migration 011 makes content_slug unique, so this would fail on apply. ` +
          `Rename one place, or give one an explicit content_slug column.`
      );
      process.exit(1);
    }
    slugSeen.set(contentSlug, index + 2);

    return `  (${sqlString(destination)}, ${sqlString(name)}, ${sqlString(
      cells[at.category]
    )}, ${cells[at.lat]}, ${cells[at.lng]}, ${sqlString(cells[at.description])}, ${sqlString(
      cells[at.photo_url]
    )}, ${sqlString(cells[at.source])}, ${sqlString(contentSlug)})`;
  });

  const batches = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }

  // ON CONFLICT targets destination_places_editorial_name_idx (migration 009),
  // the unique index over (destination, name) for editorial rows. Repeating its
  // WHERE predicate is what lets Postgres infer a partial index.
  const sql = batches
    .map(
      (batch) =>
        `insert into public.destination_places\n` +
        `  (destination, name, category, lat, lng, description, photo_url, source, content_slug)\n` +
        `values\n${batch.join(",\n")}\n` +
        `on conflict (destination, name) where created_by is null\n` +
        `do update set content_slug = excluded.content_slug;`
    )
    .join("\n\n");

  fs.writeFileSync(
    outPath,
    `-- Generated from ${inPath} by scripts/csv-to-seed-sql.mjs -- do not edit directly.\n-- ${rows.length} rows in ${batches.length} batch(es) of up to ${batchSize}.\n\n${sql}\n`
  );
  console.error(`Wrote ${rows.length} rows (${batches.length} batches) to ${outPath}`);
}

main();
