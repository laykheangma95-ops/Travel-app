/**
 * @domner/core — shared by apps/web, apps/ops and apps/worker.
 *
 * This barrel exports only what is safe to pull into any of the three apps.
 * Secret-touching modules (`crypto`, `db`, `rate-limit`, `notify`) are NOT
 * re-exported here: import them by subpath (`@domner/core/db`) so that a
 * client component can never reach them through a convenience barrel.
 */

export * from './money.js';
