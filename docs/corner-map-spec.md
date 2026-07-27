# CORNER MAP — Build Spec v1

Feature module for Domner. This is the canonical spec; the module in
`lib/corner-map/`, `components/corner-map/` and `app/(corner)/` implements it.

---

## 0. One line

**Corner Map shows you what a place in Cambodia looks like right now, and keeps the places you've been.**

Khmer name: **ជ្រុង** (*chrung* — corner). In-app label: `Corner` / `ជ្រុង`.

---

## 1. What this is — and what it is not

**It is:**
- A map of *places*, densified by recent photos
- A freshness signal — is this café busy, open, still good, or is that photo from 2019
- A saved trip memory that organizes by location instead of by date
- The surface that later carries reservations

**It is not:**
- A people map. There is no "who is here."
- A follow graph. No followers, no following, no DMs in v1.
- Real-time person location. Shots are attached to venues, never to a moving user.

**Hard product rules, enforced in code:**
1. A shot attaches to a `corner_id` (a venue). Raw GPS is never stored or returned.
2. EXIF is stripped server-side on upload. Always. No flag to disable.
3. No endpoint returns "users currently at X."
4. Poster identity is minimal and off the map layer. You see the place, not the person.
5. No user-to-user notification of proximity. Ever.

---

## 2. The core mechanic: freshness

Freshness is the product *and* the design system. Everything derives from `age = now - captured_at`.

| Tier | Age | Token | Behavior |
|---|---|---|---|
| `LIVE` | < 60 min | `--live` | Full saturation, timestamp burn, map node pulses |
| `TODAY` | < 24 h | `--dust` | Full image, static stamp |
| `WEEK` | < 7 d | `--ash` | Slight desaturation (85%) |
| `ARCHIVE` | ≥ 7 d | `--ash` | Desaturate 60%, +grain, stamp dims |

Photos visibly age. A corner with nothing fresh looks *cold* on the map — which is the honest answer to "is this place alive right now."

**Corner heat** = weighted decay of its shots. Drives node size and color on the map.

```ts
// half-life 6h, capped, so one viral corner doesn't dominate the map
heat = Math.min(1, Σ 0.5 ** (ageHours / 6));
```

Implementation: `lib/corner-map/freshness.ts`. Tests: `lib/corner-map/freshness.test.ts`.

---

## 3. Design system

### Palette — time is the palette

```css
--dusk:  #0A0F0D;  /* base — near-black with green undertone, not pure black */
--slab:  #151E1A;  /* cards, sheets, map surface */
--live:  #FFB627;  /* marigold. LIVE only. Never decorative. */
--dust:  #C2A878;  /* TODAY */
--ash:   #6F827A;  /* WEEK / ARCHIVE / inactive */
--paper: #EDE8DC;  /* primary type on dark */
```

`--live` is a **state color, not a brand fill**. If marigold appears on something
that isn't fresh, it's a bug.

### Signature element: the timestamp burn

Every shot carries a date-stamp burned into the lower-right corner, 90s
point-and-shoot style — mono, letter-spaced, marigold when live, dimming as it
ages. Live shots additionally show `● 12 MIN AGO` above the stamp. Archive shots
show the date only.

### Typography

| Role | Latin | Khmer |
|---|---|---|
| Display | Bricolage Grotesque | Kantumruy Pro 700 |
| Body / UI | Geist | Kantumruy Pro 400 |
| Stamp / data | Geist Mono | — always Latin numerals |

**Khmer typesetting rules — non-negotiable:**
- `line-height: 1.8` minimum. Khmer stacks subscripts below and vowels above.
- `letter-spacing: 0`. Any tracking breaks cluster shaping.
- No `text-transform: uppercase`.
- No synthetic italic.
- Khmer strings run 15–25% longer than English. Every button and label must flex.

### Layout

Map-first, sheet-over. No tab bar competing with the map. Bottom sheet has three
detents: peek (rail only), half (corner list), full (corner detail).

### Motion

Three moments only: live pulse (2.4s), sheet spring (stiffness 260 / damping 30),
stamp reveal (220ms after image decode, once). Respect `prefers-reduced-motion`:
kill the pulse, replace with a static ring.

---

## 4. Data model

See `supabase/migrations/20260727000000_corner_map.sql`.

Tables: `corners`, `shots`, `saves`, `shot_reports`, `corner_blocks`.

**Deviation from spec v1, deliberate:** the spec defined a new `trips` table.
Domner already has `trip_plans` (`supabase/schema.sql`) seeded by the arrival
flight flow, so `saves.trip_id` references `trip_plans(id)` rather than
introducing a second, competing trip concept.

**RLS:**
- `shots`: select where `status = 'live'` (plus own rows, so an author can see
  their own held shot); insert where `auth.uid() = user_id`; update/delete own only.
- `saves`: full policy on `auth.uid() = user_id`. Never readable by others.
- `corners`: select public; insert via service role only.
- No view, function, or endpoint may join `shots.user_id` to a location result set.

**Auto-hide trigger:** 3 distinct reports on a shot → `status = 'held'`.

---

## 5. Screens

