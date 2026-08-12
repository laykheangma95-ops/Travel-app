// ─────────────────────────────────────────────────────────────────────────────
// Catalog plan → supplier SKU mapping.
//
// WHY THIS EXISTS:
//   This file is what makes a supplier swap a routing change instead of a
//   migration. Our plan IDs (`thailand-standard`) are ours forever: they appear
//   in orders, emails, analytics and support tickets. A supplier's SKU
//   (`ARL-TH-7D-2GB`) is an implementation detail that lives only here.
//
//   Consequences worth stating plainly:
//     • A supplier that does not carry a destination is skipped automatically —
//       `supports()` reads this map, so partial coverage is normal, not an error.
//     • Adding a second supplier as backup for one country is a single line.
//     • Nothing a customer sees changes when the supplier behind a plan changes.
//
// HOW TO ADD A SUPPLIER:
//   1. Add its adapter under lib/providers/esim/
//   2. Add a column of SKUs here for the plans it can serve
//   3. Add it to ESIM_PROVIDER_ORDER
//   No other file needs to change.
//
// The map may also be supplied at runtime via the ESIM_SKU_MAP environment
// variable (JSON), so a SKU correction does not require a redeploy.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '@/lib/logger';
import { gohubCatalog } from '@/data/gohubCatalog';

/** providerId → (our planId → their SKU). */
export type SkuMap = Record<string, Record<string, string>>;

/**
 * Built-in mappings.
 *
 * `sandbox` deliberately maps every plan by echoing the plan id, so the sandbox
 * supplier can fulfil the entire catalog during testing. Real suppliers are
 * added here once their SKUs are known — the entries below are intentionally
 * empty rather than guessed, because a wrong SKU sells the wrong plan.
 */
const BUILT_IN: SkuMap = {
  // GoHub's mapping is not typed out here — it is derived from the same
  // generated catalog the prices come from, so a plan and its SKU can never
  // drift apart. Regenerating data/gohubCatalog.ts remaps the supplier too.
  gohub: Object.fromEntries(gohubCatalog.map((plan) => [plan.id, plan.gohubSku])),

  // Real suppliers: fill in when the contract is signed and SKUs are confirmed.
  // Leaving these empty means `supports()` is false and the registry skips them,
  // which is the correct behavior for an unconfigured supplier.
  airalo: {},
  esimgo: {},
  maya: {},
};

let runtimeMap: SkuMap | null = null;

/** Parses ESIM_SKU_MAP once, tolerating a malformed value rather than crashing. */
function loadRuntimeMap(): SkuMap {
  if (runtimeMap) return runtimeMap;

  const raw = process.env.ESIM_SKU_MAP?.trim();
  if (!raw) {
    runtimeMap = {};
    return runtimeMap;
  }

  try {
    const parsed = JSON.parse(raw) as SkuMap;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      runtimeMap = parsed;
      return runtimeMap;
    }
    log.warn('sku_map.invalid_shape');
  } catch (error) {
    // A broken env var must not take the site down; we fall back to built-ins
    // and the affected supplier simply reports no coverage.
    log.error('sku_map.parse_failed', { error });
  }

  runtimeMap = {};
  return runtimeMap;
}

/**
 * The SKU a supplier uses for one of our plans, or null when it cannot serve it.
 * Runtime configuration wins over the built-in table.
 */
export function skuFor(providerId: string, planId: string): string | null {
  const runtime = loadRuntimeMap()[providerId];
  if (runtime && typeof runtime[planId] === 'string' && runtime[planId]) {
    return runtime[planId];
  }

  const builtIn = BUILT_IN[providerId];
  if (builtIn && builtIn[planId]) return builtIn[planId];

  return null;
}

/** Every plan a supplier can currently serve. Used by the admin coverage view. */
export function coverageFor(providerId: string): string[] {
  return Array.from(
    new Set([
      ...Object.keys(loadRuntimeMap()[providerId] ?? {}),
      ...Object.keys(BUILT_IN[providerId] ?? {}),
    ])
  ).sort();
}

/** Test-only: drops the parsed runtime map so env changes take effect. */
export function __resetSkuMap(): void {
  runtimeMap = null;
}
