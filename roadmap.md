# Roadmap — documented, not built

Everything here is **out of scope for the homepage v3 branch**. It is written
down because the homepage had to be architected not to block it, and because a
few decisions on that page were made specifically to make these cheap later.

The single most important thing to understand: **`content/schema.ts` is the
foundation for all of it.** It describes *facts about a place*, not *sections of
a page*. Nothing below needs the content layer re-modelled — only new surfaces
that read it.

---

## 1. Post-purchase trip dashboard

Countdown, weather, currency, packing, emergency contacts.

| Needs | Already exists |
| --- | --- |
| Live weather for the destination | `lib/live/weather.ts` + `/api/destination/[slug]/live` |
| Live rate against USD and KHR | `lib/live/rates.ts` |
| Local time, ticking, with no API | `geo.timezone` + `useLocalClock` |
| Emergency numbers, embassy | `entry.emergency` |
| Currency and payment norms | `basics.currency`, `around.money` |

**What is missing:** a trip record joining an order to a guide slug and a pair of
dates. That is a Supabase concern, not a content one.

**Decision made on the homepage that helps:** the live endpoint is keyed by guide
slug and cached server-side, so a dashboard polling it for a thousand travellers
costs the same upstream calls as the homepage does today.

---

## 2. A home screen that changes during travel

Morning greeting, remaining data, today's itinerary, live transit alerts.

The greeting logic is already time-aware and already separates *the visitor's*
local time from *the destination's* (`FirstScreen` versus `useLocalClock`) —
which is precisely the distinction this feature turns on: before you fly, the
greeting is about you; while you are travelling, it is about where you are.

**What is missing:** remaining-data requires supplier usage APIs, which none of
our providers expose consistently yet (see `lib/providers/esim/types.ts`). Do not
design a UI that assumes it until one does — showing a made-up "4.2GB left" would
be exactly the kind of fabrication the destination content is built to avoid.

**Blocker to watch:** `around.apps` and transit data are curated per city. A live
transit alert feed is a per-city integration, not a schema field. Model it as a
separate source that *references* the guide, rather than growing the guide.

---

## 3. Arrival moment

The phone buzzes on landing: "Welcome to Japan, your internet is ready", plus
platform, currency, weather, taxi estimate.

Every field in that notification already exists as curated content:

```
guide.city                     → "Welcome to Tokyo"
guide.around.fromAirport[0]    → platform + realistic cost + duration
guide.basics.currency          → currency, with a live rate from the live API
guide.entry.emergency          → the numbers, one tap away
```

**Decision made on the homepage that helps:** `fromAirport` stores
`durationMins`, `costLocal` *and* `costUsd` separately rather than one display
string, so a notification can say "about $16, 41 minutes" without parsing prose.

**What is missing:** flight-arrival detection. `lib/liveFlight.ts` and the
existing flight tracking already know when a flight lands; the join is
flight → order → guide slug.

---

## 4. Travel Readiness Score

A progress bar over passport, visa, eSIM, check-in, weather, currency, emergency
contacts.

**This is the feature the schema was most deliberately shaped for.**
`entry.requirements[]` is not prose — it is a list of independently trackable
items:

```ts
{
  id: 'visit-japan-web',          // stable key to store completion against
  title, detail,                  // bilingual, already written
  mandatory: boolean,             // required vs recommended weighting
  window: { opensDaysBefore: 14 } // when it becomes actionable
  url                             // where to go and do it
}
```

A readiness score is `completed / applicable` over that array plus a handful of
account-level facts. **No content change required.** Storing completion is one
table keyed by `(user, trip, requirement_id)`.

The `window` field is what makes the score *time-aware* rather than a static
checklist: with a departure date, "Visit Japan Web" is not yet applicable
fifteen days out, becomes actionable at fourteen, and is urgent at two.

**Do not** move requirement completion into the guide files. The guide describes
the world; completion describes a person.

---

## 5. Small delight moments

Boarding-pass animation, rain reminder, exchange-rate animation, activation
animation, trip countdown.

The motion vocabulary is already named and shared — `lib/motion.ts` exports the
easings and durations, and `app/v3.css` mirrors them as custom properties. Build
these from those tokens; a delight moment with its own improvised easing is the
thing that makes a set of animations read as cheap rather than expensive.

`.boarding-pass` / `.ticket-notch` in `globals.css` already exist from the
previous homepage and are unused now — they are the right starting point for the
boarding-pass animation rather than something new.

**Rain reminder** is the one with a real dependency: it needs a *forecast*, not
current conditions. `getWeather()` requests `forecast_days: 1` today; widening
that is a one-line change, but note the licensing constraint in the file header
before relying on it in production.

---

## Decisions on the homepage that would make this harder later — and why they
## were made anyway

Written down honestly, so nobody is surprised.

1. **The journey is a client-side state machine on `/`.** A trip dashboard that
   wants to deep-link into a specific chapter will need `/destination/[slug]`
   (which exists) rather than the homepage. That is fine, but it means the
   homepage's flight is a *first-visit* experience, not a navigation primitive.
   Do not try to reuse `HomepageV3` as a router.

2. **Guides are cities; the eSIM catalogue is countries.** `esimCountrySlug` is
   the join. If we ever sell city-level or regional eSIMs, that field becomes a
   list, not a string. Cheap to change now, annoying later — flag it if
   supplier plans start differing within a country.

3. **`routeWeight` is hand-set.** It orders search suggestions. When we have
   real booking data it should be derived, but it must never be *displayed* as a
   statistic — it is an editorial judgement, not a measurement.

4. **The usage model in `content/usage-model.ts` is an estimate, and the UI says
   so.** If supplier usage telemetry ever arrives, replacing the constants is
   trivial — but the "typical use, not a guarantee" framing must survive the
   change unless the numbers become genuinely measured, per customer.

5. **No photography.** The destination scenes are drawn SVG anchored to each
   guide's `arrival.skyColor`. The schema has an optional `photo` field ready.
   Adding real photography later means filling that field and teaching
   `DestinationScene` to prefer it — but whatever replaces the drawing has to
   preserve the sky-colour handoff, or the flight stops landing *into* the
   artwork and starts cross-fading over it.
