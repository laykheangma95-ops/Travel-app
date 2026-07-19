# ✈️ Flights — Detailed Design Map

Route: `/flights` · Live: **https://travel-8dta13o2c-laykheangma95-ops-projects.vercel.app/flights**

Split as always into 🖼️ **Background · ✏️ Text · 🔤 Font · 🎨 Color · 📷 Picture**,
with exact file + line (locked at commit `e239732`; search the quoted class if a
line drifts).

The flights experience has two design layers:
- the **search landing** (`app/flights/page.tsx`) — the dark night-sky search page
- the **live dashboard/tracker** components in `components/flights/` (shown after
  you search a flight)

---

## A. Flight search landing — `app/flights/page.tsx`

This is the dark, glowing "orb" search page.

| Want to change… | Where exactly |
|---|---|
| 🖼️ **Page background** (dark blue gradient) | `bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_45%,#23406A_100%)]` — **line 52** |
| 📷 **The glowing blue orb** | `bg-[radial-gradient(circle_at_32%_28%,#DBEAFE…#0F2A6B)]` + `animate-orb-pulse` — **line 59** |
| ✏️ **Big heading** | `<h1>` — **lines 63–65** |
| 🔤🎨 **Heading font/color** | `font-display text-4xl font-extrabold … text-white sm:text-6xl` — **line 63** |
| ✏️ **Sub-line under heading** | `<p className="… text-white/70">` — **lines 66–68** |
| 🖼️ **Search input look** (frosted glass) | `border-white/20 bg-white/10 … backdrop-blur focus:border-accent` — **line 93** |
| ✏️ **Search placeholder** | `placeholder="Flight Number e.g. QH215 or TG…"` — **line 87** |
| 🖼️ **Suggestions dropdown** | `bg-[#1C3355]/95 … backdrop-blur-xl` — **line 101** |
| 🖼️ **Date picker field** | `bg-white/10 … [color-scheme:dark]` — **line 134** |
| 🎨 **Recent-flight chips** | `border-white/20 bg-white/5 … hover:text-accent` — **line 153** |

---

## B. Live flight components — `components/flights/`

Shown once a flight is opened. Each is its own file — change one without
touching the others:

| Component | File | What it draws |
|---|---|---|
| Dashboard shell | `FlightDashboard.tsx` | overall layout of the tracked-flight view |
| Live map | `LiveMap.tsx` + `FlightLiveTracker.tsx` | the moving-plane map |
| Status badge | `FlightStatusBadge.tsx` | On time / Delayed / Landed pill colors |
| Delay intelligence | `DelayIntelligence.tsx` | the delay-prediction panel |
| Arrival experience | `ArrivalExperience.tsx` | the "you've landed" screen |
| Travel mode | `TravelMode.tsx` | big-text boarding/gate mode |
| Notify / Share popups | `NotifyModal.tsx`, `ShareModal.tsx` | the modal dialogs |

Rule of thumb: **status colors** (on-time green, delayed amber, cancelled red)
live in `FlightStatusBadge.tsx`. Change them there and every flight view stays
consistent — don't recolor status in each component separately.

> Reminder: `text-accent` (gold), `text-white/70`, etc. trace back to the brand
> tokens in `tailwind.config.ts`. One token = whole site. One line here = one spot.
