# Homepage v3 — "The journey begins here"

**Status: PLAN — awaiting approval. No implementation code written.**

Scope: the homepage only (`app/page.tsx` and its component tree). Checkout,
payment, provisioning, Supabase schema, auth and every other route are
untouched. The recommendation card in Chapter 6 hands its selection to the
existing cart (`hooks/useCart.ts` → `/cart` → `/esim/checkout`).

---

## 1. What is there today

### 1.1 The page

`app/page.tsx` (10 lines) renders `components/home/HomeContent.tsx`, a client
component with six stacked sections:

| # | Section | Verdict |
| --- | --- | --- |
| 1 | `GlobeHero` — badge, h1, sub, 2 CTAs, drag hint, 3 stat chips | Globe kept, copy layer deleted |
| 2 | `CambodiaShowcase` — medallion carousel sharing the globe stage | Removed from `/` |
| 3 | Features (3 cards) | Deleted — product pitch on the first screen |
| 4 | How it works (4 constellation steps) | Deleted |
| 5 | Popular destinations (8 cards) | Replaced by search |
| 6 | Testimonials + bottom CTA | **Deleted — fabricated content, see §1.4** |
| — | `JourneyCompanion` — a second, CSS mini-globe | Removed — it competes with the real globe |

### 1.2 The globe — reusable, and better than I expected

`components/globe/globeEngine.ts` (457 lines) is a clean engine/mode split and
it stays. What it already gives us for free:

- **Procedural geometry, zero texture payload.** ~20k dots placed by a
  fibonacci sphere filtered through `globeLandMask.ts`, an 83-line
  512×256 bitmask. No HDRI, no equirectangular texture — this is exactly the
  discipline §9 asks for and it is the reason the 3D layer has any chance of
  fitting the budget.
- Occluder sphere, fresnel atmosphere rim, twinkling starfield.
- `pointMats` / `timeMats` registries + `onFrame()` — a real extension point.
- `setViewport` / `setGlobeScale` with correct px-scale uniform maths.
- Proper `dispose()`, rAF pause on hidden tab and off-screen, DPR capped
  (1.5 mobile / 2 desktop), dot count halved on mobile.
- `latLonToXYZ()` — the maths the search-and-fly needs.
- `HUB_VERT`/`HUB_FRAG` already draw a breathing, glowing, hoverable point.
  **That is the destination pin in §3.4, already written.**

### 1.3 What is wrong with it for v3

1. **The camera never moves.** `camera.position.z` is fixed at 2.9 forever;
   every "zoom" in the codebase is `tiltGroup.scale` with the dot size
   compensated in the shader by `uGlobeScale`. Scaling a sphere is not a
   descent — you get a bigger ball of the same dots. A Google-Earth-style
   descent needs a real camera dolly plus a fidelity answer (§3.1). This is the
   one genuine blocker and the reason I want to prototype before building.
2. **The globe is owned by a section, not the page.** `GlobeHero`'s `layout()`
   reads `section.offsetHeight` to park the sphere on the hero/showcase seam.
   For v3 the globe must be a persistent viewport-fixed layer that survives the
   flight and the destination scroll without remounting. This is a lift, not a
   rewrite: the engine is fine, the placement logic is what changes.
3. **GSAP is in the way of the budget.** three.js at r185 with only the
   renderer/core/geometries we use lands around 140–160 KB gzipped. GSAP core +
   ScrollTrigger adds roughly 40 KB more. §9 caps the 3D layer at 200 KB
   gzipped. We need a custom eased camera tween anyway, so GSAP is buying us
   very little here. **Recommendation: the v3 homepage ships zero GSAP** — a
   ~1 KB tween/easing utility plus IntersectionObserver for chapter reveals.
   Other routes keep GSAP; this is a homepage decision.
4. **`DomerSplash` can hold the first screen for up to 4 seconds.** It waits for
   the window `load` event (which will now include the globe chunk) with a 4 s
   safety timer, then holds a further 900 ms. On a mid-range Android on
   Cambodian mobile data that is the difference between "premium" and "bounce".
   It must dismiss on first contentful paint of the hero — or, better, do the
   handoff the design system already asks for: the Wayfinder star flies up and
   *becomes* the globe.
5. **Khmer typography is a font swap, not a pairing.** `body.lang-km` swaps the
   *entire* body font to Noto Serif Khmer, so Latin words and all numerals
   inside Khmer copy render in Noto Serif Khmer's Latin — metrically unrelated
   to Manrope — and `.font-display` loses Marcellus completely. There is no
   per-script line-height. Fix in §7.
6. **Emoji flags on destination surfaces.** `🇯🇵` renders as a different glyph on
   every OS and is invisible on most Windows builds. The repo already knows
   better — `destinationArt.tsx` is hand-drawn SVG. v3 uses no emoji.

### 1.4 Honesty problems already live on the site

These are not v3 issues; they are shipping today and I think they should be
fixed regardless of what you decide about this plan:

- **Three invented testimonials** with full names, cities and quotes
  (`HomeContent.tsx:23-44`) — Sokha P., Dara M., Channary S. None of these
  people exist.
