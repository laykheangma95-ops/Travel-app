# Verification — what "done" is allowed to mean

This document exists because of a specific, repeated failure, and it describes
the fix. Read it before reporting any task complete.

## The failure it fixes

Across three features, completion was reported at "above 90%" per task while
`npm run verify` stayed green. An audit then found that a whole user journey had
never been executed once. Nothing reported was false. The problem was subtler
and worse:

- **The score measured code shape, not working software.** "Typecheck passes,
  lint passes, 505 unit tests pass" is a real signal about internal
  consistency. It says nothing about whether a person can use the feature.
- **The mocks hid the failure by construction.** Every route test mocks
  `requireUser`. So no test ever asked what happens with no backend at
  all — which is the actual state of a fresh clone, a preview deploy with a
  missing variable, and the test process itself.
- **Two very different confidences were reported as one number.** "I read the
  code and it typechecks" and "I clicked it and watched it work" both came out
  as `100%`. Once flattened to a percentage they are indistinguishable, and the
  weaker one silently borrows the authority of the stronger.
- **The environment was never checked first.** Three features were built before
  anyone ran `env | grep -i supabase` and found nothing set.

## The rule

> **Report static and runtime confidence separately. Never blend them into one
> number. A step you did not execute is `unverified` — never a percentage.**

### Gate 1 — Static · `npm run verify`

`typecheck` + `lint` + `test`. Proves logic is self-consistent and typed. Does
**not** prove the app runs.

### Gate 2 — Runtime · `npm run verify:runtime`

Boots the real dev server, drives real Chromium, asserts on what a visitor
actually sees. Proves the pages render and the wiring holds. Covers only paths
reachable **without** a backend, and prints a `SKIP` line naming what it did not
cover.

**A `SKIP` is an unproven claim, not a passing one.** Never report a skipped
journey as working.

### Before either gate — `npm run env:check`

Prints what this machine can and cannot prove, in about a second. Run it
**before** planning work, not after being challenged. If it says authenticated
flows are unprovable, then every report from that session says so too, up front.

## Reporting format

| Claim | Gate | Evidence required |
|---|---|---|
| "Types are sound" | static | `npm run verify` output |
| "Logic is correct" | static | the specific test, ideally mutation-checked |
| "The page renders" | runtime | `npm run verify:runtime`, or a screenshot |
| "A traveler can do X" | runtime | the journey executed end to end |
| Anything not executed | — | **`unverified`, with the reason** |

**Understating coverage is the same failure, inverted.** A skip line that hides
real coverage misleads exactly as much as a pass that hides a gap. Say which
layer is proven and which is not, rather than writing off a whole journey. The
save-a-place flow is the worked example: its data layer is proven against real
Postgres with real policies in `tests/savedPlaces.rls.test.ts` (the wishlist
trip is created, the place lands in `day_index` 0 at `sort_order` 0, repeat
saves are idempotent, RLS scopes it to the traveler). What is unproven without
Supabase is narrower and specific — the auth handshake, and what the traveler
sees afterwards.

Two habits that keep this honest:

1. **No number without a falsifiable artifact** — an observed HTTP status,
   rendered text, a screenshot. Not a self-assigned score.
2. **Mutation-check security and invariant tests.** A test that passes with the
   guard deleted is worth less than no test, because it manufactures
   confidence. `tests/mapsLinkRoute.test.ts` and
   `tests/degradedEnvironment.test.ts` were both verified this way: the guard
   was removed, the suite was confirmed to fail, the guard was restored.

## Why `tests/degradedEnvironment.test.ts` exists

It pins the one property the mocked tests structurally cannot see:

> With no backend configured, a travel route must fail loudly and **must never
> return a success envelope**.

This is the same lesson `tests/authFallback.test.ts` learned the hard way, after
a missing `NEXT_PUBLIC_SUPABASE_ANON_KEY` made every auth call answer
`{ error: null, demo: true }` and a broken login present as a working one:

> **In production a missing key is an outage, never a discount.**

It also pins a deliberate ordering that reads like a bug until you know why:
`/api/travel/places/save` answers **503 before 401**, because `requireUser`
needs a Supabase client to validate a token, so availability must be checked
first. Telling a signed-out visitor to "sign in" would blame them for an outage
they cannot fix. `/api/travel/maps-link` answers **401 before its SSRF
allowlist**, which is also correct: an anonymous caller should never reach the
fetch path.

Both orderings are now covered, so neither can flip unnoticed.
