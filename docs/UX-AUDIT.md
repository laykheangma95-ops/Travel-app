# Domner — Product & UX Audit

**Date:** 2026-08-02 · **Scope:** every user-reachable route · **Author:** product review

---

## 0. Executive summary

The honest headline: **this is not an eSIM website that needs to become a travel
platform. It is already a travel platform whose funnel is better than its
surface.** Flight tracking, an airport board, arrival guidance, an emergency
phrasebook, a trip copilot, a checklist and an affiliate programme all exist and
work. The design system (`.claude/skills/ui-ux`) is unusually well specified, and
the eSIM funnel — store → country → checkout → cart — already carries the
night-sky concept end to end.

So the opportunity is **not a rebuild.** It is that the product violates its own
written standard in a small number of specific, high-traffic places, and that the
"travel platform" story collapses at exactly one point: the destination page.

Three findings dominate everything else:

1. **The chrome contradicts the product.** A white navigation bar sat on top of
   every night-sky page. The single most-seen component on the site was the one
   that broke concept continuity — the rule the design system calls the one that
   outranks the rest.
2. **Gold is unreadable wherever it is a button.** 18 places put white text on
   the Angkor Gold fill. That is **2.6:1** — a WCAG AA failure on the primary
   call to action, repeated across the funnel. `components/ui/Button.tsx` already
   documents the correct rule; the violations are all hand-rolled buttons that
   bypassed it.
3. **There is no destination guide.** `/esim/[country]` is a price list wearing a
   destination page's URL. The `Destination` type carries `usdRate` and
   `networks` and nothing a traveller is actually anxious about. This is the gap
   between "eSIM shop" and "travel platform", and it is a content problem, not a
   design problem.

Below: per-surface audit, then the journey map, then what was changed in this
pass and what deliberately was not.

---

## 1. Scoring method

Each surface is scored /10 against the four metrics in the brief — **Trust,
Simplicity, Delight, Conversion** — and against the repo's own award-readiness
checklist. A screen that is *pretty but unusable* scores lower than one that is
*plain but honest*, because the checklist weights usability at 30%.

---

## 2. Per-surface audit

### 2.1 Homepage — `app/page.tsx` → `components/home/HomeContent.tsx`

**Score: 8.5/10.** The strongest surface on the site and genuinely close to
award standard.

What is already right: one shared 3D globe spanning hero and Cambodia showcase
via `.dgh-stage`; a continuous `.night-canvas` below it so energy never drops;
constellation "how it works"; boarding-pass testimonials using the `.ticket-notch`
seam; `Reveal` entrances on the shared easing; reduced-motion fallbacks present.

**Problems**

| Problem | Why it matters | Business impact |
| --- | --- | --- |
| Testimonials are hardcoded in the component with no source | "Domer · Verified" is asserted, not evidenced. Fabricated-looking social proof is worse than none for a first-time buyer sending money abroad | Trust ceiling on first purchase |
| Flags are emoji (`🇻🇳`) rendered in `WavyFlag` | The design standard explicitly calls emoji "unfinished" for hero surfaces. Emoji flags also render inconsistently on Windows and some Android builds | Perceived quality; inconsistent brand |
| `hero.stat1` claims "150+ Countries" | The store behind it lists 21 (see §2.3) | Credibility gap at the moment of intent |
| No route transition into `/esim` | Navigation is a hard cut; the standard asks for a continuous surface | Delight |

**Psychology.** The homepage sells *competence*. A Cambodian traveller flying
internationally — often for the first time — is buying reassurance, not
megabytes. The globe earns that. Unverifiable testimonials quietly spend it.

