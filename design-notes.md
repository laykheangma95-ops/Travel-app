# Design notes — homepage v3

Two halves: **why the page is the way it is**, and **what was considered and
rejected**. The second half is the more useful one.

---

# Part one — why each decision exists

## Why each interaction exists, and what it is for

**The first screen has one control.** A greeting, a question, one quiet line, one
field. Every removal was deliberate: no badge, no stat chips, no second CTA, no
cart, no nav links. The emotion is *arrival somewhere calm* — the feeling of a
made bed rather than a shop window. The practical effect is that there is nothing
to decide except the only decision that matters: where are you going.

**The globe carries a real day/night terminator.** This is the one visual choice
worth defending at length. A rotating globe with glowing arcs is what Airalo,
Holafly and Nomad all ship — it is the house style of the category, and looking
different by degrees is not looking different. So the arcs came off, and the
terminator went on: the sun's actual subsolar point, computed from the clock,
lighting the half of the world where it is currently daytime. It costs about
twenty lines of arithmetic and zero bytes. It changes what the globe *is*: not a
decoration of connectedness but an instrument that tells you something true. You
are greeted with "good evening" and Tokyo is visibly already in daylight.

**Search suggestions say why they rank.** "Tokyo · one stop from Phnom Penh ·
visa required" answers the question before you have finished asking it. Invisible
popularity weighting is indistinguishable from no weighting at all.

**The flight is one continuous motion, not two.** The rotation leads and the
descent overlaps it by seven hundred milliseconds, so it reads as a single
gesture rather than "turn, then zoom". The lens narrows 38° → 31° on the way
down, which is what makes it feel like approach rather than magnification. The
emotion is *departure* — the small lift in the chest when the aircraft actually
moves.

**The seam is a colour.** At the end of the flight the globe's atmosphere blooms
and crosses to the destination's `arrival.skyColor`, and the destination artwork
is drawn on exactly that colour. The horizon simply continues. There is no
cross-fade because there is nothing to cross — and a cross-fade is precisely the
seam that would break the illusion.

**The instrument strip stays with you.** The destination's local time keeps
ticking at the top of the screen for the entire read. The place is *running*
while you learn about it. This is a small thing that does a large amount of work:
it converts a page about a city into a window onto one.

**The recommendation shows its arithmetic.** Not in a tooltip — as the body of
the card. Five line items, each with its own daily rate, each switchable, and the
total recomputes underneath you. The emotion is *being advised rather than sold
to*, and the mechanism is simple: you can only trust a number you are allowed to
interrogate.

**The returning visitor gets a memory, not a button.** The brief asked for an
unobtrusive way for someone who already knows what they want to skip the story.
Adding a second CTA would have broken the one rule the first screen exists to
keep, so instead the *search field* — the only control there is — learns. One
quiet text link appears six hundred milliseconds after the first frame settles;
typing a destination we sell puts the eSIM as the last suggestion row, two taps
from keystroke to checkout. A first-timer never sees any of it.

## Which real travel problem each chapter solves

| Chapter | The actual problem |
| --- | --- |
| **1 · Arrival** | "Is it night there? Do I need a jacket?" — the two things you check before anything else, answered before you ask. |
| **2 · The basics** | Arriving unable to convert prices in your head. Three real local prices beat any exchange-rate widget: a bowl of ramen is ¥900 and that is $6. |
| **3 · Getting in** | The one that matters. A Cambodian passport holder cannot use a generic visa page — the answer is different for them, and getting it wrong means being turned around at a counter having already paid for the flight. |
| **4 · Getting around** | The airport-exit tax: not knowing what the train costs means taking the ¥20,000 taxi. And "will my ABA card work?" is a question no international travel site answers. |
| **5 · Why you go** | Trip regret — the thing you find out about after you get home. |
| **6 · The eSIM** | Landing with no connection, in a country whose language you do not read. Placed last because by then it is obviously the next thing to do. |

Chapter 3 carries the most design care because it carries the most consequence.
Every fact in it shows its verification date and a link to the official source on
the face of the card. Facts that genuinely move — Thailand's entry rules have
changed repeatedly since 2025 — are marked `volatile` and render a
confirm-before-you-book prompt instead of a confident number.

**Being visibly unsure about a genuinely unsettled fact is more useful than being
confidently wrong**, and it is the only honest thing to do when sources disagree.

## Why someone remembers this page a week later

Not because of the globe. Because of one of these:

- They learned the land border with Thailand is closed and their bus plan was
  never going to work.
