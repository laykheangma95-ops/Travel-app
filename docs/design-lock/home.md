# 🏠 Home Page — Detailed Design Map

Live reference: **https://travel-8dta13o2c-laykheangma95-ops-projects.vercel.app/**

This is the surgical map. Every section is split into the 5 things you might
want to change on their own:

- 🖼️ **Background** — the color/gradient/image behind the section
- ✏️ **Text (words)** — the actual wording you read
- 🔤 **Font** — size, weight, typeface of that text
- 🎨 **Color** — text/button/icon colors
- 📷 **Picture / graphic** — images, icons, the 3D globe

**Read order = top-to-bottom order on the page.** Line numbers are where each
thing lived when locked at tag `v1.0-home`; if the file grew, search for the
quoted class/word instead of trusting the number.

The whole page is assembled in **`components/home/HomeContent.tsx`** — that file
decides the ORDER of sections. The Hero and Showcase are pulled in from their
own files.

---

## 1. Hero

**File: `components/home/GlobeHero.tsx`** — fully self-contained. All its CSS is
in the `CSS_TEXT` string near the bottom of the file (injected via a `<style>`
tag), scoped under the `dgh-` prefix so it can't leak into other sections.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Background** (deep-space blue gradient behind the globe) | `.dgh-hero` block, the `background:` with `linear-gradient(180deg, #050b2e … #0e1b30)` — around **line 910–913** |
| 📷 **The 3D globe itself** (dots, glow, arcs, stars) | The Three.js scene in the `useEffect`, **lines ~279–800**. Colors of the globe: dot color, `#060f2c` occluder (line 352), cyan rim, star field. ⚠️ Advanced — change carefully. |
| ✏️ **Badge text** (small pill above title) | Comes from i18n key `hero.badge` — edit in `lib/i18n` (search `hero.badge`) |
| ✏️ **Title words** ("Travel… / …") | i18n keys `hero.t1`, `hero.t2`, `hero.t3` in `lib/i18n` |
| ✏️ **Subtitle** | i18n key `hero.sub` |
| ✏️ **Button labels** | i18n keys `hero.ctaEsim`, `hero.ctaFlight` |
| 🔤 **Title font/size** | `.dgh-title` — `font-size: clamp(2.9rem, 7.5vw, 6rem)`, `font-weight: 800` — **line 1047–1050** |
| 🎨 **Title accent color** (the gold→cyan gradient words) | `.dgh-title-accent` — `linear-gradient(92deg, #f5dfa8 … #8fd8ff)` — **line 1055–1056** |
| 🔤 **Subtitle font/color** | `.dgh-sub` — size `clamp(1.05rem,1.6vw,1.25rem)`, color `rgba(255,255,255,0.72)` — **line 1061–1066** |
| 🎨 **Badge look** | `.dgh-badge` — background `rgba(255,255,255,0.07)`, color `rgba(255,255,255,0.92)` — **line 1030–1040** |
| 🎨 **Main button (eSIM) color** | `.dgh-cta` — blue glass gradient at **line 1091–1096**, hover at 1105 |
| 🎨 **Ghost button (Flights) color** | `.dgh-cta-ghost` — **line 1112–1120** |
| 🖼️ **Floating feature chips** | text = i18n `hero.stat1/2/3`; style = `.dgh-chip` **line 1136–1143** |

---

## 2. Cambodia Showcase

**File: `components/home/CambodiaShowcase.tsx`** — the spinning ring of round
destination "medallions."

> ⚠️ **Its background is intentionally transparent.** The blue space background
> here is the SAME globe/gradient from the Hero, shared through the `.dgh-stage`
> wrapper in `HomeContent.tsx`. To change the background behind this section,
> change the **Hero background** (section 1). Don't add a new background here or
> you'll break the "one continuous planet" effect.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Background** | Shared — see Hero background (section 1). This file stays transparent (`<section>` at **line 196**). |
| 📷 **Each medallion's color** (the round gradient discs) | `DESTINATIONS` array, each item's `gradient:` — **lines 41–77**. One line per destination. |
| ✏️ **Destination names / labels** | Same `DESTINATIONS` array (name fields) — **lines 37–78** |
| ✏️ **Section heading words** | `<h2>` at **line 210** (or its i18n key) |
| 🔤 **Heading font/size** | `<h2 className="… text-4xl font-extrabold … sm:text-5xl">` — **line 210** |
| 🎨 **Heading + body color** | `text-white` / `text-white/60` on the `<h2>`/`<p>` — **lines 210–216** |
| 🖼️ **Gold aura glow** behind the ring | `.cam-aura` div — radial gradient at **line 199** |
| 🔤 **Eyebrow pill** ("liquid glass" badge) | **line 206** |
| ⚙️ **Spin speed / ring size** | `AUTO_SPEED` (line 82), `geometryFor` / `geo` state (lines 107–116) |

---

## 3. Feature cards

**File: `components/home/HomeContent.tsx`**, section comment `{/* ── Feature
showcase ── */}` — **lines 59–89**.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Background** | `<section className="section-pad bg-surface-2">` — **line 60**. `bg-surface-2` = light grey (`#F8FAFC`). |
| ✏️ **Which 3 features + their links** | `features` array — **lines 14–18** (icon, i18n name/desc keys, href) |
| ✏️ **Card words** | i18n keys `feature1.name`/`feature1.desc` etc. in `lib/i18n` |
| 🎨 **Card background / border / shadow** | the card `<div>` classes — `bg-white`, `border-line/60`, `shadow-card` — **line 72** |
| 📷 **Icons** | `lucide-react` icons chosen in the `features` array (line 15–17); icon tile style at **line 73** |
| 🎨 **Icon color** | `text-accent` on `<f.icon>` — **line 74** |
| 🔤 **Card title font** | `<h3 className="font-display text-lg font-bold …">` — **line 76** |
| 🔤🎨 **Card body text** | `text-sm … text-ink-muted` — **line 77** |
| 🎨 **"Learn more" link color** | `text-secondary … hover:text-accent` — **line 80** |

