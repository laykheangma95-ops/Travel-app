# 🔒 Design Lock — Domer

This folder is the **single source of truth** for the designs that are FINISHED
and must not change by accident.

The live design we are protecting:
**https://travel-8dta13o2c-laykheangma95-ops-projects.vercel.app/**

> **The promise (1 → 10):** every design listed here is a promise to the user.
> When you add something new, you ADD it. You do not remove, revert, or restyle
> anything on the locked list unless the user asks for that exact thing.

---

## Why this folder exists

The problem we are solving: *"I add one new design, and suddenly other finished
designs go back to an old version."* That is called a **regression**. This folder
+ git tags make it stop:

1. **Git tags** = permanent save points. Nothing is ever truly lost.
2. **This registry** = the written list of what is locked (the 1 → 10 promise).
3. **The per-page maps** (e.g. [`home.md`](./home.md)) = tell you the EXACT file
   and line for each piece, so you can change *only* the background — or *only*
   a font, a color, a word, a picture — without touching anything else.

---

## The rules (read before editing any locked design)

1. **Always start from the newest code.** Before adding anything, pull the latest
   `main`/current branch. Building on an old copy is what drags old designs back.
2. **One feature = one folder.** A change to the eSIM should only touch
   `components/esim`. If an edit starts changing 5 unrelated folders — STOP.
3. **Change only the layer you were asked to.** The per-page map splits every
   section into **Background · Text (words) · Font · Color · Picture**. If the
   user says "change the hero background," you touch the background line ONLY.
4. **Never delete a locked section to add a new one.** New goes next to old.
5. **If a request would change something on the locked list that the user did
   NOT mention — stop and ask first.**

---

## 🔒 Locked design registry (the 1 → 10 list)

| # | Design | Where it lives | Locked at tag | Detail map |
|---|--------|----------------|---------------|------------|
| 1 | Home — **Hero** (3D particle globe, title, CTAs) | `components/home/GlobeHero.tsx` | `e239732` | [home.md → Hero](./home.md#1-hero) |
| 2 | Home — **Cambodia Showcase** (spinning medallion ring) | `components/home/CambodiaShowcase.tsx` | `e239732` | [home.md → Showcase](./home.md#2-cambodia-showcase) |
| 3 | Home — **Feature cards** (eSIM / Flights / Guide) | `components/home/HomeContent.tsx` | `e239732` | [home.md → Features](./home.md#3-feature-cards) |
| 4 | Home — **How it works** (4 steps) | `components/home/HomeContent.tsx` | `e239732` | [home.md → How it works](./home.md#4-how-it-works) |
| 5 | Home — **Popular destinations** grid | `components/home/HomeContent.tsx` | `e239732` | [home.md → Destinations](./home.md#5-popular-destinations) |
| 6 | Home — **Testimonials** | `components/home/HomeContent.tsx` | `e239732` | [home.md → Testimonials](./home.md#6-testimonials) |
| 7 | Home — **Bottom CTA** (night-sky band) | `components/home/HomeContent.tsx` | `e239732` | [home.md → Bottom CTA](./home.md#7-bottom-cta) |
| 8 | **Brand tokens** (colors, fonts, radius, shadow) | `tailwind.config.ts` + `app/globals.css` | `e239732` | [home.md → Brand tokens](./home.md#brand-tokens-global) |
| 9 | **eSIM Store** (page shell, plan card, device checker) | `app/esim/page.tsx` + `components/esim/*` | `e239732` | [esim.md](./esim.md) |
| 10 | **Flights** (dark search landing + live tracker) | `app/flights/page.tsx` + `components/flights/*` | `e239732` | [flights.md](./flights.md) |
| 11 | **Global layout** (Navbar, Footer, Copilot, Logo) | `components/layout/*`, `components/copilot/*`, `components/brand/*` | `e239732` | [layout.md](./layout.md) |

> Add a new row every time a design becomes "final." Never remove a row —
> if a design is retired, mark it `~~struck through~~` with the date instead.

---

## Save points (git commit SHAs)

Each locked version is frozen at an exact commit. A commit that lives on a
pushed branch is **permanent** — this is the recovery point.

| Locked version | Commit SHA | What it is |
|---|---|---|
| `v1.0-home` (design) | `e239732ba649fe67f48ab1c3f279ceefd65cde34` | the finished home page as on the live Vercel URL |
| `v1.0-home` (+ this doc) | `1918a7ab489aa219826a5851fe901fe2bb973e90` | same design plus the design-lock docs |

To see or restore one:

```bash
git show e239732                                   # see exactly what was locked
git checkout e239732 -- components/home/GlobeHero.tsx   # restore ONE file
```

Restoring never deletes your new work — it only brings back the file you name.
When a new design becomes final, record its SHA in a new row above.

> **Note on tags:** a matching git *tag* (`v1.0-home`) was created, but this
> environment's egress policy only allows pushing the working branch, not tags,
> so the tag lives locally only. The **commit SHAs above are the real, permanent
> save points.** If you want a clickable GitHub tag/Release too, create it on
> GitHub from commit `e239732` — that step has to be done from your own machine
> or the GitHub website, not from here.

---

## How to ask for a safe change

Say it in this shape and the change stays surgical:

> "On the **home hero**, change **only the background** to X. Keep everything
> else exactly the same."

The per-page maps turn that into one exact line to edit:

- 🏠 Home — [`home.md`](./home.md)
- 📱 eSIM Store — [`esim.md`](./esim.md)
- ✈️ Flights — [`flights.md`](./flights.md)
- 🧩 Global layout (Navbar / Footer / Copilot / Logo) — [`layout.md`](./layout.md)
