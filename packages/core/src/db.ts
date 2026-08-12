/**
 * SERVER ONLY — see the note in `crypto.ts` on why `server-only` is not
 * imported here (it throws under plain Node, and the worker is plain Node).
 *
 * Supabase clients and staff authorisation.
 *
 * PLACEHOLDER — Phase 2 relocates `_staging/src/lib/supabase.ts` here.
 *
 * Expected surface once relocated:
 *   adminDb()   service-role client; bypasses RLS, server-only
 *   userDb()    request-scoped client carrying the caller's JWT
 *   requireStaff(role)  gate on staff_users.is_active AND mfa_enrolled,
 *                       roles ordered viewer < support < ops < admin
 *
 * Staff authority lives in `staff_users`. No row means no power. Spending
 * supplier money requires `ops`.
 */

export {};
