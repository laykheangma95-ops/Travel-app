/**
 * SERVER ONLY. Never import from a `'use client'` component.
 *
 * This file deliberately does not `import 'server-only'`: that package throws
 * at import time under plain Node, and `apps/worker` is plain Node. The
 * boundary is enforced by the ESLint rule at the repo root instead. Next.js
 * route handlers in apps/web and apps/ops still carry the import themselves.
 *
 * AES-256-GCM envelope encryption, blind indexes, and log redaction.
 *
 * PLACEHOLDER — Phase 2 relocates the reviewed implementation from
 * `_staging/src/lib/crypto.ts` into this file. Nothing is implemented here on
 * purpose: eSIM credentials (ICCID, LPA, QR) are bearer credentials, and a
 * plausible-looking stand-in is worse than an empty module because it would
 * compile, run, and quietly protect nothing.
 *
 * Expected surface once relocated:
 *   encrypt(plaintext: string): string        AES-256-GCM, keyed from env
 *   decrypt(ciphertext: string): string
 *   blindIndex(value: string): string         deterministic, for lookups
 *   redact(value: unknown): unknown           safe for structured logs
 */

export {};
