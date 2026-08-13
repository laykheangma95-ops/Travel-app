# Trip Itinerary Planner — gap report and build plan

**Status: Gap 0 shipped. Gaps 1–5 not started.** This began as the §6 "report
first" step for the trip itinerary planner described in `STRATEGY.md:59, 84,
126`, and the owner approved §7 — build Gap 0 alone.

Gaps 1–5 remain untouched, and decisions A–D in §5 are still open.

The reference product is Triply, which is itself a Western repackaging of a
pattern mature in China since ~2015 — Qyer's 行程助手, Mafengwo, Ctrip's trip
assistant. §6 of this document explains what that pattern actually is and which
parts are worth copying.

---

## 1. The headline finding

**`trip_plans` is read-only. Nothing in this codebase can create a trip.**

```
$ grep -rn "trip_plans" --include=*.ts --include=*.tsx .
lib/travel/context.ts:158     .from('trip_plans')      ← the only query. A SELECT.
```

Everything else is a comment mentioning the table.

So today:

- `app/trips/page.tsx` → `TripsView` renders trips. Correctly. From real rows.
- `TripWorkspace` renders one trip across six sections. Correctly.
- `lib/travel/state.ts` decides which trip Home is about. Correctly.
- The notification catalogue deep-links into `#itinerary` and `#places`.
- **And no traveler can produce a row for any of it to render.**

The "New trip" button at `components/travel/TripsView.tsx:89` links to
`/checklist`, which is a packing checklist — not a trip creator. The only way a
`trip_plans` row exists today is if someone inserts it by hand in the Supabase
dashboard.

This reframes the whole project. You are not building a trip planner from
nothing. You have already built roughly 1,300 lines of one, and it is missing
its front door.

---

## 2. What already exists — leave all of this alone

| Piece | Where | Verdict |
|---|---|---|
| Trip table | `supabase/schema.sql:183` | **Already correct.** Has `destination`, `start_date`/`end_date`, `travelers`, `budget`, `interests[]`, `generated_itinerary JSONB`, `is_public`, `share_token`. That is the Triply trip object, already designed. |
| RLS on trips | `supabase/schema.sql:526-529` | **Already correct.** Own-rows policy plus a public-read policy for shared trips. No change needed. |
| Checklist + memories | `schema.sql:200, 212` | Pre-trip and post-trip halves, both wired |
| Trip workspace UI | `components/travel/TripWorkspace.tsx` (372 lines) | Section anchors `#stay #places #itinerary #weather` that push notifications already target |
| Trip list UI | `TripsView.tsx`, `TripCard`, `TripProgress` | Groups by now/upcoming/past, guest state, empty state, km+en |
| Travel state machine | `lib/travel/state.ts` (263) | 8 states, 5-step readiness including `places` and `itinerary` |
| Context loader | `lib/travel/context.ts` (221) | Reads through the caller's session client, RLS-scoped. Well built. |
| Read APIs | `app/api/travel/trips`, `app/api/travel/state` | Rate-limited, guest-safe |
| Curated places | `content/destinations/*.ts` | 3–5 hand-written places for 8 cities, typed `Place` at `content/schema.ts:96` |
| Map stack | `components/flights/LiveMap.tsx` | Leaflet + OpenStreetMap/CARTO tiles, already in the bundle and already free |
| Bilingual UI | `lib/i18n.tsx` | km mirrors en everywhere |

**Nothing above needs rebuilding.** The plan below only adds.

---

## 3. The gaps, ranked

### Gap 0 — Trip create/edit/delete · **SHIPPED**

`POST /api/travel/trips`, `PATCH` and `DELETE` on
`app/api/travel/trips/[tripId]`, a create screen at `/trips/new`, an edit screen
at `/trips/[tripId]/edit`, and the "New trip" button pointed at the former
instead of the packing checklist.

- No schema change and no migration — `interests` and every other column already
  existed. RLS (`trips_all_own`) was already correct and is what confines a
  traveler to their own rows; neither route re-implements that check.
- Validation lives in `lib/travel/trips.ts` and is run twice — inline by the
  form in the traveler's language, and again by the routes — from one module, so
  the two cannot drift. 20 tests cover it.
- Nothing in `docs/LOCKED.md` and nothing in checkout was touched.

Gates: `npm run typecheck` clean, `npm run build` passes, 342 tests pass.

### Gap 1 — A places layer · **needs a decision before it can start**

There is no `places` table, and the curated `Place` type has no coordinates:

```ts
// content/schema.ts:96
export interface Place {
  kind: 'landmark' | 'hidden-gem' | 'popular-with-cambodians';
  name: Bi; why: Bi; area: Bi;
  bestTime?: Bi; roughCostUsd?: number; mapUrl?: string;
  // no lat. no lon. no photo. no rating.
}
```

Without lat/lon you cannot sort a day geographically, cannot draw a map, cannot
compute a walking time. Every remaining gap depends on this one. **See decision
A in §5 — this cannot start until you pick a source of place data.**

### Gap 2 — The route optimiser · **highest value per unit of effort**

Day-bucket the saved places, then geographically sort within each day. This is
Triply's "Smart Routes" and Qyer's 行程助手, and it is pure computation — no
external API, no per-call cost, no vendor. It writes into
`generated_itinerary.days[]`.

