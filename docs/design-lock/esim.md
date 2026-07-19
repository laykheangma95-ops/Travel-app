# 📱 eSIM Store — Detailed Design Map

Route: `/esim` · Live: **https://travel-8dta13o2c-laykheangma95-ops-projects.vercel.app/esim**

Same idea as [`home.md`](./home.md): each part is split into
🖼️ **Background · ✏️ Text · 🔤 Font · 🎨 Color · 📷 Picture** with the exact
file + line (as locked at commit `e239732`; if lines drift, search the quoted
class/word).

The store page has **two design pieces**:
- the **page shell** (`app/esim/page.tsx`) — heading, search, filter tabs, grid
- the **plan/price card** (`components/esim/PlanCard.tsx`) and the
  **device checker** (`components/esim/DeviceChecker.tsx`)

---

## A. Store page shell — `app/esim/page.tsx`

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Page background** | The whole page sits on the site default (`bg-surface-2`, set in `app/globals.css` body). The page div itself is transparent — `<div className="mx-auto max-w-7xl px-4 py-12 …">` **line 28** |
| ✏️ **Page title** ("eSIM Store") | `<h1>` — **line 30** |
| ✏️ **Intro sentence** | `<p>` — **lines 31–33** |
| 🔤 **Title font/size** | `font-display text-3xl font-bold … sm:text-4xl` — **line 30** |
| 🎨 **Title / intro color** | `text-ink` / `text-ink-secondary` — **lines 30–31** |
| 🖼️ **Search box look** | `<input>` — border/bg/focus at **line 51** |
| 🎨 **Search button color** | `bg-accent … hover:brightness-110` — **line 56** |
| ✏️ **Filter tab labels** | `FILTERS` array — **line 11** |
| 🎨 **Filter tab colors** (active vs. inactive) | active `bg-secondary text-white`, inactive `bg-white … hover:text-secondary` — **lines 75–76** |
| 📷 **The destination cards in the grid** | each card = `components/esim/DestinationCard.tsx` (see below); grid layout **line 86** |
| ✏️ **"No results" message** | `EmptyState` props — **lines 92–98** |

---

## B. Destination card — `components/esim/DestinationCard.tsx`

The image tile shown in the grid (flag/photo + country name + "from $X").
This same card also appears on the **home page** Popular Destinations section,
so a change here shows in **both** places — that is intended (one card design).

| Want to change… | Where |
|---|---|
| 📷 Card image / flag | image element in `DestinationCard.tsx` |
| ✏️ Country name + price text | props from `data/destinations.ts` |
| 🎨 Card border / hover lift | the card wrapper classes |

---

## C. Plan / price card — `components/esim/PlanCard.tsx`

The pricing cards (used on the checkout / country pages).

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Card background / border / shadow** | `rounded-card border bg-white p-8 shadow-card` — **line 37** |
| 🎨 **"Popular" highlight** (gold ring + scale) | `border-2 border-accent lg:scale-[1.04]` — **line 38** |
| ✏️🎨 **"Popular" badge** | `bg-accent … text-white` pill — **line 42** |
| ✏️ **Plan name** | `<h3>` — **line 46** |
| 🔤🎨 **Price number font** | `font-display text-4xl font-extrabold text-ink` — **line 49** |
| ✏️ **Duration / data / network lines** | **lines 51–53** |
| 🎨 **Feature check color** | `text-success` check icon — **line 58** |
| 🎨 **Buy button color** | selected `bg-success`; popular `liquid-glass-accent`; normal `bg-secondary hover:bg-[#162c4a]` — **lines 69–72** |

---

## D. Device checker — `components/esim/DeviceChecker.tsx`

The "Is my phone eSIM compatible?" box.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Box background/border** | `rounded-card border border-line/60 bg-white p-8 shadow-card` — **line 36** |
| ✏️ **Heading** | `<h3>` — **line 37** |
| 🎨 **Check button color** | `bg-secondary … hover:bg-[#162c4a]` — **line 61** |
| 🎨 **Result colors** (✓ green / ✗ red / ! amber) | **lines 68 / 73 / 78** — `bg-emerald-50 text-success` / `bg-red-50 text-danger` / `bg-amber-50 text-warning` |

> Colors like `text-accent`, `text-secondary`, `text-success` all come from the
> brand tokens in `tailwind.config.ts`. Change a token there only if you want it
> to change **everywhere**; change the line above to affect just this spot.
