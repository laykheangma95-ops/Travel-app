# DOMNER V1 — Session state

## Current phase
Phase 1 — Audit. **Complete, awaiting Ty's approval gate.**

## Last completed
Phase 1 audit written to `docs/domner-v1/AUDIT.md`. Read-only: no source file,
migration, schema or config was modified.

## Next action
Ty approves (or corrects) `AUDIT.md`, and answers the four open decisions below.
Only then does Phase 2 (`docs/domner-v1/MONETIZATION.md`) begin.

## Open decisions awaiting Ty

1. **The AI cost-tier premise.** There is no external AI in the product — the
   chatbot is a local deterministic engine costing $0 per message. §3.3 assumes
   token costs to tier. Does Phase 2 (a) plan the monetization matrix around
   *introducing* real LLM spend, or (b) place features on user value and the
   eSIM loop alone, treating AI cost as a future variable?
2. **Trip Pass has no product surface yet.** Itinerary generation, trip
   create/edit and saved places do not exist. Gating them in Phase 4 means
   building them first. Does the V1 scope include building those features, or
   does Trip Pass get placed against features that already ship?
3. **Guest buyers and Travel Mode.** `esim_orders.user_id` is nullable and guest
   checkout is supported. Should an eSIM bought without an account grant Travel
   Mode (keyed on email/order number), or is Travel Mode account-only?
4. **eSIM validity window.** Nothing records when an eSIM was activated or when
   it expires; GoHub sends `activationExpiryDate` and it is discarded. Travel
   Mode needs a window. Is capturing that in-scope for V1, and is a
   `duration_days`-from-`fulfilled_at` approximation acceptable in the interim?

Also inherited and still unresolved, from `CLAUDE.md` §12: money as
`DECIMAL(10,2)` vs integer minor units. This one lands on Phase 3 table design.

## Files touched this session
None modified.

Created (Phase 1 deliverables only):
- `docs/domner-v1/AUDIT.md`
- `docs/domner-v1/FINDINGS.md`
- `docs/domner-v1/STATE.md`

## Do not touch
- Everything in `docs/LOCKED.md`: `lib/auth.ts`, the `(auth)` route group,
  `lib/esimDelivery.ts`, the locked sections of `app/api/payments/*/route.ts`,
  and the `telegram_links` / `esim_deliveries` tables.
- `/esim/checkout` and the live purchase flow.
- `apps/*` and `packages/*` — Phase-1 shells, out of scope for this work.
- `lib/tier.ts` — device rendering tiers, unrelated to entitlements despite the
  name.
- Anything listed in `FINDINGS.md`: logged, deliberately not fixed.