Depends on Gap 1 for coordinates. Nothing else.

### Gap 3 — AI itinerary generation

Fill `generated_itinerary` from destination + dates + `interests[]`. The columns
it needs already exist and are already read by `deriveReadiness`
(`context.ts:117`). `lib/domnerBrain.ts` exists. This is a prompt plus a JSON
schema plus a write — not new infrastructure.

### Gap 4 — Map view

Reuse the Leaflet setup from `LiveMap.tsx`. Filter by category, browse by
country. Cheap once Gap 1 exists.

### Gap 5 — Import from TikTok / Instagram

Triply's headline feature and the one its users care most about. Also the most
effort and the only one with real legal exposure: **neither platform's terms of
service permit scraping video content.** Sequence it last, and only after
decision D.

---

## 4. Proposed `generated_itinerary` shape

The column is `JSONB` and currently free-form. `deriveReadiness` already probes
for `.stay`, `.places`, `.hotel`, `.accommodation`. Fixing the shape now, before
anything writes to it, avoids a migration later:

```jsonc
{
  "version": 1,
  "days": [
    {
      "date": "2026-09-14",
      "items": [
        { "placeId": "uuid", "startMin": 540, "durationMin": 90,
          "travelToNextMin": 12, "travelMode": "walk" }
      ]
    }
  ],
  "places": [ /* place ids saved to the trip but not yet scheduled */ ],
  "stay": null                    // stays null until a bookings table exists
}
```

`stay` stays `null` deliberately. `TripWorkspace` is explicitly written to
report an honest gap rather than render a plausible hotel that was never
booked, and that behaviour should survive.

---

## 5. Decisions I need from you

None of these can be guessed. Work stops at Gap 1 until A is answered.

**A · Where do place coordinates and photos come from?**

| Option | Cost | Trade-off |
|---|---|---|
| Google Places | Per call, photos priciest; caching restricted by their terms | Best data, real money, licence constraints |
| OpenStreetMap / Overpass | Free | Good coordinates, thin photos and ratings — but you already run OSM tiles in `LiveMap.tsx` |
| Curated only | Free | You control quality; 3–5 places × 8 cities is too thin to plan a day with |

My recommendation: **OSM for coordinates plus your existing curated places for
the editorial voice**, adding Google only where it visibly pays. It keeps the
free-hook economics in `STRATEGY.md:84` actually free, and it is the option that
doesn't need a spending decision before Gap 1 can start.

**B · Does this jump the queue in `CLAUDE.md §5`?**

The build order runs Steps 1–8 and then says "→ LAUNCH HERE". The itinerary
planner is in `STRATEGY.md` but carries no step number. Building it now means
going around your own sequence — and a `places` table created before Step 2
(Audit log + RLS) will need RLS retrofitted onto it afterwards.

Note that **Gap 0 is exempt from this concern**: it adds no table, and
`trip_plans` already has correct RLS.

**C · Free hook, or Pro tier?**

`STRATEGY.md:84` lists the planner as free, funnelling into bookings — the
Ctrip/Fliggy model. Triply instead charges a subscription. These lead to
different products; the free-hook version can afford thinner place data because
it is not the thing being sold.

**D · Video import — how is the video obtained?**

Answer before Gap 5 is scoped, not during.

---

## 6. Where this pattern comes from

Triply is a repackaging of a Chinese product category. The originals, and what
is worth taking from each:

| App | What it does | Worth copying |
|---|---|---|
| 穷游 Qyer — 行程助手 | Drop POIs into a trip; it buckets them into days and geo-sorts each day; exports offline | The optimiser. This *is* "Smart Routes". → Gap 2 |
| 马蜂窝 Mafengwo | Travel notes (游记/攻略) with one-tap "add every spot in this post" | Import-from-content. Triply does it with AI on video. → Gap 5 |
| 小红书 Xiaohongshu | Not a planner — but it is where discovery actually happens | The insight, not the product: people hoard screenshots because nothing catches them |
| 携程 Ctrip · 飞猪 Fliggy | The itinerary is a wrapper; bookings attach to days | **Your model.** Plan is free, money hangs off it → decision C |
| 高德地图 Amap | Best-in-class routing plus saved places, offline | The quality bar for Gap 2 |
| 面包旅行 Breadtrip | Plan before, journal after, one trip object | You already do this — `trip_memories` |

The five traits they share:

1. Inspiration is a **feed you save from**, not a search box you type into
2. **One-tap import** from outside content
3. A **POI database** with coordinates, photos, ratings
4. A **route optimiser** so you aren't crisscrossing the city
5. **Works offline** — which for Domner is not a nice-to-have. Your travelers
   are abroad, and `docs/LOCKED.md` already treats "works with no cellular" as
   an invariant.

Triply's only genuine advance over Qyer's 2015 trip assistant is doing step 2
with AI on video rather than humans on text.

---

## 7. What I recommend

**Ship Gap 0 alone, as one commit, and nothing else yet.**

It is the smallest change that reaches a working product, it needs no schema
migration, it touches no locked file and no payment code, and it does not
require answering decisions A, B, C or D first. It converts UI you have already
built and already paid for into something a traveler can use.

Then decide A and B with a real planner in front of you, rather than in the
abstract.

Say the word and I will report on Gap 0 specifically — files, diff shape, blast
radius — before writing any of it.
