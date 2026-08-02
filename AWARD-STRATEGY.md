# Domer — Global Design Award Strategy

A prioritized plan to take the Domer travel app from a strong hero to a
credible **Awwwards Site of the Day / CSS Design Awards / FWA** submission.

This is a strategy document. It does **not** change app code — it's the brief
for the work that would.

---

## Where we already stand

Most sites that *win* don't ship what this app already has:

- **A real Three.js particle globe** — ~20k dots mapped to true Natural Earth
  landmass, custom GLSL (fresnel atmosphere, dot flicker, arc pulses, hub
  beams), drag-to-spin with inertia, gyroscope parallax, and a scroll scrub.
  (`components/home/GlobeHero.tsx`)
- **A 3D liquid-glass destination ring** rotating in real perspective space.
  (`components/home/CambodiaShowcase.tsx` + `app/globals.css`)
- **A disciplined brand system** — Temple Night / Angkor Gold tokens, Khmer
  bilingual typography, Apple-grade liquid-glass buttons with pointer-tracked
  speculars, and `prefers-reduced-motion` respected everywhere.

That is already an ~8/10 hero. **Awards are not lost on the hero — they are
lost on everything after the fold.** That's where the next award lives.

---

## The jury's scorecard

Awwwards weights submissions roughly:

| Criterion   | Weight | Our standing |
|-------------|:------:|--------------|
| Design      |  40%   | Leaks — the site drops out of its dark world below the fold |
| Usability   |  30%   | Solid foundation; needs transitions + state polish |
| Creativity  |  20%   | **Strong** — the globe crushes this |
| Content     |  10%   | Under-told — the concept/story isn't surfaced |

The globe wins Creativity. We leak on the other three because the site
**leaves its own world** once you scroll or navigate. Every move below closes
one of those leaks.

---

## The five moves, ranked by award-ROI

### 1. Globe-driven page transitions — *highest impact*
`framer-motion` is installed but used in only two files; route changes are
currently a hard white cut that breaks the spell instantly.

- Adopt the **View Transitions API** (native, cheap) for cross-fade +
  shared-element morphs between routes.
- Make the **globe the transition device**: leaving home zooms the globe into
  the destination country, and the target page resolves out of that zoom. The
  globe becomes the app's connective tissue, not just a hero prop.

*Why it scores:* turns a hero into a **system** — a single jury talking point.

### 2. One true "trip board" bento section
The current home grids are uniform (`md:grid-cols-3`, `lg:grid-cols-4`) —
that's a grid, not a bento. Build one **asymmetric** signature section where
each tile is a live micro-experience:

| Tile | Size | Content |
|------|------|---------|
| Route map | 2×2 | live mini-globe with the user's route arc |
| Flight status | wide | animated boarding-pass strip |
| eSIM meter | tall | data allowance filling in real time |
| Local time | small | destination clock + weather |
| Khmer phrase | small | phrase of the day, tap-to-hear |

Each tile reuses the existing `liquid-touch` reaction on hover.

*Why it scores:* this is the screenshot that sells the submission.

### 3. Commit to a single world end-to-end
Hero and CTA are Temple Night; everything between reverts to light
`bg-surface-2`. That whiplash reads as "template beneath a beautiful hero."
**Pick the night.** Carry the starfield, gold speculars, and atmosphere
*through* the scroll; use light only as a deliberate contrast beat.

*Why it scores:* fixes the biggest **Design** leak.

### 4. Scroll-pinned arc narrative
Pin the globe and let arcs **draw themselves Phnom Penh → destination** as the
user scrolls the "How it works" steps. GSAP ScrollTrigger is already wired —
this is one scene away.

*Why it scores:* the **Creativity / Innovation** moment for FWA & CSSDA.

### 5. The finishing 2%
- **Custom cursor** — a gold reticle that becomes a compass/plane over
  interactive zones.
- **Opt-in sound** — a soft boarding chime on CTA, a wind swell on the globe.
  Audio plumbing already exists in `app/emergency/page.tsx`. Toggle-gated.
- **Liquid ripple** — extend the existing `liquid-press` overshoot so gold
  buttons ripple like actual liquid on release (SVG turbulence/displacement).
- **Globe assembly loader** — have the globe *assemble* from scattered dots as
  the Domer splash finishes, instead of a plain fade-in.

---

## Usability & content — the quiet 40% most designers skip

Juries dock hard here even on gorgeous sites:

- Polished **empty states, focus rings, keyboard nav** — held to the same bar
  as the hero. (Reduced-motion discipline is already a genuine differentiator;
  keep it.)
- A **submission story.** Awards reward *concept*, not just polish. The
  Phnom-Penh-centric arc data already tells one:

  > *"The app that connects you before you land — a living map of one
  > Cambodian's journey out to the world."*

  Lead with that narrative in the written submission.

---

## The path

- **Moves 1–3** → a credible **Site of the Day** submission.
- **Add moves 4–5** → an argument for **Site of the Month / Developer Award**,
  because the tech story (custom shaders + View Transitions + WebGL narrative)
  is exactly what FWA and CSSDA reward.

---

*Prepared as a design-jury assessment of the current build. No application
code was modified.*
