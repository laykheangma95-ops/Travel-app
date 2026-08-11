// ─────────────────────────────────────────────────────────────────────────────
// Turns GoHub's dealer price list into data/gohubCatalog.ts.
//
//   node scripts/build-gohub-catalog.mjs ~/Downloads/GOHUB_PRICE_US_SILVER1.xlsx
//
// WHY THIS IS A SCRIPT AND NOT A ONE-OFF PASTE:
//   GoHub reissue this sheet whenever costs move. If the catalog were typed in
//   by hand, every reissue would be an afternoon of transcription and a fresh
//   chance to fumble a SKU — and a wrong SKU is an order that fails after the
//   customer has paid. Re-running this is a diff you can read.
//
// WHAT IT DECIDES:
//   The sheet has ~3,900 SKUs. A customer must never see 3,900 options, so this
//   picks THREE per destination — see TIER_TARGETS — and prices them. The
//   selection and the pricing rules are the two things worth arguing about;
//   both are at the top of the file so they can be argued about.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Pricing ──────────────────────────────────────────────────────────────────

/**
 * Retail = dealer cost × this, then rounded up to a charm price.
 *
 * 2.8 lands around a 64% gross margin, which is what leaves room for WELCOME10,
 * the 5% affiliate referral and the payment fee while still undercutting Airalo
 * and Holafly on the routes Cambodian travellers actually fly.
 *
 * Change this one number to reprice the entire catalog.
 */
const MARKUP = 2.8;

/**
 * Per-tier multiplier, applied instead of the flat MARKUP.
 *
 * This is the marketing psychology, and it is the only place it lives. A
 * traveller does not compare $7.99 to $13.99 — they divide by the number of
 * days and compare THAT. So the bigger pack has to show a real per-day saving,
 * which means deliberately taking less margin on it:
 *
 *   basic    3.00x — the entry price. Highest margin, smallest basket.
 *   standard 2.80x — the one we want them to buy.
 *   premium  2.45x — visibly the best value per day, which is what makes
 *                    standard look reasonable rather than expensive.
 *
 * Net effect on a typical destination: $1.33/day → $1.14/day → $0.93/day.
 * The average across the catalog still lands near the 2.8x target.
 */
const TIER_MARKUP = { basic: 3.0, standard: 2.8, premium: 2.45 };

/** Below this the payment fee eats the margin, so nothing is priced under it. */
const PRICE_FLOOR_USD = 2.99;

/**
 * Charm pricing. Always rounds UP, never down — rounding down quietly donates
 * margin, and .99 reads as materially cheaper than the round number above it.
 *
 * Under $20 every dollar is a visible step, so we round to the next .99. Above
 * $20 the customer stops reading single dollars, so we step in fives: $29.99
 * reads better than $31.99 and costs us almost nothing.
 */
function charmPrice(raw) {
  const price = raw < 20 ? Math.ceil(raw) - 0.01 : Math.round(raw / 5) * 5 - 0.01;
  return Math.max(price, PRICE_FLOOR_USD);
}

/**
 * Which three plans a destination shows.
 *
 * Three, not five: a third option lifts conversion by giving the middle one
 * something to be the middle OF, but a fourth mostly produces hesitation.
 *
 *   basic    — the entry anchor. Cheap enough that the page never looks
 *              expensive at a glance.
 *   standard — a full week, marked popular. Priced so its cost-per-day beats
 *              basic, which is the comparison a traveller actually makes.
 *   premium  — twice the trip and more data per day. Its real job is to make
 *              standard look like the sensible choice.
 */
const TIER_TARGETS = [
  { tier: 'basic', name: 'Basic', targetDays: 3, popular: false },
  { tier: 'standard', name: 'Standard', targetDays: 7, popular: true },
  { tier: 'premium', name: 'Premium', targetDays: 15, popular: false },
];

/**
 * A fixed-data plan is preferred over the daily one at the same duration only
 * when it is at least this much cheaper.
 *
 * Daily data is the better product — it cannot be exhausted on day one — so it
 * stays the default. But GoHub price some countries' daily plans absurdly:
 * India is $14.20 wholesale for 7 days at 1GB/day, where 3GB fixed over the
 * same week is $6.05. Selling the daily plan there would put a $39.99 price on
 * a page where the market charges $8, and nobody would buy either.
 */
const FIXED_DATA_PREFERENCE = 1.5;

/** A fixed plan thinner than this per day is not a usable travel plan at all. */
const MIN_EFFECTIVE_GB_PER_DAY = 0.4;

// ── Which GoHub regions become which destination ─────────────────────────────

