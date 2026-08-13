# Travel OS — states, capsules, notifications, PWA

How Domner behaves as a companion rather than a storefront: what decides the
screen you see, what a capsule is, how a notification is chosen and delivered,
and what the PWA does. Read this before changing anything under
`lib/travel/`, `lib/notifications/`, `components/travel/` or `public/sw.js`.

---

## 1. The travel state machine

`lib/travel/state.ts` is pure and has no dependencies. It takes a
`TravelerContext` — trips, saved flights, eSIM orders, and an injected `now` —
and answers one question: **what moment is this?**

| State | When |
| --- | --- |
| `new_user` | No trip, no flight, no eSIM. Ever. |
| `discovering` | Has history, nothing on the horizon |
| `planning` | Trip > 3 days out, no flight yet |
| `booked` | Trip > 3 days out, flight step done |
| `pre_trip` | Trip starts within 3 days |
| `at_airport` | Departure day with a flight that day |
| `traveling` | Between start and end date |
| `post_trip` | Ended within the last 14 days |

The ordering of the checks in `deriveTravelState` **is** the product decision:
*the most present thing wins*. A trip in progress outranks a nearer upcoming
one, because you cannot be planning next month while standing in Singapore.

`now` is a parameter, not `new Date()` inside the function. A state machine
about dates tested against the wall clock passes until someone runs the suite at
midnight. See `tests/travelState.test.ts`.

### Readiness

Five steps, in `READINESS_STEPS` order: `flight · stay · esim · places ·
itinerary`. `lib/travel/context.ts` derives them from the live schema:

| Step | Source | Honest limitation |
| --- | --- | --- |
| flight | a `saved_flights` row inside the trip window | — |
| stay | `trip_plans.generated_itinerary.stay` | **No bookings table exists.** Reports "not done" rather than inventing a hotel |
| esim | a paid/fulfilled `esim_orders` row matching the destination | matched on the destination *string*, the only join the schema offers |
| places | itinerary `places[]`, or a `trip_checklist_items` row | — |
| itinerary | `generated_itinerary` is non-empty | — |

The eSIM match is case-insensitive text because both `esim_orders.country` and
`trip_plans.destination` are display strings. A country code on both would make
it exact; until then it is wrong only for a trip written differently from the
plan that was bought.

### Where it is used

- `GET /api/travel/state` — one active trip + the moment. Home asks this.
- `GET /api/travel/trips` — the whole list. `/trips` and `/trips/[id]` ask this.

Both read the same loader, so the two screens cannot disagree about whether the
eSIM is sorted.

---

## 2. Home is a moment, not a page

`components/travel/TravelDeck.tsx` mounts above `HomepageV3` and **renders
nothing** for a guest or a `new_user`. That is deliberate:

- A first-time visitor still gets the globe hero as their entire first screen —
  it is the site's whole first impression.
- A traveler boarding in 40 minutes gets the gate, not the globe.

It fetches its own state after mount rather than being server-rendered, so the
homepage stays statically cacheable and a slow personalisation query can never
delay first paint.

---

## 3. Dynamic Travel Capsules

`components/travel/TravelCapsule.tsx` is the primitive. One capsule carries one
live fact and a tap target to the screen that fact belongs to.

Three shapes, one component:

- **link** — `href`, most capsules
- **disclosure** — `children`, expands in place
- **readout** — neither; weather has nowhere to go

States: `ready` and `loading` (`status`), plus five tones — `urgent`,
`warning`, `success`, `info`, `quiet`. Tone follows what the traveler has to
**do**, not how bad the news is: a cancellation and a boarding call are both
"drop what you are holding".

The family in `components/travel/capsules.tsx` — `FlightCapsule`,
`ESIMCapsule`, `WeatherCapsule`, `HotelCapsule`, `PlaceCapsule` — each decide
tone, wording and deep link for their subject and render nothing else. **Do not
write a second capsule surface.** A change to the glass recipe must reach all
five at once.

### Design rules the CSS enforces

Defined at the bottom of `app/globals.css`:

- State is a hairline left rail plus the eyebrow colour, never a flooded
  background. Four solid alert boxes stacked is a dashboard, not a companion.
- Gold appears on **one** capsule per viewport: the urgent one.
- Expansion animates `grid-template-rows`, so height is never measured in JS.
- Everything has a `prefers-reduced-motion` fallback.

---

## 4. Notifications

### The catalogue is the contract

`lib/notifications/catalog.ts` is pure and client-safe. For every kind it fixes:
the category, the priority level, **which preference switch silences it**, the
icon, and the TTL. `deepLinkFor()` is the only place a destination is decided.

A notification is a promise. "We will tell you if your gate changes" only holds
if one place decides what a gate change looks like. Scattering that across call
sites is how you push a marketing card at 3am, or open the homepage from a
boarding alert.