- **"Join thousands of Cambodian travelers who fly with confidence"**
  (`cta.sub`) — an unearned user count.
- **"150+ Countries"** (`hero.stat1`, and the site description in
  `app/layout.tsx`) while `data/destinations.ts` carries 20 countries.
- **`usdRate` in `data/destinations.ts`** is a hardcoded snapshot (JPY 152, THB
  35.2, …) with no date, rendered in the UI as if current.

v3 removes all four from the homepage. The metadata description and the
`/esim` pages carry two of them too.

---

## 2. The honest warnings

### 2.1 The globe cannot descend to street level, and should not try

Google Earth descends convincingly because it streams higher-resolution tiles.
Ours is ~20,000 dots spread over the whole planet — roughly one dot per
25,000 km². Fill the screen with Japan and you are looking at about sixty dots.
**The closer we fly, the worse it looks** — the exact inverse of the reference.

Three ways out:

- **(a) Stop at regional altitude.** Descend until the destination country fills
  ~40% of frame, hold, then hand off. The globe never reaches a scale it cannot
  carry.
- **(b) Local LOD patch.** At flight start, generate a second, denser dot set
  for the destination region from the same bitmask at higher sample density
  (~8k extra points, built in a Web Worker, ~30 ms, **zero bytes of payload**),
  and cross-fade it in as we descend.
- **(c) Abandon the descent.** Rotate and zoom modestly. Weakest, but safest.

**Recommendation: (a) + (b).** Together they give a descent that gains detail
instead of losing it, and end at an altitude that reads as "arrival" rather
than "pixel peeping". If the prototype in §12.5 says otherwise, we simplify the
transition and keep the budget, per your instruction.

### 2.2 Continuity vs. addressability

"Never a page navigation" and "a destination page Google can index" pull in
opposite directions. Proposal:

- `/` owns the flight and the destination state in React. No route change, no
  remount, no white flash.
- On arrival we `history.pushState` to `/destination/tokyo`. `popstate` flies
  back to the globe rather than reloading.
- A real server-rendered `/destination/[slug]` route exists for direct hits,
  shares and crawlers. It renders the identical chapters as server components
  (they are static data + one cached fetch), with no flight — you simply arrive.

One set of chapter components, two entry points. This needs your sign-off
because it adds a route outside the stated homepage scope.

### 2.3 The globe's real differentiator

You are right that a rotating globe with glowing arcs is what all three
competitors ship. My proposal is to **delete the arcs from the idle state** and
replace them with something none of them have: **a real day/night terminator.**
The sun's subsolar point is about twenty lines of maths, costs nothing, and
turns the globe from decoration into an instrument — you can see, at a glance,
where it is morning. It ties straight into the greeting: it says "good evening"
to you, and Tokyo is already in daylight on screen. City lights glow only on
the night side. Nothing to buy, nothing to download, and it is *true*.

The arcs stay in the codebase for `FlightRouteGlobe`, where an arc means an
actual flight.

---

## 3. The data audit — every field, classified

Rule applied: **LIVE** = real API, fetched and cached server-side.
**CURATED** = hand-written by us, typed, with `lastVerified` displayed in the
UI. **OMIT** = cannot be sourced honestly, so it is cut.

### Chapter 1 — Arrival

| Field | Class | Source / note |
| --- | --- | --- |
| Destination name, KM name | CURATED | schema |
| Hero photography | CURATED | self-hosted, credited (§9.3) |
| Current local time | **LIVE** | No API. Curated IANA tz (`Asia/Tokyo`) + `Intl.DateTimeFormat` in the browser. Zero bytes, always correct, works offline. |
| Current weather + condition | **LIVE** | Open-Meteo forecast API. **No API key.** Cached server-side 30 min. ⚠️ Open-Meteo's free tier is non-commercial; commercial use needs their paid plan (~€29/mo). Decision needed — see §11. |
| Sunrise / sunset today | **LIVE** | Same Open-Meteo call, free. |

### Chapter 2 — The basics

| Field | Class | Source / note |
| --- | --- | --- |
| Currency code, name, symbol, common notes | CURATED | schema |
| Rate vs **USD** | **LIVE** | `open.er-api.com` — no key, 160+ currencies, updates daily, attribution required. Labelled "updated daily", never "live". Cached 6 h. |
| Rate vs **KHR** | **LIVE** + fallback | Same source carries KHR. The riel is de-facto pegged near 4,100/USD; if the fetch fails we show the existing `USD_TO_KHR = 4100` explicitly labelled *indicative*. **Frankfurter/ECB was rejected: it has no KHR and no VND, which would break Da Nang, HCMC and the entire Khmer leg.** |
| "What ~$10 buys you" | CURATED | three real local prices (coffee, metro ride, street meal), `lastVerified` |
| Languages, hello/thank you | CURATED | schema |
| Plug type, voltage, Hz | CURATED | IEC plug standards, verifiable |
| Mobile networks, bands, quality | CURATED | partly exists in `data/destinations.ts` |