/**
 * destination slug → the `Country / Region` values in the sheet that serve it.
 *
 * Several of our destinations are served by a regional SKU rather than one of
 * their own — France, the UK and Germany all run on GoHub's Europe product, and
 * Canada on the USA/Mexico/Canada one. That is normal for a wholesaler and is
 * exactly why our plan ids are ours and their SKUs live in a map.
 */
const DESTINATION_SOURCES = {
  cambodia: ['Cambodia'],
  thailand: ['Thailand'],
  vietnam: ['Vietnam'],
  laos: ['Laos'],
  malaysia: ['Malaysia'],
  singapore: ['Singapore'],
  indonesia: ['Indonesia'],
  philippines: ['Philippines', 'PHL'],
  japan: ['Japan'],
  'south-korea': ['South Korea'],
  china: ['China'],
  'hong-kong': ['Hong Kong'],
  macao: ['Macao', 'MAC'],
  taiwan: ['Taiwan'],
  india: ['India'],
  turkey: ['Turkey'],
  usa: ['United States of America'],
  canada: ['United States of America, Mexico, Canada'],
  australia: ['Australia, New Zealand'],
  france: ['Europe'],
  'united-kingdom': ['Europe'],
  germany: ['Europe'],
  uae: ['UAE'],
  // Regional bundles, sold as destinations in their own right.
  'southeast-asia': ['Southeast Asia', 'SEA'],
  europe: ['Europe'],
  'singapore-malaysia-indonesia': ['Singapore, Malaysia, Indonesia'],
  'hong-kong-macao': ['Hong Kong, Macao'],
  'china-hong-kong-macao': ['China, Hong Kong, Macao', 'China-HK-Macao'],
  'usa-mexico-canada': ['United States of America, Mexico, Canada'],
};

// ── Reading the sheet ────────────────────────────────────────────────────────

