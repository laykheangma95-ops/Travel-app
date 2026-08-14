#!/usr/bin/env node
// Converts a destination_places CSV (destination,name,category,lat,lng,
// description,photo_url,source) into a batched SQL insert file, so large
// files (e.g. an OSM pull) don't produce one unreadable multi-thousand-row
// statement.
//
//   node scripts/csv-to-seed-sql.mjs <in.csv> <out.sql> [batchSize=500]

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

async function main() {
  const [, , inPath, outPath, batchArg] = process.argv;
  if (!inPath || !outPath) {
    console.error("Usage: node scripts/csv-to-seed-sql.mjs <in.csv> <out.sql> [batchSize=500]");
    process.exit(1);
  }
  const batchSize = Number(batchArg) || 500;

  const fs = await import("node:fs");
  const lines = fs.readFileSync(inPath, "utf8").trim().split("\n");
  lines.shift(); // header

  const rows = lines.map((line) => {
    const [destination, name, category, lat, lng, description, photo_url, source] =
      parseCsvLine(line);
    return `  (${sqlString(destination)}, ${sqlString(name)}, ${sqlString(category)}, ${lat}, ${lng}, ${sqlString(
      description
    )}, ${sqlString(photo_url)}, ${sqlString(source)})`;
  });

  const batches = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }

  const sql = batches
    .map(
      (batch) =>
        `insert into public.destination_places\n  (destination, name, category, lat, lng, description, photo_url, source)\nvalues\n${batch.join(
          ",\n"
        )};`
    )
    .join("\n\n");

  fs.writeFileSync(
    outPath,
    `-- Generated from ${inPath} by scripts/csv-to-seed-sql.mjs -- do not edit directly.\n-- ${rows.length} rows in ${batches.length} batch(es) of up to ${batchSize}.\n\n${sql}\n`
  );
  console.error(`Wrote ${rows.length} rows (${batches.length} batches) to ${outPath}`);
}

main();