**Adding a kind means adding it here first.** `POST /api/notifications/dispatch`
rejects an unknown kind rather than guessing a level — a guessed level has no
preference switch behind it, so the traveler would have no way to turn it off.

### Priority levels

| Level | Behaviour |
| --- | --- |
| 1 CRITICAL | Push immediately. **Ignores quiet hours.** No cooldown |
| 2 IMPORTANT | Push, respects quiet hours, 5-minute cooldown |
| 3 USEFUL | Push only if nothing went out in 90 minutes |
| 4 DISCOVERY | Inbox only. Never pushed |

Level 1 ignoring quiet hours is the point of a critical notification: being
asleep in a transit hotel is exactly when a gate change matters most. Every
level-1 kind is a live-flight event, and a test asserts it stays that way.

### The engine

`lib/notifications/engine.ts` — **server only**. `notify()` runs, in order:

1. Is the kind known? → reject
2. Has the traveler asked for it? → `muted`
3. Is it a duplicate? → the unique index on `(user_id, dedupe_key)` turns a
   repeat into a no-op instead of a second buzz
4. Write the inbox row — **always**, if 1–3 passed
5. Push, if the level, quiet hours and cooldown allow

**The inbox is the record; push is one delivery channel for it.** A traveler who
denied permission, or is on iOS Safari in a browser tab, still sees their gate
change in Domner Updates.

`notify()` never throws. A notification that cannot be delivered must not take
down the checkout or webhook that triggered it.

### Web push

`lib/push/webPush.ts` sends over the standard Push API with VAPID. This is
**separate from `lib/firebase.ts` on purpose** — FCM still carries the legacy
flight-alert tokens and ripping out a working integration was not worth it.

`push_subscriptions` holds both, distinguished by `provider`. A push service
answering 404/410 means the subscription is dead; the row is **deactivated, not
deleted**, so the sender stops retrying without losing history.

Requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`. Without them,
push degrades to a logged no-op and the inbox still works. **Keep the key pair
stable per environment** — every stored subscription is bound to the public key
it was created with.

### Permission is asked in context, never cold

`components/notifications/PermissionPrompt.tsx` takes a `reason` — what just
happened — and words the offer around it. It renders **nothing** when there is
nothing to ask for: already subscribed, already denied, unsupported, or no VAPID
keys. A prompt that cannot lead anywhere teaches people to dismiss ours.

The browser prompt only ever fires from an explicit click.

---

## 5. PWA

- `public/manifest.webmanifest` — id, scope, `display_override`, categories, and
  four shortcuts (Updates, My eSIMs, Track a flight, Emergency).
- `public/sw.js` — navigations network-first, static assets
  stale-while-revalidate, **API responses never cached** (a stale gate number is
  worse than none), and three pages precached for offline: `/emergency`,
  `/airport-guide`, `/checklist`.
- `notificationclick` prefers a tab already showing the destination, then
  navigates an existing tab, then opens a new one. Falls back to `/updates`,
  never `/`.
- `components/pwa/InstallPrompt.tsx` — three gates, all of which must pass:
  the traveler did something worth keeping (`trigger`), they have not dismissed
  it before (localStorage, permanent), and we are not already installed.

**iOS has no `beforeinstallprompt` and no programmatic install.** There the
prompt shows the Share → Add to Home Screen instruction instead of a button that
cannot work. iOS Safari also has no web push in a browser tab — only once
installed to the Home Screen. Both are stated plainly in the UI rather than
papered over.

---

## 6. Navigation

`components/layout/BottomNavigation.tsx` — five destinations, each a phase of a
journey rather than a feature: **Home · Explore · Trips · Flight · You**.

Two rules it enforces:

1. **No sign-in gate.** A guest sees the same five tabs. Authentication happens
   when a feature needs to persist something.
2. **It gets out of the way** during checkout, payment, authentication, the
   admin panel and the full-screen hero — focused flows where a tab bar is an
   invitation to abandon a purchase.

Pages that sit under it carry `.has-tabbar` for the safe-area padding.

---

## 7. What is not connected

Honest list. None of the below is production-ready today:

- **No job sends flight notifications yet.** The engine, the catalogue, the
  levels and the delivery path all work and are covered by tests, but nothing
  polls flight status and calls `notify()`. `POST /api/notifications/dispatch`
  is the entry point a job would use; the existing `PUT /api/notifications`
  FCM path is untouched.
- **eSIM data usage is not reported by the supplier**, so `ESIMCapsule` renders
  without a remaining-GB figure and no `esim.low_data` notification can fire yet.
- **Hotels do not exist** as a product type, so the `stay` step and
  `HotelCapsule` have no booking behind them.
- **Nearby saved places** has no geolocation source; `PlaceCapsule` exists and
  is unused.
- **Live weather** covers only destinations with a written guide (seven), since
  that is where the coordinates live.
