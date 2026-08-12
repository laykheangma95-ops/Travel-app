/**
 * Fulfilment orchestrator — SPENDS REAL MONEY.
 *
 * PLACEHOLDER — Phase 2 relocates `_staging/src/lib/orders/fulfill.ts` here
 * verbatim, fixing imports only.
 *
 * The reviewed implementation carries three deliberately redundant guards
 * against double-charging, each covering a different failure mode:
 *
 *   1. a database claim lock          — two workers racing the same order
 *   2. salesCode persisted before confirm — crash between place and confirm
 *   3. GoHub 409/430 treated as success   — our record lost, GoHub's kept
 *
 * It looks over-engineered. It is not. Do not simplify it during relocation.
 */

export {};