### Chapter 3 — Getting in safely *(the crown; most design care)*

| Field | Class | Source / note |
| --- | --- | --- |
| Visa requirement **for a Cambodian passport** | CURATED | `lastVerified` + link to the destination's official immigration page, both shown in the UI |
| Visa cost, max stay, where/how to apply, processing time | CURATED | schema |
| **Digital arrival card** (SG Arrival Card, Thailand TDAC, Malaysia MDAC, Vietnam e-arrival, Visit Japan Web, K-ETA) | CURATED | official URL + the submission window (72 h / 3 days). **The highest-value field on the page**: mandatory, time-boxed, and routinely missed. With a travel date entered we can compute "submit on or after <date>". |
| Passport validity rule (6 months etc.) | CURATED | schema |
| Proof of onward travel / funds | CURATED | schema |
| Emergency numbers (police / ambulance / fire) | CURATED | schema |
| **Cambodian embassy or consulate in-country** — address, phone, hours | CURATED | schema. No competitor carries this. |
| Customs limits + banned items (e-cigs in Thailand, pseudoephedrine in Japan) | CURATED | `data/customsRules.ts` already has 7 countries of this — it folds into the schema |
| Safety score | **OMIT** | No honest source. Cut. |
| Live travel alerts | **OMIT** | No authoritative machine-readable feed for a Cambodian audience. Replaced by a visible "reviewed on <date>" line — which is a *truthful* freshness signal rather than a fake live one. |
| Health / vaccination requirements | **OMIT (v1)** | Medical advice; needs a sourcing standard we do not have yet. |

### Chapter 4 — Getting around