### 5.1 Map — `app/(corner)/map`
Default view, user location centered, 1.2 km radius. MapLibre GL JS, custom dark
style, Protomaps basemap.

- Nodes sized by `heat`, colored by freshest tier at that corner
- Cluster below zoom 14
- Filter chips: `Live now` · `Food` · `Coffee` · `Temples` · `Open late`
- Empty state: *"No shots near you yet. Be the first corner."* — never a spinner-forever.

### 5.2 Corner sheet — `components/corner-map/CornerSheet.tsx`
Header (Khmer + English), category, `● LIVE — 12 min ago` or `Last seen 3 days ago`.
Shot rail newest first. `Save to my map` primary. `Directions` hands off to Google
Maps. Report on every shot, one tap, reason picker only.

### 5.3 Capture — `app/(corner)/capture`
Camera or library. HEIC → WebP. Venue picker: nearest corners plus search. **The
user must pick a venue.** Caption optional, 140 chars, language auto-detected.
Post → optimistic insert, blurhash placeholder.

### 5.4 My Map — `app/(corner)/my-map`
Saved corners plus your own shots, private. Toggle `Map` / `Grid`.

### 5.5 Trip recap — v2.

---

## 6. Feature tiers

**MVP (this build)** — map with freshness nodes · corner sheet + shot rail ·
capture with venue picker · save to my map · report + auto-hide · Khmer/English.

**v2** — trip grouping and 9:16 recap export · `Open now` · Reserve CTA on
`bookable` corners · push.

**v3** — venue claim · paid placement · booking take-rate.

**Explicitly deferred, possibly forever:** follows, DMs, comments, profiles.

---

## 7. Safety

Not a settings screen. Architecture.

- EXIF stripped on upload, server-side, unconditionally — `lib/corner-map/image.ts`
- Venue-snapped location only — never raw coordinates in any response payload
- No proximity notifications, no presence indicators
- Face-heavy shots → `status = 'held'` and a prompt
- Under-18 accounts: capture disabled, view only
- Report → 3 strikes → auto-hide → manual review queue
- Block a user: their shots disappear from your view everywhere

---

## 8. Bilingual

- All UI strings in `en` / `km`, no English fallback rendering mid-sentence
- Corner names show Khmer primary + English secondary for `km` locale, reversed for `en`
- Dates: Latin numerals in the stamp always
- Test every screen at Khmer string length before shipping

---

## 9. Deploying (Vercel)

Corner Map is designed to work on a fresh deploy with **no new environment
variables**. Everything below is either already configured or optional.

### Required: run the migration

`supabase/migrations/20260727000000_corner_map.sql`, in the Supabase SQL editor.
It creates the tables, RLS policies, the 3-report auto-hide trigger, the
`shots` storage bucket, and inserts 15 seed corners across Phnom Penh, Siem
Reap and the coast.

Until it runs, the client falls back to `data/cornerSeed.ts` — the same places,
same ids — so the map still works, but posting fails (there is no database to
post to). The fallback logs a warning naming the migration.

### Already configured

| Thing | Status |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SUPABASE_SERVICE_KEY` | Already set for the rest of Domner; Corner Map reuses them. |
| `sharp` | In `dependencies`, and `next.config.mjs` lists it under `serverComponentsExternalPackages` so the upload route loads it natively at runtime. |
| Upload route runtime | Pinned to `nodejs` — sharp cannot run on the edge. |

### Optional: `NEXT_PUBLIC_PMTILES_URL`

Leave it unset and the basemap uses CARTO dark raster tiles, tinted onto the
dusk palette — the same tiles `components/flights/LiveMap.tsx` already uses.
The map works immediately with nothing to configure.

Set it once traffic justifies it. A self-hosted `.pmtiles` archive has no
per-load cost, which is the reason §5.1 picks Protomaps in the first place;
the extract command is in `.env.example`.

### Vercel-specific constraints, handled

- **Request body limit.** Serverless functions reject bodies over ~4.5 MB at
  the platform edge, before any route code runs. Phone photos routinely exceed
  that, so the capture screen downscales to 1600px and re-encodes to WebP in
  the browser before uploading, and `MAX_UPLOAD_BYTES` is 4 MB. This also cuts
  a multi-megabyte upload to a few hundred KB, which matters more on Cambodian
  mobile data than it does on the platform limit.
- **HEIC.** sharp's prebuilt libvips has no HEIF decoder. iOS photos are
  converted in the browser via canvas. The server-side EXIF strip is still
  unconditional — the client conversion is a convenience, never the guarantee.
- **maplibre-gl is pinned to 5.24.0.** Under 6.0.0 the map's web worker does
  not survive Next 14's bundling; it dies on creation, no source ever tiles,
  and the map renders as a flat background with no nodes and no console error.

### First-run checklist

1. Merge, let Vercel build.
2. Run the migration.
3. Open `/map` — expect ~4 cold ash rings if you are in central Phnom Penh,
   or the "No shots near you yet / Be the first corner" empty state elsewhere.
4. Sign in, tap the marigold camera, post a shot to a seeded corner.
5. That corner's node should turn marigold and pulse for the next 60 minutes.
