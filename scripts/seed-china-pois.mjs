#!/usr/bin/env node
// Pulls real points of interest for a city from OpenStreetMap's Overpass API
// and writes them into the destination_places CSV shape:
//   destination,name,category,lat,lng,description,photo_url,source
//
// Run locally (this box's outbound network is blocked for OSM/Overpass hosts):
//   node scripts/seed-china-pois.mjs "Guangzhou" out/guangzhou.csv
//   node scripts/seed-china-pois.mjs "Chongqing" out/chongqing.csv
//
// Then load either file with the SQL Editor / Table Editor exactly like
// supabase/seeds/destination_places.csv, or regenerate the .sql the same
// way scripts/csv-to-seed-sql.mjs does for the hand-written batch.
//
// Notes:
// - Real OSM coverage inside a single city is realistically low hundreds to
//   a few thousand well-tagged, named POIs -- not 100,000. This script pulls
//   everything Overpass has that matches the filters below and stops there;
//   it does not pad or invent rows to hit a target count.
// - Descriptions are generated from OSM tags (category + name + tag hints),
//   not hand-written. destination_places.source has CHECK (source IN
//   ('editorial', 'ai_generated')) in supabase/migrations/007_itinerary_planner.sql --
//   'osm' would violate that constraint on insert, so this writes
//   'ai_generated' instead. It is not actually AI-generated; it is the
//   closest allowed value to "not human-reviewed copy". Rows from this
//   script should still get a human skim before they reach production data,
//   since OSM tagging quality is uneven.
// - No API key needed; be a considerate citizen of the free public instance
//   (one query per city, no parallel hammering, timeout generous).

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CATEGORY_QUERIES = {
  spot: [
    'node["tourism"~"attraction|museum|viewpoint|artwork|gallery|zoo|theme_park"]',
    'node["historic"]',
    'node["leisure"~"park|garden"]',
  ],
  food: [
    'node["amenity"~"restaurant|cafe|bar|food_court|ice_cream"]',
  ],
  shopping: [
    'node["shop"~"mall|department_store|supermarket|clothes|gift|books"]',
    'node["amenity"="marketplace"]',
  ],
  transport: [
    'node["aeroway"="aerodrome"]',
    'node["railway"~"station|halt"]',
    'node["public_transport"="station"]',
  ],
};

function buildQuery(cityName) {
  const clauses = [];
  for (const [category, filters] of Object.entries(CATEGORY_QUERIES)) {
    for (const filter of filters) {
      clauses.push(`${filter}(area.city)->.n_${category}_${clauses.length};`);
    }
  }
  const all = Object.entries(CATEGORY_QUERIES)
    .flatMap(([category, filters]) => filters.map((f) => `${f}(area.city);`))
    .join("\n    ");
  return `
    [out:json][timeout:180];
    area["name"="${cityName}"]["boundary"="administrative"]->.city;
    (
    ${all}
    );
    out body;
  `;
}

function categorize(tags) {
  if (tags.aeroway === "aerodrome" || tags.railway || tags.public_transport === "station") {
    return "transport";
  }
  if (tags.shop || tags.amenity === "marketplace") return "shopping";
  if (
    tags.amenity &&
    ["restaurant", "cafe", "bar", "food_court", "ice_cream"].includes(tags.amenity)
  ) {
    return "food";
  }
  if (tags.tourism || tags.historic || tags.leisure) return "spot";
  return "other";
}

function describe(tags, category) {
  const bits = [];
  if (tags.tourism) bits.push(tags.tourism.replace(/_/g, " "));
  if (tags.historic) bits.push(`historic ${tags.historic.replace(/_/g, " ")}`);
  if (tags.leisure) bits.push(tags.leisure.replace(/_/g, " "));
  if (tags.amenity) bits.push(tags.amenity.replace(/_/g, " "));
  if (tags.shop) bits.push(`${tags.shop.replace(/_/g, " ")} shop`);
  if (tags.cuisine) bits.push(`${tags.cuisine.replace(/_/g, " ")} cuisine`);
  const kind = bits.length ? bits.join(", ") : category;
  const name = tags.name || "Unnamed place";
  return `${name} -- OpenStreetMap tag: ${kind}.`;
}

function csvField(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function fetchOverpass(query) {
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query,
      });
      if (!res.ok) throw new Error(`${endpoint} responded ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.error(`Overpass endpoint failed: ${err.message}, trying next...`);
    }
  }
  throw lastErr;
}

async function main() {
  const [, , cityArg, outPathArg] = process.argv;
  if (!cityArg || !outPathArg) {
    console.error('Usage: node scripts/seed-china-pois.mjs "<City Name>" <out.csv>');
    process.exit(1);
  }

  const query = buildQuery(cityArg);
  console.error(`Querying Overpass for "${cityArg}"...`);
  const data = await fetchOverpass(query);

  const seen = new Set();
  const rows = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    if (!tags.name) continue;
    const key = `${tags.name}|${el.lat.toFixed(5)}|${el.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const category = categorize(tags);
    rows.push({
      destination: cityArg,
      name: tags.name,
      category,
      lat: el.lat,
      lng: el.lon,
      description: describe(tags, category),
      photo_url: "",
      source: "ai_generated",
    });
  }

  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync(path.dirname(outPathArg), { recursive: true });

  const header = "destination,name,category,lat,lng,description,photo_url,source";
  const lines = rows.map((r) =>
    [r.destination, r.name, r.category, r.lat, r.lng, r.description, r.photo_url, r.source]
      .map(csvField)
      .join(",")
  );
  fs.writeFileSync(outPathArg, [header, ...lines].join("\n") + "\n");

  console.error(`Wrote ${rows.length} rows to ${outPathArg}`);
  if (rows.length < 100000) {
    console.error(
      `Note: ${rows.length} is real OSM coverage for "${cityArg}" under these filters -- ` +
        `not 100,000. That count doesn't exist for a single city as genuine, named places.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