| Field | Class | Source / note |
| --- | --- | --- |
| Airport → city: options, real cost, real duration | CURATED | schema |
| Transit card (Suica, Rabbit/MRT, EZ-Link, T-money, Touch'n Go) + can it live in Apple/Google Wallet | CURATED | schema |
| Apps actually used there (Grab, Bolt, LINE, Kakao T, Gojek) + store links | CURATED | schema |
| **Does a Cambodian card work?** ABA / ACLEDA / Wing Visa acceptance | CURATED | schema, `lastVerified` |
| **Does KHQR work there?** | CURATED | Bakong's cross-border QR links (Thailand, Vietnam, Laos, China) are real, dated, and change; every entry carries a source link and a verification date. **This is the most Cambodia-specific fact on the page and the one Airalo structurally cannot write.** |
| Tipping, cash vs card norms | CURATED | schema |

### Chapter 5 — Why you're going

| Field | Class | Source / note |
| --- | --- | --- |
| Attractions & hidden gems: name, why, area, best time, rough cost, map link | CURATED | schema |
| Photography | CURATED | self-hosted, credited |
| **"Trending on TikTok right now"** | **OMIT** | TikTok has no public trends API. Anything we assert here is invented and ages in weeks. **Reframed** as a curated, dated *"Where Cambodians are going"* block — honest, still culturally specific, still nothing Airalo has. |

### Chapter 6 — The recommendation

| Field | Class | Source / note |
| --- | --- | --- |
| Plans, prices, duration, data | Existing | `data/esimPlans.ts`, derived not invented |
| "Estimated use: 8.1 GB" | **MODEL — labelled as such** | This is the audit's sharpest edge: a number like 8.1 GB *looks* measured. It is not; it is arithmetic over per-app daily rates. So the page never states it bare. It shows the line items that produce it (Maps ~0.15 GB/day, TikTok ~0.9 GB/day, Instagram ~0.6 GB/day, messaging + translation ~0.1 GB/day), the trip length, and the words "typical use, not a guarantee". The constants live in one typed file with their provenance in a comment. |

### Trust block — built only from things that are true

No user counts. No testimonials. No partner logos (also a brand-usage risk).
Only: what happens if the eSIM does not work, support that answers in Khmer,
USD and KHQR payment, no contract, QR emailed the moment it is issued.
**I need your exact refund/replacement wording before this ships** — I will not
draft a policy commitment on your behalf.

---

## 4. The content schema

One file per destination, no code required to maintain it. Typed so that a
missing Khmer string or a missing `lastVerified` is a **build failure**, not a
silent gap.

```
content/
  destinations/
    index.ts          # registry + search aliases
    tokyo.ts
    bangkok.ts
    singapore.ts
    seoul.ts
    ho-chi-minh-city.ts
    kuala-lumpur.ts
    da-nang.ts
  schema.ts           # the types below
  usage-model.ts      # the per-app data constants, with provenance
```

```ts
/** Every human-readable string is bilingual. Khmer is not optional. */
export type Bi = { en: string; km: string };

export interface Source {
  label: Bi;              // "Immigration Bureau of Japan"
  url: string;            // official page, shown in the UI
}

/** Wrapper for anything hand-written. lastVerified is rendered, always. */
export type Verified<T> = T & {
  lastVerified: `${number}-${number}-${number}`;  // ISO date
  source?: Source;
};

export interface DestinationGuide {
  slug: string;                 // 'tokyo'
  city: Bi;
  country: Bi;
  countryCode: string;          // ISO-3166 alpha-2, for the SVG flag
  /** Which eSIM catalogue entry this guide sells. Guides are cities,
   *  the eSIM catalogue is countries — the join lives here. */
  esimCountrySlug: string;      // 'japan' → data/destinations.ts
  /** Alternate spellings the search must match: 'Japan', 'ជប៉ុន', 'Tokyo',
   *  'តូក្យូ', 'NRT', 'HND'. */
  aliases: string[];
  /** How often Cambodians actually fly here. Drives suggestion ranking.
   *  A hand-set integer, not a fake statistic — never shown as a number. */
  routeWeight: number;

  geo: {
    lat: number; lon: number;
    timezone: string;           // IANA, powers the LIVE local clock
    /** Camera altitude the flight settles at, tuned per destination. */
    flightAltitude: number;
  };

  arrival: {
    hero: Photo;
    /** The sky colour at the top of the hero image. The globe's atmosphere
     *  fades to exactly this so the flight lands *into* the photograph
     *  instead of cross-fading over it. This is the seamless handoff. */
    skyColor: string;
    intro: Bi;                  // two sentences, no marketing
  };

  basics: Verified<{
    currency: { code: string; name: Bi; symbol: string };
    tenDollarsBuys: { item: Bi; localPrice: string }[];
    languages: Bi[];
    hello: { native: string; roman: string };
    thankYou: { native: string; roman: string };
    plugTypes: string[];        // ['A','B']
    voltage: string;            // '100V / 50–60Hz'
    networks: { name: string; note?: Bi }[];
  }>;

  /** Chapter 3. Deliberately the richest object in the schema. */
  entry: {
    forPassport: 'KH';          // explicit: this is Cambodian-passport advice
    visa: Verified<{
      kind: 'visa-free' | 'visa-on-arrival' | 'e-visa' | 'embassy-visa';
      summary: Bi;
      maxStayDays: number | null;
      costUsd: number | null;
      applyUrl?: string;
      processingTime?: Bi;
    }>;
    /** Each requirement is an independently trackable to-do. This shape is
     *  what makes the roadmap's Travel Readiness Score possible without
     *  re-modelling anything — see roadmap.md. */
    requirements: Verified<{
      id: string;                          // 'visit-japan-web'
      title: Bi;
      detail: Bi;
      mandatory: boolean;
      /** When it must be done, relative to departure. */
      window?: { opensDaysBefore?: number; closesHoursBefore?: number };
      url?: string;
    }>[];
    passportValidity: Verified<{ monthsBeyondStay: number; note?: Bi }>;
    onwardTravel: Verified<{ required: boolean; note: Bi }>;
    customs: Verified<{
      cashDeclareOverUsd: number | null;
      banned: Bi[];
    }>;
    emergency: Verified<{
      police: string; ambulance: string; fire: string;
      /** The thing no competitor has. */
      khmerEmbassy?: {
        name: Bi; address: Bi; phone: string; hours?: Bi; mapUrl?: string;
      };
    }>;
  };

  around: Verified<{
    fromAirport: {
      mode: Bi; durationMins: number; costLocal: string; costUsd: number; note?: Bi;
    }[];
    transitCard?: { name: string; note: Bi; inPhoneWallet: boolean };
    apps: { name: string; purpose: Bi; ios?: string; android?: string }[];
    money: {
      cambodianCardAccepted: 'widely' | 'sometimes' | 'rarely';
      khqrAccepted: boolean;
      khqrNote?: Bi;
      cashCulture: Bi;
      tipping: Bi;
    };
  }>;

  places: Verified<{
    kind: 'landmark' | 'hidden-gem' | 'popular-with-cambodians';
    name: Bi; why: Bi; area: Bi;
    bestTime?: Bi; roughCostUsd?: number;
    photo?: Photo; mapUrl?: string;
  }>[];
}

export interface Photo {
  src: string;        // /images/destinations/tokyo/hero.avif — self-hosted
  alt: Bi;
  blurDataURL: string;
  width: number; height: number;
  credit: { name: string; url: string; license: string };  // never blank
}
```

**Why it is shaped this way for the roadmap:** the schema describes *facts about
a place*, not *sections of a page*. `entry.requirements[]` with ids, deadlines
and URLs is directly the Travel Readiness Score. `geo.timezone` +
`arrival.skyColor` are the trip dashboard's clock and its theme. `around.apps`
and `entry.emergency` are the arrival-moment notification. Nothing on this page
needs re-modelling to build any item in §11.

**Coverage:** the seven cities you named, done properly. Everything else
degrades honestly: we say the full guide is not written yet, offer the eSIM if
we sell that country, and let people register interest. No thin auto-generated
guides — that is precisely the competitor smell we are trying to escape.

---

## 5. Design tokens

Brand tokens are already right and I am adding no new hexes (ui-ux skill §2).
What is missing is a **named motion system**, which is what makes a page read
as expensive.

```css
/* Motion — named, reused, never improvised per element */
--ease-signature: cubic-bezier(0.22, 1, 0.36, 1);   /* existing; reveals   */
--ease-smooth:    cubic-bezier(0.4, 0, 0.2, 1);     /* existing; hovers    */
--ease-flight:    cubic-bezier(0.60, 0.02, 0.12, 1);/* NEW; camera weight  */
--ease-settle:    cubic-bezier(0.16, 1, 0.30, 1);   /* NEW; arrival easing */

--d-micro:    220ms;   /* hover, focus, field expand    */
--d-reveal:   800ms;   /* a chapter arriving            */
--d-chapter:  900ms;   /* gradient between chapters     */
--d-flight:  2600ms;   /* full tier camera flight       */
--d-flight-reduced: 1200ms;
```

Spatial discipline: one idea per screen; chapters `min-height: 88svh`; prose
capped at 62ch; page shell 1120px; vertical rhythm on an 8px base with chapter
padding `clamp(6rem, 14vh, 10rem)`.

Three intentional tiers, decided once and read everywhere:

| Tier | Triggers | Globe | Flight | Photos |
| --- | --- | --- | --- | --- |
| **full** | ≥4 cores, no save-data, WebGL ok, DPR≤2 | 20k dots, terminator, LOD patch | 2600ms camera descent | full res |
| **reduced** | ≤4 cores / save-data / 4× frame-time slip / coarse pointer + small screen | 8k dots, no LOD patch, no starfield twinkle | 1200ms rotate + modest zoom, no descent | smaller srcset |
| **static** | no WebGL, or `prefers-reduced-motion` | CSS/SVG globe poster, no canvas | instant, cross-fade only | full res, no parallax |

All three are designed. Search, all six chapters and the entire purchase must
work in **static** — and I will verify that by disabling WebGL and buying.

---

## 6. Wireframes

### 390px — first screen

```
┌──────────────────────────────┐ 0
│  ◇ Domner            EN|ខ្មែរ │  ← minimal bar; no nav items,
│                              │    no cart badge, no promo
│                              │
│         · · ✦ · ·            │
│       ╭──────────╮           │
│      ╱            ╲          │  the globe: night side lit,
│     │   ●●        │          │  day side dark, real terminator
│     │  ●●●●   ▓▓▓ │          │  ▓ = daylit hemisphere
│      ╲ ●●●    ▓▓ ╱           │
│       ╰──────────╯           │
│                              │
│      Good evening            │  ← 15px, gold, tracking-wide
│                              │
│   Where are you              │  ← Marcellus, clamp to 34px
│   traveling next?            │
│                              │
│   Every journey begins       │  ← 15px, white/65
│   with a name.               │
│                              │
│  ╭────────────────────────╮  │
│  │ ⌕ Search country,      │  │  ← the ONLY control.
│  │   city or destination… │  │    glass, 52px tall
│  ╰────────────────────────╯  │
│                              │
│    Tokyo — continue ›        │  ← returning visitors only,
│                              │    appears at +600ms. §6.1
└──────────────────────────────┘ 100svh
```

### 390px — search open

```
│  ╭────────────────────────╮  │
│  │ ⌕ jap|                 │  │
│  ╰────────────────────────╯  │
│  ╭────────────────────────╮  │
│  │ ▮ Tokyo, Japan         │  │  suggestions answer the
│  │   6h from PNH · visa   │  │  question before you finish
│  │   required             │  │  typing — the reason for the
│  │────────────────────────│  │  ranking is visible
│  │ ▮ Osaka, Japan         │  │
│  │   Guide coming soon    │  │  ← honest degradation
│  │────────────────────────│  │
│  │ ⚡ Japan eSIM · 10GB    │  │  ← express lane, last row,
│  │   8 days · $13.99   →  │  │    returning visitors only
│  ╰────────────────────────╯  │
```

### 1440px — first screen

```
┌────────────────────────────────────────────────────────────────────────┐
│ ◇ Domner                                                     EN | ខ្មែរ │
│                                                                        │
│                    ·        ✦              ·                           │
│                        ╭────────────────╮                              │
│                     ╱                      ╲                           │
│                   │      ●●●        ▓▓▓▓     │                         │
│                   │    ●●●●●●      ▓▓▓▓▓▓    │                         │
│                    ╲     ●●●        ▓▓▓▓    ╱                          │
│                        ╰────────────────╯                              │
│                                                                        │
│                            Good evening                                │
│                                                                        │
│                   Where are you traveling next?                        │
│                                                                        │
│                  Every journey begins with a name.                     │
│                                                                        │
│              ╭────────────────────────────────────────╮                │
│              │ ⌕  Search country, city or destination…│                │
│              ╰────────────────────────────────────────╯                │
│                                                                        │
│                        Tokyo — continue ›                              │
└────────────────────────────────────────────────────────────────────────┘
```

### The destination journey (both widths, after landing)

```
┌───────────────────────────────────────────────────┐
│ ← ⌕            TOKYO    21:47   ☁ 18°             │ ← sticky instrument
├───────────────────────────────────────────────────┤   strip: live local
│                                                   │   time + weather stay
│        [ hero photograph, full bleed ]            │   with you all the
│                                                   │   way down. Chapter 1
│        TOKYO                                      │   never scrolls away
│        តូក្យូ · ជប៉ុន                                  │   entirely.
│        Thursday, 21:47 · 18° clear                │
│                                                   │
├─── Ch.2 ──────────────────────────────────────────┤
│  THE BASICS                                       │  gold eyebrow opens
│  ¥1 = $0.0064   $1 = ¥156   1,000៛ = ¥38          │  every chapter
│  ┌────────┐ ┌────────┐ ┌────────┐                 │
│  │ Money  │ │ Plug   │ │ Network│                 │
│  │ ¥ JPY  │ │ A / B  │ │ 4G/5G  │                 │
│  │ updated│ │ 100V   │ │ Docomo │                 │
│  │ today  │ │        │ │        │                 │
│  └────────┘ └────────┘ └────────┘                 │
│  $10 buys: coffee ¥500 · metro ¥180 · ramen ¥900  │
├─── Ch.3 ══════════════════════════════════════════┤
│  GETTING IN — WITH A CAMBODIAN PASSPORT           │  ← widest column,
│                                                   │    biggest type,
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │    most air. This
│  ┃ VISA REQUIRED                             ┃   │    chapter is the
│  ┃ Apply through a registered agency.        ┃   │    reason to come
│  ┃ ~$25 · allow 5–7 working days             ┃   │    back.
│  ┃ Stay up to 15 days                        ┃   │
│  ┃ Verified 12 Jul 2026 · Immigration Bureau ┃   │  ← date + source on
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │    the face of it
│                                                   │
│  BEFORE YOU FLY                                   │
│  ☐ Visit Japan Web — from 2 weeks before   →      │
│  ☐ Passport valid through your stay               │
│  ☐ Return ticket ready to show                    │
│                                                   │
│  IF SOMETHING GOES WRONG                          │
│  Emergency 110 police · 119 ambulance             │
│  ┌───────────────────────────────────────────┐    │
│  │ Cambodian Embassy, Tokyo                  │    │  ← nobody else
│  │ 8-6-9 Akasaka, Minato-ku                  │    │    has this
│  │ +81 3 5412 8521 · Mon–Fri 09:00–17:00     │    │
│  └───────────────────────────────────────────┘    │
├─── Ch.4 ──────────────────────────────────────────┤
│  GETTING AROUND                                   │
│  Narita → city: Skyliner 41m ¥2,570 ($16)         │
│  Suica — works in Apple Wallet ✓                  │
│  Your ABA card: widely accepted                   │
│  KHQR: not accepted in Japan                      │  ← honest negative
├─── Ch.5 ──────────────────────────────────────────┤
│  WHY YOU'RE GOING                                 │
│  [photo] [photo] [photo]  horizontal, snap-scroll │
├─── Ch.6 ══════════════════════════════════════════┤
│  AND ONE LAST THING                               │
│  ┌───────────────────────────────────────────┐    │
│  │ Recommended for you                       │    │
│  │ 8 days · 10 GB              $13.99        │    │
│  │                                           │    │
│  │ Enough for Maps, TikTok, Instagram and    │    │
│  │ translation.                              │    │
│  │                                           │    │
│  │ Typical use over 8 days:                  │    │
│  │  Maps        ▓░░░░░░░░  1.2 GB   [on]     │    │  ← toggle a line
│  │  TikTok      ▓▓▓▓▓░░░░  4.8 GB   [on]     │    │    off and the
│  │  Instagram   ▓▓▓░░░░░░  1.9 GB   [on]     │    │    recommendation
│  │  Chat, maps  ▓░░░░░░░░  0.2 GB   [on]     │    │    changes
│  │              ─────────  8.1 GB            │    │
│  │  Typical use, not a guarantee.            │    │
│  │                                           │    │
│  │  [        Get this eSIM        ]          │    │  ← one tap → cart
│  │  Different trip length?  8 days  – +      │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  If it doesn't work, we replace it or refund it.  │  ← only true things
│  Support answers in Khmer. Pay in USD or KHQR.    │
│  No contract.                                     │
└───────────────────────────────────────────────────┘
```

### 6.1 The returning visitor — §2's exception

Rejected: a "Buy now" button (a second CTA, breaks the calm); a cart badge in
the header (retail, not travel); a "skip the story" link (admits the story is
an obstacle).

**The search field is the express lane.** It is the only control on screen, so
give it a memory instead of giving the page a second control:

1. If we know a previous destination (localStorage) or there is something in
   the cart, one line of quiet text fades in **below** the field at +600 ms —
   after the first frame has settled, so it never competes: *"Tokyo — continue
   ›"*. A text link. No fill, no border, no shadow.
2. Typing a destination we sell puts its recommendation as the **last**
   suggestion row: *"Japan eSIM · 10 GB, 8 days · $13.99 →"*. Two taps from
   keystroke to checkout, no scrolling.
3. Their last destination's pin is already lit on the idle globe. Clicking it
   flies there.
4. `/` or `⌘K` focuses the field.

A first-timer sees none of this. Someone who has been here before never sees a
chapter they have already read.

---

## 7. Khmer typography

The concrete problem: `body.lang-km` replaces the whole body font, so Latin
words and every numeral inside Khmer copy render in Noto Serif Khmer's Latin —
a different design at a different metric — and `.font-display` stops being
Marcellus entirely.

The fix is **two pairs, split by Unicode range**, so each script keeps its own
face regardless of the interface language:

| Role | Latin | Khmer |
| --- | --- | --- |
| Display | Marcellus | Noto Serif Khmer 400 |
| Body / UI | Manrope | **Noto Sans Khmer** 400/600 |
| Numerals | Manrope tabular | Manrope tabular (Khmer copy keeps Latin digits — this is what Cambodian UIs actually do) |

Declared with `@font-face` `unicode-range` so the browser picks per glyph, not
per element. Plus a per-script line-height token (`--lh-km: 1.9` against
`--lh-en: 1.62`) — Khmer has stacked subscripts and vowel signs above and below
the baseline, and 1.6 clips them. And `word-break` care: Khmer has no spaces
between words, so any fixed-width chip must be allowed to wrap.

**This adds a fourth font family**, which the ui-ux skill's §3 forbids. I think
the rule was written for Latin-only thinking and the trade is worth it — but it
is your call, so I am flagging it rather than quietly doing it. Cost is one
extra subset file, Khmer-range only, ~28 KB woff2, loaded only when needed.

**And a hard requirement I cannot satisfy myself:** every line of Khmer on this
page needs a native speaker's review before it ships. I can write Khmer that is
grammatical; I cannot guarantee it does not read like translated English, which
is the exact failure §7 is about. Budget a review pass.

---

## 8. First-screen copy

| Slot | English | Khmer |
| --- | --- | --- |
| Greeting (05–11) | Good morning | អរុណសួស្តី |
| Greeting (11–17) | Good afternoon | ទិវាសួស្តី |
| Greeting (17–22) | Good evening | សាយណ្ហសួស្តី |
| Greeting (22–05) | Still awake | រាត្រីសួស្តី |
| Title | Where are you traveling next? | តើអ្នកនឹងធ្វើដំណើរទៅណាបន្ទាប់? |
| Subtitle | Every journey begins with a name. | រាល់ដំណើរចាប់ផ្តើមពីឈ្មោះមួយ។ |
| Search | Search country, city or destination… | ស្វែងរកប្រទេស ទីក្រុង ឬគោលដៅ… |
| Returning | Tokyo — continue › | តូក្យូ — បន្តទៀត › |
| No guide yet | We haven't written this guide yet. Tell us and we'll write it next. | យើងមិនទាន់សរសេរមគ្គុទ្ទេសក៍នេះទេ។ ប្រាប់យើង យើងនឹងសរសេរវាបន្ទាប់។ |

The greeting uses the *visitor's* local time, not the destination's — it is a
greeting to them, not a fact about the world. The destination's clock appears
after landing, where it means something.

No badge. No stats. No "Cambodia's first…". If the page is good, the visitor
works out what we are.

---

## 9. Motion storyboard — search to arrival

Full tier. `t` in ms from the moment a suggestion is committed.

| t | Camera / globe | Screen | Notes |
| --- | --- | --- | --- |
| **−∞** | Idle: 1 rev / 90 s, real terminator, city lights on the night side only | Greeting, title, search | No arcs. Nothing to click but the field. |
| **0** | Suggestion committed | Suggestion list collapses into the field (`--d-micro`) | The field stays — it is the thing you travelled *with* |
| **0–260** | LOD patch generation kicks off in a worker | Greeting, title, subtitle fade out and lift 24px, staggered 40ms | The page empties before the camera moves; nothing is "left behind" |
| **160–1600** | **Rotate.** Shortest-path slerp of the sphere's orientation toward the target lat/lon, `--ease-flight`. Rotation completes before descent begins. | Background gradient begins interpolating toward `arrival.skyColor` over the full flight | Weight comes from a slow start and a very long tail |
| **900–2400** | **Descend.** Camera dollies from z=2.9 to the destination's `flightAltitude`. FOV narrows 38°→31° — a slight lens compression that reads as approach rather than as zoom | Star layer parallaxes outward and dims | Overlaps the rotation by 700 ms so it is one motion, not two |
| **1500–2100** | **Pin resolves.** Existing `HUB_*` shader: scales from 0, overshoots by 6%, settles on `--ease-settle`, then a soft continuous breathe | Destination name fades up beneath the pin | Nothing bouncy — one overshoot, that's it |
| **1900–2600** | **Atmosphere blooms.** The fresnel rim intensity ramps and its colour crosses to `arrival.skyColor` | Hero photo begins loading (preloaded on suggestion hover/focus, so it is warm) | The bloom is the wipe |
| **2400–2900** | Globe canvas fades out under the bloom | Hero photograph resolves — **its sky is the same colour the atmosphere just became**, so the horizon simply continues | This is the seam. There is no cross-fade because there is nothing to cross |
| **2900** | Canvas render loop pauses (not disposed — we fly back from here) | Instrument strip slides down; chapters observe into view individually | Back button / `←` flies the reverse path from wherever you are |

**Interruptible and reversible:** the flight is a single state machine holding
`from`, `to` and `t`. A new search re-targets `to` and recomputes `from` as the
*current* interpolated pose, so the second flight departs from wherever the
first one had reached. There is no queue and no cancel-then-restart flash.

**Reduced tier:** rotate + a modest zoom, 1200 ms, no descent, no LOD, bloom
shortened to 300 ms. **Static tier:** no canvas at all — the globe poster
cross-fades to the hero over 400 ms, or is instant under
`prefers-reduced-motion`. All three are designed states; none is a failure mode.

**Slow-connection degradation:** if the hero image has not decoded by t=2600,
the bloom holds at full intensity on the destination's `skyColor` (a flat
colour, always available, zero bytes) and the photo fades in whenever it
arrives. The canvas never freezes and the sequence never stalls.

