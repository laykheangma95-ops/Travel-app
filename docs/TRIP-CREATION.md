# Trip creation — the failure, the fix, and where this goes next

## 1. What the traveler saw

The Create-trip screen (`/trips/new`), filled in correctly — Kuala Lumpur,
25–27 Aug 2026, one traveller, three interests — answered **"That trip could not
be found."** in red, above the Create button.

That sentence is not a validation message. It is a *404*, on a screen that has
not yet asked for anything by id.

## 2. What was actually happening

`POST /api/travel/trips` did two things in sequence:

1. **INSERT** the row into `trip_plans` through the caller's session client.
2. **Read it back** through `loadTravelerContext`, and find it in the returned
   list, so the response carries a trip shaped exactly like every other trip
   card — readiness included.

Step 1 was succeeding. Step 2 was what failed, and the helper it failed in
(`tripById`) answered a missing entry with `NOT_FOUND: That trip could not be
found.` The route then returned that error, and the form printed it.

**So the trip was being created every time, and the traveler was being told it
did not exist.** Pressing Create again wrote another row.

Three separate conditions could make step 2 miss a row that genuinely existed:

| # | Condition | Why it hit |
|---|---|---|
| A | **A column the live schema does not have** | The select named `is_wishlist` (added by migration 011) and `cover_image_url`. PostgREST rejects the *entire* statement for one unknown column, so the list came back empty. `scripts/supabase-check.mjs` records that this project reports "No migrations" — the live schema is dashboard-managed and can lag the repo. The error was swallowed as `log.warn` and degraded to "no trips". |
| B | **The 20-row cap** | The list was `.limit(20)`, ordered by `start_date`. A traveler with twenty trips could create the twenty-first and have the read-back look for it in a window it had fallen outside. Every failed attempt added a row, so repeated retries walked *into* this condition. |
| C | **The trips table unreachable** | Same code path, same `NOT_FOUND` — an outage reported as a missing trip. |

Condition A also blanked Home, the trips list, and every readiness bar for
everyone, all at once, without turning anything red.

## 3. What changed

Four things, each addressing a distinct part of the failure.

**A committed write is never reported as a failure.**
`tripAfterWrite` (`lib/travel/tripWrites.ts`) wraps the read-back. If the row is
in the database but cannot be read back for any reason, the response carries the
trip as it was just written — neutral readiness, no destination flag, correct id
— and the traveler lands on their trip page, which derives the rest properly.
The 201 is the truth about what happened; the read-back is an enrichment.

**A missing column costs a field, not the whole table.**
`selectTrips` (`lib/travel/context.ts`) tries the full column list, and on error
retries with the columns `trip_plans` has always had. A half-migrated database
now loses the cover image and the wishlist flag. It does not lose the trips.

**"Not in the list" is no longer treated as "does not exist".**
`loadTravelerContext(request, { ensureTripId })` fetches that one row by id when
the list does not contain it. The window itself went from 20 to 100.

**An outage says so.**
`TravelerContext.tripsUnavailable` is set when even the narrow select fails, and
`tripById` answers `SERVICE_UNAVAILABLE`, not `NOT_FOUND`. "We could not reach
your trips just now" is recoverable to a reader; "that trip does not exist" is
not.

Regression coverage: `tests/tripReadback.test.ts` — one test per condition
above, driving the real `POST` handler against a Supabase client that fails on
demand. `vitest.config.mts` now aliases `server-only`, which is why the context
loader had no direct test coverage before.

## 4. Confirm it against the live database

The fix makes all three conditions survivable, but the owner should still know
which one was live:

```bash
npm run supabase:check
```

`scripts/supabase-check.mjs` now probes `trip_plans` **with the exact column
list the code selects**, plus `itinerary_days`, `itinerary_places` and
`destination_places`. A `COLUMN MISSING` line against `trip_plans` means
migration 011 was never applied — apply the files in `supabase/migrations` in
filename order and the cover image and wishlist flag come back.

Also worth doing once: check `trip_plans` for duplicate rows with the same
title and dates. Every "could not be found" the traveler retried through left
one behind.

## 5. Where this feature should go — proposal, not built

None of the following is implemented. Each needs the owner's go-ahead per
CLAUDE.md §6, and each strengthens the one itinerary experience of rule 15
rather than adding a surface beside it.

