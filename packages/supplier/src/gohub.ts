/**
 * GoHub API client: retries, 409/430 handling, backoff.
 *
 * PLACEHOLDER — Phase 2 relocates `_staging/src/lib/gohub/client.ts` here.
 *
 * This package runs on the worker VM only. It holds the sole copy of the
 * GoHub credentials, because GoHub authorises by IP whitelist and Vercel has
 * no stable egress IP. If this module ever appears in a Vercel bundle, a
 * leaked environment variable becomes a spendable prepaid supplier balance.
 */

export {};