---

## 10. Self-critique — what I changed before showing you

Six things in my first pass were the default move for any travel startup.

1. **Rotating globe with glowing arcs.** You called this. My first draft kept
   the arcs "quieter". That is not a difference, it is the same thing dimmed.
   → **Deleted the arcs from the idle state; added a real day/night terminator.**
   The globe now tells you something true that no competitor's globe tells you,
   for zero bytes.
2. **"Chapters fade up as you scroll."** This is the house style of every
   premium landing page built since 2021. → **Added the persistent instrument
   strip**: the destination's live local time and weather ride with you all the
   way down. The place stays *running* while you read about it. It is also the
   first working piece of the trip dashboard in §11.
3. **"Recommended for you" with reasoning in a tooltip.** Every SaaS pricing
   page has a recommended tier. → **Made the reasoning the primary content** —
   the per-app breakdown is a bar chart you can toggle line by line, and the
   recommendation recomputes. The advice is the product; the SKU is a
   consequence.
4. **"Suggestions weighted to routes Cambodians fly."** Invisible weighting is
   indistinguishable from no weighting. → **Suggestions show why they rank**:
   "6h from PNH · visa required". The list answers the question before you have
   finished asking it.
5. **Hero photo cross-fading in under the globe.** That is Airbnb, and a
   cross-fade is exactly the seam you said kills the magic. → **The atmosphere
   becomes the photograph's sky**, via `arrival.skyColor` in the schema. Art
   direction enforced by the type system.
