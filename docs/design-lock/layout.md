# 🧩 Global Layout — Navbar, Footer, Copilot, Logo

These appear on **every page**. A change here shows site-wide — that's the point,
but it also means: be careful, and change only the layer you were asked to.

Split into 🖼️ **Background · ✏️ Text · 🔤 Font · 🎨 Color · 📷 Picture**, exact
file + line (locked at commit `e239732`; search the quoted class if a line drifts).

---

## A. Navbar — `components/layout/Navbar.tsx`

The sticky top bar. It becomes solid white when you scroll down.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Bar background** | scrolled: `bg-white/85` + shadow **line 76**; at top: `bg-white/60` **line 77** |
| 🖼️ **Sticky / blur behaviour** | `sticky top-0 z-40 … backdrop-blur-xl` — **line 74** |
| 📐 **Bar height** | `h-16` on the `<nav>` — **line 80** |
| 📷 **Logo** | `<DomerLogo surface="light" />` — **line 83** (the logo art itself is in `components/brand/DomerMark.tsx`, see section D) |
| ✏️ **Menu links** | the nav-link list further down (uses i18n keys) |
| 🎨 **Cart badge color** | `bg-accent text-white` count bubble — **line 153** |
| 🖼️ **Mobile menu drawer** | `border-t border-line bg-white` — **line 186** |

---

## B. Footer — `components/layout/Footer.tsx`

The dark footer at the bottom of every page.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Footer background** | `<footer className="bg-primary text-white">` — **line 42** (`bg-primary` = Temple Night `#14263F`) |
| ✏️ **Tagline** | i18n `footer.tagline` — **line 50** |
| 🔤 **Brand kicker** (tiny spaced caps) | `font-display text-[11px] uppercase tracking-[0.28em] text-white/40` — **line 47** |
| ✏️ **Column headings** | `<h3>` — **line 78** |
| 🎨 **Link hover color** | `text-white/70 hover:text-accent` — **line 86** |
| ✏️ **Privacy / Terms links** | **lines 100–101** |
| 🖼️ **Bottom divider** | `border-t border-white/10` — **line 97** |

---

## C. Trip Copilot (floating button) — `components/copilot/TripCopilot.tsx`

The gold round chat button, bottom-right on every page.

| Want to change… | Where exactly |
|---|---|
| 📷🎨 **The round gold button (FAB)** | `liquid-glass-accent … fixed bottom-5 right-5 z-[90] h-14 w-14 rounded-full` — **line 123** |
| 📐 **Button position** | `bottom-5 right-5` — **line 123** |
| 🖼️ **Chat panel background** | `bg-[#0E1B30]/95 … backdrop-blur-xl` — **line 132** |
| 📐 **Panel size** | `h-[70vh] max-h-[560px] w-[92vw] max-w-sm` — **line 132** |
| 🎨 **Quick-reply chips** | `border-white/15 bg-white/5 … hover:text-white` — **line 156** |
| 🎨 **Send button** | `liquid-glass-accent … rounded-full` — **line 200** |

---

## D. Brand logo & colors — `components/brand/DomerMark.tsx`

The "Wayfinder Star" compass mark. Two exports: `DomerMark` (icon only) and
`DomerLogo` (icon + wordmark).

| Want to change… | Where exactly |
|---|---|
| 🎨 **Logo colors per surface** | the `surface` palette map — **lines 11–15** (`navy`, `light`, `gold`, `mono-*`; each sets `star` / `hub` / `gem` hex) |
| 📷 **The star shape** | `WAYFINDER_PATH` used at **line 38**; center circles at **lines 39–40** |
| 📐 **Default size** | `size = 28` (mark) / `30` (logo) — **lines 26 / 56** |

> The logo picks its colors by `surface` prop (`light` in the navbar, etc.).
> Change a hex in the palette map to restyle the logo everywhere that surface
> is used — no need to hunt each page.

---

### Golden rule for this file

Because everything here is global, when the user asks to change (say) the
**footer background**, touch **only** `Footer.tsx` line 42 — not the brand
token, not the navbar. If a request seems to need editing the shared brand
tokens (`tailwind.config.ts`), confirm first: that changes the whole site.