- They found out Japan needs a visa arranged through an agency, weeks ahead —
  before booking a non-refundable flight.
- They discovered they can tap their ABA card straight onto the Singapore MRT.
- They saw a Cambodian embassy phone number in a foreign city, on a page that
  was not asking them for anything yet.

A page is remembered for what it *told* you, not what it looked like while
telling you. The design's job is to make those four things feel like a gift
rather than a form.

## Why this is structurally different from Airalo, Nomad and Holafly

"We have a nicer globe" is not a difference — anyone can hire a WebGL developer.
Here is what they structurally cannot copy, and why.

**1. The advice is passport-specific, and their audience is not.**
Airalo sells to everyone on earth. That is a strength for distribution and a
permanent, structural weakness for content: a page that must serve a German, a
Nigerian and a Cambodian simultaneously can only ever say "check your visa
requirements". We serve one passport. `entry.forPassport: 'KH'` is a field in our
schema and cannot be a field in theirs, because the moment they add it they owe
190 versions of every destination page. **The specificity that makes our content
valuable is exactly what their market size forbids.**

**2. Khmer that reads like Khmer.**
Not a translation layer — the source content is authored bilingually and the type
system refuses to build if a Khmer string is missing. Latin and Khmer are paired
by unicode range so Latin words inside Khmer copy keep their own typeface and
metrics. A global competitor localises into forty languages by machine and
reviews none of them; the economics do not permit anything else. For us, Khmer is
not a locale, it is the product.

**3. Facts nobody else has a reason to gather.**
Whether KHQR works at Vietnamese merchants. Whether an ACLEDA card is accepted in
Tokyo. Where the Cambodian embassy in Seoul is. These are not hard to find — they
are *unprofitable* to find for a company selling to everyone. There is no version
of Airalo's roadmap where "Cambodian card acceptance in Malaysia" reaches the
top of the backlog.

**4. Dated, sourced facts as a design commitment.**
Every curated claim renders its verification date and its official source. That is
a content-operations promise, not a feature — it means somebody has to re-verify
on a schedule. Competitors avoid it precisely because it is expensive and creates
an obligation. Once we display the date, "we haven't checked this in eight
months" becomes visible to the customer, which is the whole point.

**5. The order of the page.**
They sell a SIM and then, if you scroll, tell you about the country. We answer
the country and then, at the end, mention that you will need internet. That
ordering is not a layout choice, it is a business model choice: it only works if
the guide is good enough to be worth publishing on its own. A company whose
content is a thin SEO layer over a store cannot invert the order without exposing
that the content is thin.

The globe is not the moat. The globe is the reason someone stays long enough to
find the moat.

---

# Part two — directions considered and rejected

## Rejected on the globe

**Keeping the arcs, but quieter.** The first instinct, and wrong. Dimming the
thing every competitor does is still doing the thing every competitor does.
Replaced with the terminator.

**A full Google-Earth descent to street altitude.** Rejected on honest grounds:
the globe is ~20,000 dots over the whole planet, roughly one per 25,000 km². Fill
the screen with Japan and you are looking at about sixty dots — it would look
*worse* the closer it got, the exact inverse of the reference. Instead the camera
stops at regional altitude and a local LOD patch (~6,000 extra dots generated
from the same bitmask, in time-boxed slices, zero bytes over the network) fades
in on approach, so detail *gains*.

**Rewriting the globe.** Considered and firmly rejected. The existing engine's
procedural dot field driven by a bitmask is genuinely good work and is the reason
the 3D layer fits any budget at all — a textured globe would have cost more than
everything else on the page combined. What it lacked was a camera; it has one
now.

**Fixing the sun in world space.** Simpler to implement and would have looked
similar: the terminator would sweep across the geography as the globe turned.
Rejected because it is a lie — the lit hemisphere would no longer correspond to
where it is actually daytime. The sun is now pinned to real geography and
transformed by the spin group each frame, which is how a physical globe under a
fixed lamp behaves.

## Rejected on structure

**Keeping the Cambodia showcase and the mini-globe companion.** Both are nicely
made. Both are a second and third focal point on a page whose entire argument is
that there is one. Removed from `/`; the files are still there.

**A "Surprise me" or "explore" control.** A second CTA by another name. The brief
said one thing to do and meant it.

**A hard route change on search.** Would have been far less code. Would also have
produced the white flash that kills the whole illusion. The journey lives in one
mounted tree with `pushState`; `/destination/[slug]` exists separately for links,
shares and crawlers, rendering the identical chapters.

