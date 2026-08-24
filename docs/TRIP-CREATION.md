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
4. **The trip as one continuous object.** Creating a trip should immediately
   seed a day grid from the dates, pull any saved places for that destination
   into Ideas, and surface the readiness gap (flight · stay · eSIM) as the next
   action — so inspiration, saving, planning and buying are one thread, not four
   screens.
5. **A create screen that cannot lie again.** The class of bug above —
   a successful write reported as a failure — deserves a standing rule, not a
   one-off patch: *no write path may derive its success from a subsequent read.*
   Worth asserting in the test suite for refunds and orders too.
