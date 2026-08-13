# DOMNER V1 — Out-of-scope findings

Per §0.2: bugs and inconsistencies noticed during scoped work are logged here
and **not fixed**. Nothing in this file has been changed in the codebase.

| # | Found | Where | Severity | Note |
|---|---|---|---|---|
| 1 | `COSTS.md` describes the AI chat as "Claude via OpenRouter … already wired to Claude Haiku" with an `OPENROUTER_API_KEY`. No such key or call exists; `/api/chat` runs a local engine at $0. | `COSTS.md` §2 row 9, §3b | Medium — it misstates the cost model the founder plans against | Documentation only |
| 2 | `@anthropic-ai/sdk` (^0.110.0) is a production dependency imported by nothing. | `package.json` | Low | Dead dependency; adds install weight only |
| 3 | `lib/domnerBrain.ts` exports a Claude system prompt (`DOMNER_SYSTEM_PROMPT`) that nothing imports. Only `DOMNER_FACTS` is used. | `lib/domnerBrain.ts` | Low | Dead export; its doc comment describes a Claude integration that isn't wired |
| 4 | `trip_plans.generated_itinerary` is read in three places and written in none. There is no create/update/delete path for trips at all. | `lib/travel/context.ts`, `lib/travel/insights.ts`, `components/travel/TripWorkspace.tsx` | High as a **product gap**, not a bug | The trip workspace renders permanent empty states |
| 5 | GoHub's `activationExpiryDate` is parsed from the fulfil webhook and never persisted. | `lib/gohub/webhook.ts:135` | Medium | Blocks any eSIM validity window; see AUDIT §0.4 |
| 6 | Rate limiting is in-memory, so the effective limit is (limit × warm serverless instances). The file states this openly. | `lib/rateLimit.ts` | Known/accepted | Must **not** be used as the basis for a usage quota |
| 7 | `lib/tier.ts` uses the name `Tier` for a WebGL device-capability level. | `lib/tier.ts` | Low | Naming collision risk with entitlement tiers; do not reuse the name |
| 8 | `esim_orders.status` is a `TEXT CHECK` constraint, not a Postgres enum. | `supabase/schema.sql:96` | Low | Extending it requires DROP+ADD CONSTRAINT, which is not additive under §0.3 |
