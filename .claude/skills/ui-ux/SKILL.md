---
name: ui-ux
description: >-
  Domer's award-level UI/UX design system and craft standard. Use this skill
  whenever building, restyling, or reviewing any user-facing screen, component,
  or interaction in this repo — landing sections, cards, forms, modals,
  navigation, loaders, motion, or empty states. It encodes the "Temple Night /
  Angkor Gold" brand, the design tokens, the motion language, accessibility
  gates, performance budgets, and an award-readiness checklist to hold every
  change to Awwwards / FWA / CSS Design Awards quality. Trigger on: "redesign",
  "make it look premium", "award-winning", "polish the UI", "new page",
  "new component", "hero", "landing", "animation", "glass", "dark mode",
  or any visual/interaction work.
---

# Domer UI/UX — Award-Level Craft Standard

Domer is a Cambodia-first travel super-app (eSIM, live flight tracking, airport
guides, trip copilot). The bar is not "clean SaaS." The bar is a site that could
be **submitted to Awwwards / FWA and score**. This skill is the standard every
visual change is measured against.

Judges score roughly: **Design 40% · Usability 30% · Creativity 20% · Content 10%.**
The most common way to lose is over-investing in flashy creativity while dropping
usability, performance, or consistency. Win by executing **one memorable concept**
with **obsessive consistency** and **buttery, purposeful motion** — while staying
fast and accessible.

---

## 1. The concept: "Your journey, told from the night sky"

Domer's signature is a continuous **nocturnal, star-mapped journey**. The whole
site is a night sky; **gold light is the only warm accent, and it is rare** — so
it always reads as precious. The 3D particle globe (`components/home/GlobeHero`)
is the narrative thread, not a decoration.

**Rule of continuity:** sections should read as *one continuous sky*, not stacked
light/dark cards. When in doubt, go **dark-first** — the brand is Temple *Night*.
Reserve pure-white surfaces for dense utility screens (dashboards, admin, forms)
where legibility of long-form data comes first.

---

## 2. Design tokens (already defined — use them, never hardcode new hexes)

Source of truth: `tailwind.config.ts` + `app/globals.css` `:root`.

- **Night surfaces:** `primary #14263F` (Temple Night), `primary-deep #0E1B30`,
  `secondary #1C3355`, `secondary-high #23406A`. Deep-space gradient recipe lives
  in `.dgh-stage`.
- **Gold accent:** `accent #C69749`, `gold.light #E6CB8B`, `gold.bright #F7EAC0`,
  `gold.dark #7A5A1E`. Metallic recipe: `.liquid-glass-accent`.
- **Starlight blue** (cool accent, pairs with gold): `#57C8FF` / `#8FD8FF`.
- **Cultural accents (use sparingly):** `jade #1F7A66`, `clay #B14A34`.
- **Light surfaces:** `surface.1/2/3`, `line`, `ink` + `ink.secondary`/`ink.muted`.
- **Status:** `success`, `warning`, `danger`.
- **Radius:** `card 18px`, `btn 12px`. **Shadow:** `shadow-card`, `shadow-card-hover`.

**The gold budget:** at most **one or two gold moments per viewport**. If a screen
is mostly gold, it is wrong — dial it back to navy + one gold focal point.

---

## 3. Typography

Three families (loaded in `app/layout.tsx`): **Marcellus** (`font-display`,
serif, editorial), **Manrope** (`font-body`), **Noto Serif Khmer** (auto-applied
under `body.lang-km`). No 4th font — `font-mono` is Manrope + tabular numerals.

- **Build drama with scale, not weight.** Marcellus ships at 400; get hierarchy
  from size and tracking. Hero/display headings: `clamp()` from ~2.5rem up to
  ~6rem, `letter-spacing: -0.02em to -0.03em`, `text-wrap: balance`.
- **Eyebrows/kickers:** gold, uppercase, `tracking-widest`, ~0.75rem
  (see `SectionHeading` eyebrow). Use them to open every section.
- **Body:** Manrope, `line-height: 1.6–1.65`, muted foreground
  (`text-white/70` on night, `text-ink-secondary` on light).
- **Data (flights, prices, order IDs):** `.font-mono` for tabular alignment —
  lean into a quiet "cockpit" precision.
- Always keep both scripts in mind: never let a fixed width clip Khmer, which
  runs taller and longer than Latin.

---

## 4. Motion language

One shared vocabulary. Never invent ad-hoc easings.

- **Signature ease:** `cubic-bezier(0.22, 1, 0.36, 1)` (expo-out feel) for reveals
  and position changes. `ease-smooth` = `cubic-bezier(0.4, 0, 0.2, 1)` for hovers.