---

## 4. How it works

**File: `components/home/HomeContent.tsx`**, `id="how-it-works"` — **lines 91–115**.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Background** | `<section id="how-it-works" className="section-pad bg-white">` — **line 92** |
| ✏️ **The 4 step words** | `stepKeys` array (line 20) → i18n keys `how.step1…step4` |
| ✏️ **Heading words** | i18n keys `how.eyebrow`, `how.title` — **line 95** |
| 🎨 **Number circle color** | `bg-secondary … text-white`, `border-white` — **line 106** |
| 🔤 **Number font** | `font-display text-lg font-bold` — **line 106** |
| 🖼️ **The connecting line** | `bg-line` divider — **line 100** |

---

## 5. Popular destinations

**File: `components/home/HomeContent.tsx`**, `{/* ── Popular destinations ── */}`
— **lines 117–136**. Cards themselves come from
`components/esim/DestinationCard.tsx`.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Background** | `<section className="section-pad bg-surface-2">` — **line 118** |
| 📷 **Which destinations show** | `popularDestinations` in `data/destinations.ts` |
| ✏️ **Heading words** | i18n `dest.eyebrow`, `dest.title`, `dest.desc` — **line 121** |
| 🎨📷 **How each card looks** | `components/esim/DestinationCard.tsx` (image, price, name) |
| ✏️ **"View all" button** | i18n `dest.viewAll`, link `/esim` — **lines 131–132** |

---

## 6. Testimonials

**File: `components/home/HomeContent.tsx`**, `{/* ── Testimonials ── */}` —
**lines 138–170**.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Background** | `<section className="section-pad bg-white">` — **line 139** |
| ✏️ **The quotes / names / trips** | `testimonials` array — **lines 22–43** (edit right in this file) |
| 🎨 **Card background / hover** | `bg-surface-2 … hover:bg-white` — **line 147** |
| 🎨 **Star color** | `fill-warning text-warning` — **line 150** |
| 🎨 **Avatar circle** | `bg-secondary text-white` — **line 157** |
| 🔤🎨 **Quote text** | `text-sm … text-ink-secondary` — **line 153** |

---

## 7. Bottom CTA

**File: `components/home/HomeContent.tsx`**, `{/* ── Bottom CTA ── */}` —
**lines 172–187**. This is the dark night-sky band at the very bottom.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Background** (dark blue gradient) | inline `bg-[linear-gradient(180deg,#14263F_0%,#1C3355_60%,#14263F_100%)]` — **line 173** |
| 🖼️ **Star specks** | `<div className="stars" />` — **line 174** (the `.stars` style is in `app/globals.css`) |
| ✏️ **Heading + subtitle words** | i18n `cta.title`, `cta.sub` — **lines 176–177** |
| ✏️ **Button labels** | i18n `hero.ctaEsim`, `cta.checklist` — **lines 179–183** |
| 🔤🎨 **Heading font/color** | `font-display text-3xl font-bold text-white sm:text-4xl` — **line 176** |

---

## Brand tokens (global)

These control **every** page at once. Change here only when you want a change
site-wide (e.g. "make the gold slightly brighter everywhere").

**File: `tailwind.config.ts`**

| Token | Value | Line |
|---|---|---|
| 🎨 `primary` (Temple Night) | `#14263F` | 15 |
| 🎨 `secondary` (Navy) | `#1C3355` | 17 |
| 🎨 `accent` (Angkor Gold) | `#C69749` | 19 |
| 🎨 `jade` / `clay` / `sandstone` | jade `#1F7A66`, clay `#B14A34`, sand `#F6F1E7` | 25–27 |
| 🎨 `surface 1/2/3` (backgrounds) | white / `#F8FAFC` / `#F1F5F9` | 33–35 |
| 🎨 `ink` (text colors) | `#0F172A` / secondary / muted | 38–41 |
| 🔤 Fonts | `display`, `body`, `khmer` (defined in `app/layout.tsx`) | 43–49 |
| 📐 Radius | `card: 18px`, `btn: 12px` | 51 |
| 🌑 Shadows | `card`, `card-hover` | 55–56 |

**File: `app/globals.css`** — the same colors as CSS variables (`:root`, lines
5–24), the `body` default background/font (line ~35), `.stars`, `.section-pad`,
scrollbar, and the Khmer-language font switch.

> ⚠️ Changing a token here changes it on the WHOLE site. If you only want to
> change one section, use that section's row above instead — not this table.

---

### Quick recap — "I only want to change X"

- **Only the hero background** → `GlobeHero.tsx` line ~910–913.
- **Only a font on the hero title** → `GlobeHero.tsx` line ~1047–1050.
- **Only the words** anywhere → the i18n keys in `lib/i18n` (search the key).
- **Only one medallion's color** → `CambodiaShowcase.tsx` lines 41–77.
- **A color across the whole site** → `tailwind.config.ts`.

Everything else stays exactly as it is on the live Vercel URL. That is the lock.