/** openpyxl via a short inline script — no new npm dependency for a build tool. */
function readSheet(xlsxPath) {
  const python = `
import openpyxl, json, sys, warnings
warnings.filterwarnings('ignore')
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wb['PRODUCT_DATA']
hdr = [str(c.value) for c in ws[3]]
out = []
for r in ws.iter_rows(min_row=4, values_only=True):
    if r[0] is None or not str(r[0]).strip():
        continue
    out.append(dict(zip(hdr, [None if c is None else str(c) for c in r])))
json.dump(out, sys.stdout)
`;
  const stdout = execFileSync('python3', ['-c', python, xlsxPath], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

/** SKUs starting with C are physical SIM cards. We sell eSIMs only. */
function isEsim(row) {
  const sku = (row.SKU ?? '').trim();
  return sku.length > 0 && !sku.startsWith('C');
}

function toGb(value) {
  const text = String(value ?? '').trim().toUpperCase();
  let match = /^([\d.]+)\s*GB$/.exec(text);
  if (match) return Number.parseFloat(match[1]);
  match = /^([\d.]+)\s*MB$/.exec(text);
  if (match) return Number.parseFloat(match[1]) / 1000;
  return null;
}

function toDays(value) {
  const days = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(days) ? Math.round(days) : null;
}

// ── Selection ────────────────────────────────────────────────────────────────

/**
 * Every sellable plan, flattened to a comparable shape.
 *
 * The same plan often appears under several SKUs — the sheet carries a direct
 * and a reseller line for many countries — so the cheapest wins. There is no
 * reason to buy the dearer one.
 */
function collectPlans(rows) {
  const plans = new Map();

  for (const row of rows) {
    const planType = row['Plan Type'];
    const isDaily = planType === 'Daily data';
    const isFixed = planType === 'Fixed data';
    if (!isDaily && !isFixed) continue; // UNL* tiers need a type change to sell

    const amount = toGb(row.Data);
    const days = toDays(row['Validity (Days)']);
    const cost = Number.parseFloat(row.SILVER);
    if (amount === null || days === null || days < 1 || !Number.isFinite(cost) || cost <= 0) continue;

    // Under 1GB/day throttles inside an afternoon of maps and messaging.
    if (isDaily && amount < 1) continue;

    const effectiveGbPerDay = isDaily ? amount : amount / days;
    if (effectiveGbPerDay < MIN_EFFECTIVE_GB_PER_DAY) continue;

    const key = `${isDaily ? 'D' : 'F'}:${amount}:${days}`;
    const existing = plans.get(key);
    if (existing && existing.cost <= cost) continue;

    plans.set(key, {
      dataType: isDaily ? 'daily' : 'fixed',
      days,
      cost,
      sku: row.SKU.trim(),
      dataGbDaily: isDaily ? amount : Number(effectiveGbPerDay.toFixed(2)),
      dataGbTotal: isDaily ? Number((amount * days).toFixed(2)) : amount,
      effectiveGbPerDay,
    });
  }

  return [...plans.values()];
}

/** Day counts actually on offer, nearest to the target first. */
function nearestDays(plans, target) {
  return [...new Set(plans.map((p) => p.days))].sort(
    (a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b
  );
}

/**
 * The daily allowance a destination is built around: the smallest one that is
 * offered across most of the durations we sell. Smallest, because the entry
 * price is what a destination gets judged on at a glance.
 */
function coreAllowance(plans) {
  const daily = plans.filter((p) => p.dataType === 'daily');
  if (daily.length === 0) return null;

  const score = new Map();
  for (const allowance of new Set(daily.map((p) => p.dataGbDaily))) {
    const days = daily.filter((p) => p.dataGbDaily === allowance).map((p) => p.days);
    const covered = TIER_TARGETS.reduce((total, target) => {
      const nearest = days.sort((a, b) => Math.abs(a - target.targetDays) - Math.abs(b - target.targetDays))[0];
      return total + (nearest === undefined ? 0 : 1 / (1 + Math.abs(nearest - target.targetDays)));
    }, 0);
    score.set(allowance, covered);
  }

  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/**
 * Builds a ladder from ONE data type.
 *
 * A destination's three tiers must be comparable. "1GB/day" next to "3GB total"
 * next to "1GB/day" is not a ladder a customer can read — they cannot tell
 * which is better without doing arithmetic, and a customer doing arithmetic is
 * a customer not buying. So each destination commits to one shape.
 */
function ladderFor(plans, dataType, core) {
  const pool = plans.filter((p) => p.dataType === dataType);
  if (pool.length === 0) return null;

  const chosen = [];
  const usedSkus = new Set();

  for (const target of TIER_TARGETS) {
    let picked = null;

    for (const days of nearestDays(pool, target.targetDays)) {
      const atDay = pool
        .filter((p) => p.days === days && !usedSkus.has(p.sku))
        // Daily: hold the allowance steady so only the trip length changes.
        // Fixed: cheapest first, but never less data than the tier below.
        .filter((p) => (dataType === 'daily' ? p.dataGbDaily === core : true))
        .filter((p) => chosen.length === 0 || p.dataGbTotal >= chosen[chosen.length - 1].dataGbTotal)
        .sort((a, b) => a.cost - b.cost);

      if (atDay.length > 0) {
        picked = atDay[0];
        break;
      }
    }

    // Fall back to any allowance rather than lose the destination.
    if (!picked) {
      picked = pool
        .filter((p) => !usedSkus.has(p.sku))
        .sort(
          (a, b) =>
            Math.abs(a.days - target.targetDays) - Math.abs(b.days - target.targetDays) ||
            a.cost - b.cost
        )[0];
    }
    if (!picked) return null;

    usedSkus.add(picked.sku);
    chosen.push(picked);
  }

  chosen.sort((a, b) => a.days - b.days || a.cost - b.cost);
  return chosen;
}

function priceLadder(slug, ladder) {
  const tiers = ['basic', 'standard', 'premium'];

  const priced = ladder.map((plan, i) => ({
    slug,
    tier: tiers[i],
    popular: tiers[i] === 'standard',
    durationDays: plan.days,
    dataType: plan.dataType,
    dataGbDaily: plan.dataGbDaily,
    dataGbTotal: plan.dataGbTotal,
    costUsd: Number(plan.cost.toFixed(2)),
    priceUsd: charmPrice(plan.cost * TIER_MARKUP[tiers[i]]),
    sku: plan.sku,
  }));

  // Two tiers can land on the same charm price when the wholesale costs are
  // close. Nudge the upper one rather than dropping the destination.
  for (let i = 1; i < priced.length; i += 1) {
    if (priced[i].priceUsd > priced[i - 1].priceUsd) continue;
    const step = priced[i - 1].priceUsd < 20 ? 1 : 5;
    priced[i].priceUsd = Number((priced[i - 1].priceUsd + step).toFixed(2));
  }

  return priced;
}

function selectPlans(slug, rows) {
  const plans = collectPlans(rows);
  if (plans.length === 0) return null;

  const core = coreAllowance(plans);

  const daily = core === null ? null : ladderFor(plans, 'daily', core);
  const fixed = ladderFor(plans, 'fixed', core);

  const total = (ladder) => (ladder ? ladder.reduce((sum, p) => sum + p.cost, 0) : Infinity);

  // Daily data is the better product — it cannot be exhausted on day one — so
  // it wins unless GoHub have priced it out of the market for this country.
  // India is the case that forces this: $14.20 wholesale for 7 days at 1GB/day
  // against $6.05 for 3GB over the same week.
  const useFixed = fixed && total(daily) > total(fixed) * FIXED_DATA_PREFERENCE;
  const ladder = useFixed ? fixed : (daily ?? fixed);

  if (!ladder || ladder.length < TIER_TARGETS.length) return null;
  if (new Set(ladder.map((p) => p.sku)).size < TIER_TARGETS.length) return null;

  return priceLadder(slug, ladder);
}

// ── Emit ─────────────────────────────────────────────────────────────────────

function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('usage: node scripts/build-gohub-catalog.mjs <price-list.xlsx>');
    process.exit(1);
  }

  const rows = readSheet(xlsxPath).filter(isEsim);
  const byRegion = new Map();
  for (const row of rows) {
    const key = (row['Country / Region'] ?? '').trim();
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key).push(row);
  }

  const catalog = [];
  const skipped = [];

  for (const [slug, sources] of Object.entries(DESTINATION_SOURCES)) {
    const sourceRows = sources.flatMap((source) => byRegion.get(source) ?? []);
    if (sourceRows.length === 0) {
      skipped.push(`${slug}: no rows for ${sources.join(', ')}`);
      continue;
    }
    const plans = selectPlans(slug, sourceRows);
    if (!plans) {
      skipped.push(`${slug}: not enough daily-data plans at 1GB/day or more`);
      continue;
    }
    catalog.push(...plans);
  }

  const generated = catalog
    .map(
      (p) => `  {
    id: '${p.slug}-${p.tier}',
    countrySlug: '${p.slug}',
    tier: '${p.tier}',
    durationDays: ${p.durationDays},
    dataType: '${p.dataType}',
    dataGbDaily: ${p.dataGbDaily},
    dataGbTotal: ${p.dataGbTotal},
    priceUsd: ${p.priceUsd.toFixed(2)},
    costUsd: ${p.costUsd.toFixed(2)},
    gohubSku: '${p.sku}',
    popular: ${p.popular},
  },`
    )
    .join('\n');

  const file = `// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not edit by hand.
//
//   node scripts/build-gohub-catalog.mjs <GOHUB_PRICE_US_SILVER*.xlsx>
//
// Source: GoHub dealer price list, SILVER tier. Regenerate when they reissue it
// and read the diff: a changed \`costUsd\` with an unchanged \`priceUsd\` is a
// margin moving under you.
//
// \`gohubSku\` is what we send as \`itemCode\` when placing the order. \`costUsd\`
// is our dealer cost and must never reach the browser — it exists so pricing
// can refuse to sell below it.
//
// Retail = cost × ${MARKUP}, rounded up to a charm price. ${catalog.length} plans across
// ${new Set(catalog.map((p) => p.slug)).size} destinations.
// ─────────────────────────────────────────────────────────────────────────────

export interface GohubCatalogPlan {
  id: string;
  countrySlug: string;
  tier: 'basic' | 'standard' | 'premium';
  durationDays: number;
  /** \`daily\` refills every day at midnight; \`fixed\` is one pot for the trip. */
  dataType: 'daily' | 'fixed';
  /** For a fixed plan this is the effective average, not a real daily cap. */
  dataGbDaily: number;
  dataGbTotal: number;
  /** What the customer pays, in USD. */
  priceUsd: number;
  /** What GoHub charges us. Server-side only — never render this. */
  costUsd: number;
  /** GoHub's \`itemCode\`. A wrong value here is an order that fails after payment. */
  gohubSku: string;
  popular: boolean;
}

export const GOHUB_MARKUP = ${MARKUP};

export const gohubCatalog: GohubCatalogPlan[] = [
${generated}
];
`;

  writeFileSync(join(repoRoot, 'data/gohubCatalog.ts'), file);

  const destinations = new Set(catalog.map((p) => p.slug));
  console.log(`✔ data/gohubCatalog.ts — ${catalog.length} plans, ${destinations.size} destinations`);

  const margins = catalog.map((p) => 1 - p.costUsd / p.priceUsd);
  const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
  console.log(`  gross margin: avg ${(avg * 100).toFixed(1)}%, min ${(Math.min(...margins) * 100).toFixed(1)}%`);

  if (skipped.length > 0) {
    console.log(`\n  skipped ${skipped.length}:`);
    for (const reason of skipped) console.log(`    · ${reason}`);
  }
}

main();