- **Springy press:** `.liquid-press` (overshoot settle) on tappable glass.
- **Durations:** micro-hover 200–300ms; reveals 700–900ms; ambient loops 3–8s.
- **Entrances:** `Reveal` / `.reveal` (rise + fade) and the hero's `.dgh-reveal`.
- **Scroll storytelling** (GSAP + ScrollTrigger, already a dep): prefer
  scroll-*linked* motion over yet another fade. The globe is the anchor.
- **Smooth-scroll inertia** (Lenis) is an approved upgrade for that premium heavy
  feel — gate it behind reduced-motion and keep anchor links working.
- **Signature moments budget: 3–4 per page, max.** More reads as noise and costs
  usability points. Current signatures: the shared globe, the Cambodia medallion
  ring, liquid-glass sheen, the boarding-pass seam (`.ticket-notch`).

**Every animation must have a `prefers-reduced-motion: reduce` fallback** that
renders a calm static state. This is a hard gate, not a nice-to-have — the repo
already does this everywhere (`globals.css`, `GlobeHero`), so match it.

---

## 5. Glass & elevation ladder (keep it disciplined)

Three tiers only — do not invent new glass recipes per component:

1. **Ambient glass** — `.glass-panel` (subtle, for chips/panels over the globe).
2. **Interactive glass** — `.liquid-glass` (+ `.liquid-touch` / `.liquid-press` /
   `.liquid-sheen`) for buttons and pressable surfaces.
3. **Accent glass** — `.liquid-glass-accent` (gold) for the single primary CTA on
   a surface. Never two accent-gold CTAs competing in one viewport.

Night content cards use the `.night-card` pattern (see `globals.css`): translucent
navy, hairline light border, soft inner top highlight — never flat `bg-white` on a
dark section.

---

## 6. Usability (30% — where pretty sites lose)

- **Touch targets ≥ 44px.** Hero CTAs already use `min-height: 3.25rem` — match it.
- **Visible focus states on everything interactive.** Never remove outlines
  without replacing them with a clearly visible ring.
- **Full keyboard operability:** tab order, Enter/Space activation, focus-trapped
  modals, Escape to close.
- **Forms:** label every field, inline validation, real error text (not just red),
  never disable the submit without saying why.
- **First-timer test:** a new user must complete the core job (buy an eSIM, track a
  flight) without instructions. Copy is UI — keep it short and human.

---

## 7. Accessibility (hard gates)

- **Contrast:** body text ≥ WCAG AA (4.5:1); large text ≥ 3:1. **Gold-on-navy and
  gold-on-glass are the usual failures — verify each.** Gold works as a large
  accent/heading, not for small body copy on dark.
- **Semantics:** landmarks (`header`/`nav`/`main`/`footer`), one `h1`, ordered
  headings, `aria-label` on icon-only controls, `aria-hidden` on decorative layers
  (the hero already does this).
- **Motion:** honor `prefers-reduced-motion` everywhere (see §4).
- **Images/media:** meaningful `alt`; decorative art marked `aria-hidden`.

---

## 8. Performance budgets (juries check mobile)

Three.js + GSAP + (optional) Lenis is heavy. Protect the mobile experience:

- **Lazy-load** heavy scenes on viewport entry (the globe already uses an
  IntersectionObserver + dynamic `import()` — always follow this pattern).
- **Pause** rAF loops when off-screen or tab hidden (globe does this — match it).
- **Cap** devicePixelRatio and particle counts on mobile (globe: 1.5x / 8k dots).
- Target **LCP < 2.5s**, avoid layout shift, ship a light first paint (a static
  poster/gradient) before WebGL is ready.
- Inline tiny assets as data URIs (grain texture pattern) to avoid extra requests.

---

## 9. Award-readiness checklist (run before calling any UI change done)

- [ ] Does it reinforce the **one concept** (night-sky journey), or add noise?
- [ ] **Dark-first** unless it's a dense utility screen — no energy drop mid-page.
- [ ] Tokens only — **no new hardcoded hexes**; gold budget respected.
- [ ] Type has real scale contrast; gold eyebrow opens the section.
- [ ] Motion uses the shared easings; **reduced-motion fallback present**.
- [ ] Glass stays within the 3-tier ladder; one accent CTA per viewport.
- [ ] 44px targets, visible focus, keyboard + screen-reader paths work.
- [ ] Contrast checked (esp. gold on dark).
- [ ] Heavy visuals lazy-load, pause off-screen, and are mobile-capped.
- [ ] Looks intentional at 360px, 768px, 1440px — no horizontal scroll.

If every box is checked, it's ready to submit. If not, it's not done yet.