1. **Offline-first creation.** A trip is the one object a traveler most often
   starts on a plane or in a taxi. Write the draft to IndexedDB on every
   keystroke, create against a client-generated UUID, and let the service worker
   replay the POST when the connection returns. The client-supplied id makes the
   write idempotent, which also removes the last duplicate risk: a retry after a
   timeout re-sends the same id instead of making a second trip.
2. **Intent-first entry.** Replace "Where are you going?" as the first question
   with one line of natural language — *"KL for the long weekend with my sister"*
   — parsed server-side into destination, dates, travellers and interests, with
   every field still shown and editable. The form stays exactly as it is
   underneath; the typing goes away for the common case.
3. **Dates that know something.** The date fields are currently two empty boxes.
   They could carry what Domner already knows: Khmer public holidays, the
   destination's monsoon window, the cheapest departure day in that month, and
   the eSIM plan length that matches the trip — turning a data-entry step into
   the first piece of advice the traveler gets.
4. ~~**The trip as one continuous object.**~~ **Built — see §6 below.**
5. **A create screen that cannot lie again.** The class of bug above —
   a successful write reported as a failure — deserves a standing rule, not a
   one-off patch: *no write path may derive its success from a subsequent read.*
   Worth asserting in the test suite for refunds and orders too.

## 6. One continuous trip object (built)

Creating a trip now does two things beyond writing the row. Both are in
`lib/travel/tripSeed.ts`, called from the create and edit routes.

### The day grid exists as soon as the dates do

`itinerary_days` rows used to appear only when the traveler pressed "Add day" or
ran the smart draft, so a trip that knew it ran 25–27 August still opened on an
empty chooser. `seedTripDays` writes day 0 (the private Ideas list) always, and
one dated day per day of the trip — capped at `MAX_SEEDED_DAYS` (30), which is a
seeding ceiling, not a limit on the trip.

It runs on edit too, which is what makes "no dates yet" a real answer rather
than a dead end: the grid comes into being the moment dates are saved. It is
idempotent by construction —

- a numbered day is inserted only where that index is missing, so an existing
  plan is never duplicated;
- existing days are **re-dated** when the trip moves. A day's date is derived
  from the start date and nothing else — no screen lets anyone set one by hand —
  so recomputing it corrects a stale stamp rather than overwriting a choice;
- days beyond a shortened trip are **left alone**. Nothing deletes a day
  somebody has planned on.

`tripDayCount` moved out of the generate route into `lib/travel/itinerary.ts`
and took a `cap` argument, because two callers want different ceilings for the
same number: the grid follows the trip, while the smart draft only ever drafts
its first week (`DRAFT_MAX_DAYS`).

### The wishlist trip is adopted, not duplicated

Saving a place before a trip exists auto-creates one with `is_wishlist = true`
(`lib/travel/savedPlaces.ts`). Someone who saved three places in Malaysia and
then filled in the New Trip form ended up with **two** Malaysia rows: the real
trip, and a wishlist trip holding every idea they had gathered. The ideas never
arrived — and the next save saw two matching trips and stopped to ask which one
was meant, an ambiguity created entirely by this gap.

A create that matches exactly one adoptable wishlist trip now **upgrades that
row** instead of inserting beside it. Nothing is copied and nothing is left
behind: the ideas are on the trip because it is the same trip.

Adoption is deliberately narrow, and returns "no" on any doubt. The row must

- belong to the caller — `trips_public_read` (schema.sql:527) means a SELECT can
  see *other people's* public trips, so the owner filter is load-bearing here,
  not a duplicate of the policy;
- be a wishlist trip — a real trip made earlier is never silently overwritten;
- have no dates — a wishlist trip that has since been given dates has been
  worked on;
- be the only match — two candidates is the ambiguity being removed, and
  picking one at random would be inventing an answer.

A database without migration 011 has no `is_wishlist` column; adoption is
skipped and the traveler gets a second trip, exactly as before. It is an
improvement on inserting, never a precondition for it.

### What was already right

**The readiness gap needed no work.** `TripWorkspace` already renders flight ·
stay · eSIM · places · itinerary as anchored sections, each either done or an
honest gap with a real action, above a `TripProgress` bar — and creating a trip
already lands there. Adoption does improve what it says: a trip that arrives
with ideas attached shows Places as done on its first render.

### The rule these follow

Seeding and adoption are enrichments of a write that has already committed, so
neither may fail the write. Every failure path logs and continues, and
`tests/tripSeed.test.ts` asserts the trip is still created when the itinerary
table is missing entirely. Same rule as `tripAfterWrite`: **no write path may
derive its success from a subsequent read.**