6. **A trust bar with payment-provider logos.** Cut entirely — unearned, and a
   brand-usage risk besides.

And three of my own defaults I cut:

- A "Surprise me / explore" control on the first screen. It is a second CTA.
  §2 says one thing to do, and it meant it.
- GSAP on the homepage. ~40 KB for easing I have to hand-write anyway.
- A full Google-Earth descent to street altitude. It would look *worse* the
  closer it got (§2.1). Better to stop at an altitude the geometry can carry
  and spend the drama on the handoff.

**What I am least sure about:** the terminator. It is the strongest idea here
and it is also the one that could read as a gimmick if the lighting is not
beautiful. It is cheap enough to prototype in the §12.5 spike alongside the
flight, and cheap enough to abandon.

---

## 11. Decisions I need from you

Six of these change what gets built; the last three are policy.

1. **Photography.** Self-hosted is non-negotiable for §9, but the source is
   yours to choose: Unsplash licence (free, commercial-safe, credit anyway) or
   paid stock. Seven cities × ~4 images. This is the single most likely thing
   to blow the performance budget.
2. **Weather API.** Open-Meteo needs no key but its free tier is
   non-commercial; commercial use is ~€29/mo. Approve that, supply an
   OpenWeather key, or cut live weather to CURATED "typical for this month".
3. **The fourth font** (Noto Sans Khmer for body). Deviates from the ui-ux
   skill's three-family rule — §7 explains why I think it is right.
4. **A real `/destination/[slug]` route** for SEO and shared links, outside the
   stated homepage scope. Without it, the destination journey is invisible to
   Google and unshareable (§2.2).
5. **Removing `CambodiaShowcase` and `JourneyCompanion` from `/`.** Both are
   used nowhere else. Files kept; the medallion may return in Chapter 5.
6. **Native Khmer review** before ship (§7). I cannot self-certify this.
7. **The refund/replacement wording** for the trust block — your policy, your
   words.
8. **The four honesty problems already live** (§1.4). Fix on `main` separately,
   or let v3 quietly drop them from the homepage while `/esim` keeps them?
9. **Branch.** Your prompt says `homepage-v3`; my session is pinned to
   `claude/domner-homepage-v3-0roqs5`. I am on the pinned branch unless you say
   otherwise.

I can start §12.5 — the isolated search-and-fly prototype with measured
numbers — on decisions 1–5 alone. 6–8 are needed before anything ships.