**Auto-generating thin guides for all twenty eSIM countries.** Tempting for
coverage. Rejected because thin coverage of everywhere is precisely the
competitor smell this page exists to escape. Seven cities, properly. Everywhere
else degrades honestly and says so.

## Rejected on content

**Safety scores.** No honest source. Cut.

**Live travel alerts.** No authoritative machine-readable feed for a Cambodian
audience. Replaced with a visible "reviewed on ⟨date⟩" — a truthful freshness
signal instead of a fake live one.

**"Trending on TikTok right now."** Explicitly requested, and cut. TikTok has no
public trends API; anything asserted would be invented and would age in weeks.
Reframed as a dated *"popular with Cambodians"* category — honest, still
culturally specific, still nothing a global competitor has.

**Frankfurter / ECB for exchange rates.** The obvious no-key choice, and wrong:
the ECB reference set carries neither KHR nor VND, so it would silently break Da
Nang, Ho Chi Minh City and the entire riel conversion — the one number this
audience most needs. `open.er-api.com` covers both.

**Picking a number for Thailand's visa-free stay.** Sources disagree between 7,
14 and 30 days, and the rule has moved repeatedly since 2025. Asserting one would
have been the single most likely way to get a real traveller turned around at a
border. Marked `volatile` instead, with the embassy link.

**A trust bar with payment-provider logos.** Unearned, and a brand-usage risk.
The trust block is built only from things that are true, with the refund wording
taken verbatim from the actual published policy rather than written fresh.

**Keeping the testimonials.** Three invented customers with full names and
quotes, plus "thousands of Cambodian travelers", were live on the site. They are
gone. This was not a v3 requirement; it was a correction.

## Rejected on craft

**GSAP on this page.** Already a dependency, and still removed: three.js plus
GSAP core plus ScrollTrigger overruns the 200KB budget for the 3D layer, and the
camera needed a hand-written easing regardless. Replaced by ~1KB of tween
utilities in `lib/motion.ts`. GSAP stays on the flight pages.

**`import * as THREE from 'three'`.** Measured: webpack emits the library's full
export barrel as its own chunk, 87KB gzipped of pure re-export glue on top of
100KB of implementation. Re-exporting only the twenty-seven symbols the app
actually uses brought the 3D layer from ~187KB to ~160KB gzipped, and now a
missing symbol fails the build rather than silently re-inflating the bundle.

**Real photography.** The strongest rejection to argue with, and the one most
worth revisiting. Drawn SVG scenes were chosen because they cost zero bytes on a
Cambodian mobile connection, carry no licensing risk, and — decisively — can be
drawn *on* the destination's sky colour so the flight lands into the artwork.
A photograph would have to be cross-faded over it. The schema keeps an optional
`photo` field; if photography is commissioned, whatever replaces the drawing must
preserve the sky handoff.

**Three font families.** The design system says three; this is four. The rule was
written from a Latin-only point of view: `body.lang-km` used to swap the *entire*
font, so Latin words and every numeral inside Khmer copy rendered in Noto Serif
Khmer's Latin — a different design at a different metric — and headings lost
Marcellus altogether. Sans now pairs with sans and serif with serif, split by
unicode range. Cost: one extra Khmer-range subset, with weights trimmed to what
actually renders.

**Letting the globe spin at 60fps while idle.** It completes one revolution every
ninety seconds. Nobody can tell 20fps from 60 at that speed, and halving the
frame rate halves the work for the entire time someone is reading the question
and typing an answer.

---

## Known limitations, stated plainly

1. **The Khmer needs a native speaker's review before this ships.** It is
   grammatical; it may still read like translated English, which is exactly the
   failure §7 of the brief was about. This cannot be self-certified.

2. **The live layer could not be verified end-to-end in this environment** — the
   sandbox blocks the weather and rate providers. The degradation path *was*
   verified: both return null and the UI omits those panels rather than guessing.

3. **Open-Meteo's free tier is non-commercial.** Before production traffic,
   either subscribe to their commercial plan or swap the provider. The header of
   `lib/live/weather.ts` is the only place that needs to change.

4. **The eSIM catalogue cannot express the brief's example plan.** The brief
   imagined "8 days, 10GB". Japan's SKUs are 3, 7 and 15 days, so an eight-day
   trip is recommended the 15-day plan. The card behaves correctly given the
   catalogue; the catalogue is what limits it.

5. **Total blocking time is still ~2.9s on a throttled mobile profile.** Down
   from 17.8s, but WebGL on a mid-range phone is inherently expensive. If it
   needs to go lower, the next lever is not starting the globe until first
   interaction — which costs the moment the page is built around.