**Recommended:** attribute testimonials to real orders (even "Verified purchase ·
Jul 2026"); replace emoji flags with an SVG flag set; reconcile the 150+ claim.

---

### 2.2 Navigation — `components/layout/Navbar.tsx`

**Score before: 3/10. After this pass: 7.5/10.**

This was the worst surface on the site, and the most seen.

**Problems found**

1. **White bar over a dark app.** `bg-white/85` sat above `.night-canvas` on
   home, `/esim`, `/esim/[country]`, checkout, `/cart`, `/flights`, `/track`,
   `/airport-board`. The most-viewed component broke the concept everywhere.
2. **Dropdowns were keyboard-inaccessible.** They opened on `onMouseEnter` only.
   The trigger was a `<button>` carrying `aria-expanded`, but had **no click or
   key handler** — so a keyboard user could focus it, press Enter, and nothing
   happened. Three of four nav groups were unreachable without a mouse.
3. **No Escape, no click-outside dismissal.**
4. **White on gold** on the "Get started" CTA (2.6:1) and on the cart badge —
   which is 11px bold, the worst possible place for it.
5. **Two menu items pointed at the same URL.** "Buy eSIM" and "Destinations"
   both went to `/esim`, spending a menu slot to offer the same page twice.

**Psychology.** Navigation is where a user forms their model of what a product
*is*. A menu that offers the same page twice reads as an org chart, not a
product. A bar in a different palette than the page reads as a template.

**Business impact.** Every session touches this component. Keyboard
inaccessibility here is also the clearest legal exposure on the site.

**Fixed in this pass:** surface-aware bar (night on the 6 night route families,
light on dense utility screens — the documented exception); real click toggle
plus Escape and outside-pointer dismissal; focus-visible rings on every control;
dark ink on all gold fills; deduplicated menu; 44px language toggle.

**Still open:** no active-route indicator; no shared-element transition between
routes.

---

### 2.3 eSIM store — `app/esim/page.tsx`

**Score before: 6/10. After: 8/10.**

**Problems found**

| Problem | Root cause |
| --- | --- |
| **An entire region was unreachable.** `FILTERS` was hardcoded and had drifted from the data: it listed `Middle East` but omitted `Oceania`, so the Oceania destination could not be surfaced by any filter | Hand-maintained list duplicating a fact the data already knows |
| A submit button next to a live-filtering search | Implies results will not update until pressed — teaches the user to distrust what they see |
| `role="tablist"` / `role="tab"` with no tabpanels | Promises a screen reader a structure that does not exist |
| Empty state's "Clear search" linked to `/esim` | Filters are client state — the link left both exactly as they were. **The recovery action did not recover** |
| No result count | Filtering gave no confirmation the list responded |
| "Instant data for 150+ countries" directly above 21 cards | Self-contradicting at the point of choice |

**Psychology.** Choosing a destination is the first commitment. Every element of
uncertainty here — a dead filter, a search that might not have run, a number that
does not match what is on screen — is withdrawn from the confidence the user
needs at checkout.

**Fixed:** filters derived from `data/destinations.ts` so they cannot drift again;
removed the redundant submit; toggles now use honest `aria-pressed` semantics;
live `role="status"` result count; empty state genuinely resets search and region
and points to Khmer support for missing destinations; heading states the real
catalogue size.

---

### 2.4 Destination page — `app/esim/[country]/page.tsx`

**Score: 5/10. This is the single biggest product gap on the site.**

The route is named for a destination and delivers a price list. `PlanCard`s, a
customs note, a device checker, install steps, FAQ. All useful. None of it is a
*destination guide*.

The data model says it plainly — `types/index.ts`:

```ts
export interface Destination {
  slug; name; nameKm; flag; region;
  fromPriceUsd; networkQuality; networkTech; networks;
  currency; usdRate; popular;
}
```

Every field is either an identifier or a telecom/pricing attribute. **There is no
field a traveller is anxious about.** Not one: no timezone, no plug type, no
typical arrival-taxi cost, no "is tap water safe", no visa-on-arrival duration, no
airport transfer, no common scam, no emergency number.

The irony is that **the app already has this content** — `data/scamAlerts.ts`,
`data/emergencyPhrases.ts`, `data/customsRules.ts`, `data/airportGuides.ts` — it
is just parked on separate utility pages (`/emergency`, `/airport-guide`) that a
buyer has no reason to visit while choosing a country.

**Why it matters.** The stated mission is "users should feel they are preparing
for an international trip, not shopping online." This page is the only one where
that could be true, and it is the page that shops hardest.

**Business impact.** A destination guide is the organic-search asset. "Japan eSIM"
is a query with three competitors bidding; "What plug does Japan use / is tap
water safe in Japan" is a query that brings a traveller in weeks earlier — and
the eSIM sells itself once they are on the page. Today the site ranks only for
the hardest, most expensive query.

**Recommended (not implemented — see §5):** extend `Destination` with a
`guide` block (timezone, plug, currency-in-practice, water, transport-from-
airport, one scam warning, emergency number, best-months); render it *above* the
plans; pull the existing `scamAlerts`/`emergencyPhrases`/`customsRules` in by
slug rather than duplicating them. This is a content project, not a design one,
and it is the highest-value work on this list.

---

### 2.5 Checkout — `app/esim/checkout/page.tsx`

**Score: 7.5/10.** Better than most of the site, and the engineering behind it is
genuinely careful.

Already right: night canvas maintained; idempotency key generated per visit, not
per submit, so a retry cannot double-charge; **no prices sent from the browser**
(the server re-derives every figure — `lib/pricing.ts`); phone required only when
the delivery channel needs it; sticky order summary; KHR conversion shown; locked
components repainted via `.night-locked-surface` without editing locked files.

**Problems**

| Problem | Why it matters |
| --- | --- |
| No trust row near the pay button | "Secure payment · QR delivered within 15 minutes" is one 12px grey line at 50% opacity, below the fold on mobile. The strongest reassurance is the least visible thing on the screen |
| No progress indicator | The user cannot see how much is left. Single-screen checkout is right; *unmarked* single-screen checkout reads as open-ended |
| "Special Notes (optional)" textarea | An open text box in a payment flow invites a message no system will read. It adds decision cost and creates a support expectation nobody owns |
| Device Type defaults to iPhone | Reasonable, but silently wrong for most Android users in the market; "Not sure" would be a safer default than a wrong confident one |
| Payment error is a red box that does not move focus | A screen reader user may never learn the payment failed |

**Psychology.** This is peak anxiety: money leaving, abroad, in a second
language. Every gram of reassurance belongs *adjacent to the pay button*, which
is the only element the user is looking at.

**Recommended:** promote refund/support/delivery guarantees to a visible row
beside the CTA; delete or justify the notes field; move focus to the error on
failure.

---

### 2.6 Order confirmation — `app/order-confirmation/[id]/page.tsx`

**Score before: 4/10. After: 8/10.**

**Problems found**

1. **A white page at the emotional peak of a dark funnel.** The user pays on a
   night canvas and lands on `bg-white` / `text-ink`. The moment the product
   should feel most itself, it looked like a different site.
2. **Framer-motion animations with no reduced-motion fallback.** A spring scale-in
   plus four staggered reveals, unconditionally. This is a hard gate in the
   design standard and it was the one page that ignored it.
3. Generic green success tick — the same tick as every SaaS checkout, on a brand
   whose entire identity is a rare gold accent.
4. Three equal-weight outline buttons — no primary next action.

**Psychology.** This screen sets the tone for the entire waiting period before
the QR arrives. Its job is not "transaction complete", it is **"you are handled."**

**Fixed:** night canvas with starfield; gold seal in place of the generic tick;
`useReducedMotion` honoured throughout with a genuinely static fallback; locked
`TelegramConnectCard` repainted via the sanctioned `.night-locked-surface`
wrapper; dark ink on the gold seal; copy rewritten from
"Your eSIM is Being Prepared!" to "Your eSIM is being prepared" (the exclamation
mark was doing work the design should do).

**Still open:** no calendar/reminder hook for "install before you fly"; no
countdown to departure; order number is not copyable in one tap.

---

### 2.7 Loading & error states — **app-wide**

**Score before: 1/10. After: 5/10.**

This was the largest structural omission found. Before this pass the repository
contained:

- **Zero `error.tsx` files.** Any thrown render error anywhere in the app fell
  through to Next's default unstyled error page.
- **Zero `loading.tsx` files.** No route in the App Router streamed a placeholder.
- A `Skeleton` component that was **light-surface only** (`bg-surface-3`,
  `bg-white`) — structurally unusable on the night canvas, which is most of the
  funnel. The skeletons existed and could not be used where they were needed.

**Why it matters.** These are not polish. On a mid-range Android on Cambodian
mobile data — the actual target device and network — the gap between tap and
paint is exactly where trust is won or lost. An unstyled grey error page after a
payment attempt is the worst screen the product can show.

**Fixed:** `app/error.tsx` (branded night boundary, recovery action, error digest
shown for support, logs without importing the server-only logger into a client
component); `app/esim/loading.tsx` (layout-matched skeleton, `aria-busy` +
screen-reader announcement); `app/(dashboard)/loading.tsx` (light variant, no
dark-to-light flash); `Skeleton` gained a `dark` variant and a
`DestinationGridSkeleton`.

**Still open:** no `loading.tsx` for `/flights/[flightNumber]`,
`/esim/[country]`, `/airport-board/[code]` — all data-dependent and all worth
having. No `global-error.tsx`.

---

### 2.8 Account / dashboard — `app/(dashboard)/*`

**Score: 5.5/10.**

Light surface here is **correct and documented** — dense data screens are the
sanctioned exception. The problems are IA and contrast, not palette.

| Problem | Detail |
| --- | --- |
| **Two sidebar items land on the same page** | "Memories" → `/trips` → `redirect('/my-trips')` → which is also "My Trips". The Memories feature genuinely exists at `/trips/[tripId]/memories` and is unreachable from the sidebar |
| **Mobile bottom tabs fail contrast** | Active tab is `text-accent` (#C69749) on white at **10px** — 2.6:1 against a 4.5:1 requirement. The smallest text on the site uses the least readable colour |
| Entire dashboard is hardcoded demo data | `upcomingFlights`, `activeEsims`, `upcomingTrips` are literals. Honest as a placeholder, but there is no empty state — a real new user with no trips will see someone else's Bangkok weekend |
| No empty states anywhere in the dashboard | The first-run experience is the most important one and it is unrepresented |

**Psychology.** The dashboard is the returning-user surface — the thing that makes
this a platform rather than a shop. Showing fake data to a real user is a
one-time, unrecoverable trust event.

**Recommended (not implemented):** fix the Memories route; darken the active tab
to `text-secondary` or a darker gold; build the three empty states *before*
wiring Supabase, because the empty state is what a new user actually sees.

---

### 2.9 Flight tracker — `app/flights/page.tsx`

**Score: 7/10.** The "Flight Guardian" orb and copy are the best writing on the
site — *"Domer tells you before the airport screens do"* is a real promise.

**Problems**

1. **A third dark-surface recipe.** This page hardcodes
   `bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_45%,#23406A_100%)]` rather than
   using `.night-canvas`. The site now has three ways to be dark — `.dgh-stage`,
   `.night-canvas`, and this literal — which is exactly the token drift the
   standard forbids. Also present in `/track/[token]` and `/airport-board/[code]`.
2. White on gold on the Track button (**fixed** this pass).
3. The combobox has `role="combobox"` and `aria-expanded` but **no
   `aria-activedescendant` and no arrow-key navigation** — the suggestion list is
   mouse-only. Options are also hardcoded `aria-selected="false"`.
4. Suggestions dismiss via `onBlur` with a 150ms `setTimeout` race.

**Recommended:** replace the literal gradient with `.night-canvas`; add arrow-key
navigation to the combobox.

---

### 2.10 Remaining surfaces — summary

| Surface | Score | Headline finding |
| --- | --- | --- |
| `/cart` | 7/10 | Night canvas held; no "you might also need" for multi-country trips |
| `/checklist` | 6/10 | Genuinely useful; light surface breaks funnel continuity; emoji section icons (`✈️ DAY OF FLIGHT`) where the standard asks for real art |
| `/airport-guide` | 6/10 | Strong content, light surface, three white-on-gold failures (**fixed**) |
| `/emergency` | 7/10 | Best *product* idea on the site. Buried under a "Tools" dropdown — this is a headline feature hidden as a utility |
| `/my-esims` | 5/10 | Demo data, no empty state |
| `/affiliate` | 6/10 | Reachable only via a nav item labelled "Support", which is not what it is |
| `/admin/*` | 7/10 | Appropriately utilitarian; correctly gated |
| `/(legal)/*` | 7/10 | Present and complete — genuinely good for trust |
| `/not-found` | 6/10 | Branded but light-surface |
| `/apsara-hero` | — | A standalone experiment excluded from nav; decide whether it ships or goes |

---

## 3. The journey, end to end

```
Landing ──▶ Search ──▶ Destination ──▶ Guide ──▶ Plan ──▶ Checkout ──▶ Pay ──▶ Trip ──▶ Use ──▶ Return
  8.5        8.0          5.0          MISSING   7.5       7.5        ok      5.5      —        4.0
```

**Where the journey actually breaks**

1. **Guide is missing entirely** (§2.4). The step the mission depends on does not
   exist as a product surface.
2. **Post-purchase is a dead end.** After confirmation the user is offered
   "Add to your trip", "Track your flight", "Contact support" — three links, no
   default. Nothing *automatically* connects the eSIM they just bought to a trip.
   The platform knows the destination and can infer the dates, and asks anyway.
3. **Return has no trigger.** Nothing brings a traveller back. No "your Thailand
   eSIM expires in 2 days", no "you flew to Bangkok in July — going again?" The
   `useNotifications` hook and Telegram channel both exist; neither is used for
   retention.
4. **Use-the-eSIM is unrepresented.** Between "QR delivered" and "trip over"
   there is no surface at all — no data-remaining view driven by real data, no
   in-country help. `/my-esims` is demo data.

**Highest-leverage sequencing:** guide (2.4) → post-purchase trip auto-creation →
expiry/return triggers. In that order, because each one feeds the next.

---

## 4. Changed in this pass

All changes are repairs to violations of the repo's own documented standard —
not a redesign.

| # | Change | Metric |
| --- | --- | --- |
| 1 | White-on-gold contrast fixed in **13 places across 10 files** (2.6:1 → 6.4:1) | Trust · Accessibility |
| 2 | Navbar: night/light surface awareness | Trust · Delight |
| 3 | Navbar: keyboard-operable dropdowns, Escape, outside dismissal, focus rings | Accessibility |
| 4 | Navbar: deduplicated menu, 44px targets, accurate cart label | Simplicity |
| 5 | `app/error.tsx` — first error boundary in the app | Trust |
| 6 | `app/esim/loading.tsx`, `app/(dashboard)/loading.tsx` — first loading states | Delight · Conversion |
| 7 | `Skeleton` night variant + `DestinationGridSkeleton` | — |
| 8 | Confirmation page onto the night canvas, gold seal, reduced-motion honoured | Delight · Trust |
| 9 | Destination card CTA visible on touch (was `opacity-0` until hover) | **Conversion** |
| 10 | `/esim` filters derived from data — Oceania was unreachable | Conversion |
| 11 | `/esim` empty state actually clears search and filters | Simplicity |
| 12 | `/esim` live result count, honest catalogue size, removed dead submit | Trust · Simplicity |

**Verification:** `npm run typecheck` and `npm run build` both pass. No locked
file was modified.

---

## 5. Deliberately not done

Flagged rather than actioned, with reasons.

**Needs the owner's decision — locked files.** Two white-on-gold contrast
failures sit inside `docs/LOCKED.md` files and were left untouched:

- `components/auth/AuthCard.tsx:149` — primary auth submit button
- `app/(auth)/forgot-password/page.tsx:66` — submit button

Both are `bg-accent … text-white` at 2.6:1. The fix is one class each
(`text-white` → `text-primary-deep`), changes no logic, and touches no
authentication behaviour or invariant. **It still needs explicit per-change
sign-off** under the locked-area procedure. Recommend approving it — these are
the sign-in buttons, so they are among the most-seen controls on the site.

**Needs a commercial decision.** The "150+ countries" claim remains in
`app/layout.tsx` metadata and `lib/i18n.tsx` (`hero.stat1`, both languages). The
supplier catalogue may genuinely cover 150+ even though `data/destinations.ts`
curates 21 — that is a business fact, not a code fact. Either expand the
catalogue or align the claim; do not leave the store page contradicting the hero.

**Needs content, not code.** The destination guide (§2.4). Writing it as
placeholder lorem would be worse than its absence.

**Deliberately out of scope.** "Upgrade every screen" as literally specified
conflicts with "do not rebuild everything" and "do not remove working features."
Rewriting 40 routes in one pass, with no test suite covering UI and no staging
environment, would risk regressions in a payment funnel that currently works, in
exchange for changes nobody has validated. The audit above identifies what each
screen needs; the sequencing in §3 is the recommended order.

---

## 6. Where the ecosystem is already load-bearing

Judged against the stated future — AI assistant, trips, wallet, rewards,
planning, community:

- **AI assistant:** `TripCopilot` + `lib/domnerBrain.ts` + `intentClassifier` +
  a trained `intentModel.json` already ship. Further along than the brief assumes.
- **Trips:** routes and a memories feature exist; not wired to purchases.
- **Rewards:** the affiliate programme is a referral primitive already tracked
  through checkout (`cart.referralCode`).
- **Wallet:** the closest thing is `esim_deliveries`; no balance concept.
- **Community:** nothing yet, and correctly so — it is the last thing to build.

The architecture supports the ten-year story. What is missing is the connective
tissue between purchases and trips, which is also the fix for the journey's two
dead ends in §3.
