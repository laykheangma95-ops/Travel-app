# Importing places from a link

**What it is:** paste a TikTok, Instagram, Facebook, YouTube or Google Maps link
— or the caption text itself — and the places in it land on a trip.

**Where it lives:** `/import`. Reachable from the Places card on a trip, from
Explore, from the "Import" tile in the itinerary's add-place sheet, and from the
phone's own share sheet (see *Sharing into Domner* below).

---

## Why it was built

The Places card on a trip pointed at `/destination/{slug}` — a written guide —
and, for a destination with no guide, fell through to `/explore`, a list of
other countries. Neither of them could put a place on the trip you were looking
at. And the one paste box that did work, the Google Maps field inside the
itinerary's add-place sheet, was four taps deep and rejected the most common
paste there is (see *The two bugs* below).

Meanwhile the actual way a traveler decides where to go is a reel somebody sent
them. This closes that gap: the thing they already have — a link on a clipboard
— becomes saved places, on a real trip, with pins on the map.

---

## The flow

1. **Paste.** A link, a caption, or a share blob with both. The platform is
   named back to you the moment it is recognised.
2. **Parse.** Server-side. See the pipeline below.
3. **Review.** Every place found, with an editable name, a category, and whether
   it got a map pin. Low-confidence guesses arrive **un-ticked**.
4. **Choose a trip.** An existing one, or a new one created on the spot — the
   trip for the country the places are in is sorted to the top.
5. **Saved.** Places land in the trip's **Ideas** list, in exactly the same
   shape as a place saved from a guide, so the itinerary editor needs no
   knowledge that the importer exists.

**No travel content is written until step 5.** `POST /api/travel/extract`
creates no trip, no place and no itinerary row. That is what makes a wrong guess
cost a glance instead of a cleanup.

Since migration 012 it does write one row of its own: an import job recording
what was extracted. That is what makes **pasting the same link twice free** —
the second paste replays the first result with no caption fetch and no model
call. It is best-effort; with no database the importer works and simply stops
remembering. Full design in [`SOCIAL-SAVE.md`](SOCIAL-SAVE.md).

---

## The pipeline

| Stage | Module | Notes |
|---|---|---|
| Classify the link | `lib/travel/socialLink.ts` | Pure. No network. Strips tracking params (`igsh`/`igsi`, `_t`, `fbclid`, `utm_*`). |
| Google Maps link | `lib/travel/mapsResolve.ts` | Exact coordinates from the URL. No model, no geocoder. |
| Fetch the caption | `lib/travel/linkPreview.ts` | oEmbed where public (TikTok, YouTube), OpenGraph tags otherwise. |
| Read places out of it | `lib/travel/placeAgent.ts` | Claude. Optional — see *Degrading* below. |
| …or without a model | `lib/travel/placeExtraction.ts` | Pure. Reads 📍 lines and numbered lists. |
| Validate everything | `lib/travel/placeExtraction.ts` | `normaliseCandidate` is the only door. |
| Put pins on it | `lib/travel/geocode.ts` | Nominatim (OpenStreetMap). |
| Write it | `lib/travel/placeImport.ts` | Reuses `addIdeaToTrip` from `savedPlaces.ts`. |
| Remember it | `lib/travel/importJobs.ts` | The job row, the replay lookup, the quota, the provenance. |
| Key it | `lib/travel/urlHash.ts` | Pure. Normalized URL → SHA-256, so a repeat is recognised. |

---

## What it will and will not do

**Instagram and Facebook usually will not give us the caption.** They keep it
behind a login. We do not log in, and we do not try to defeat the block — the
refusal is reported honestly and the screen asks you to paste the caption text
instead, which always works. TikTok and YouTube publish a public oEmbed endpoint
and generally do give us the caption.

**Nothing is scraped.** oEmbed is a documented public API for exactly this. The
OpenGraph fallback reads `<meta>` tags out of a capped 512 KB of the page head —
the metadata a site publishes so links can be previewed — and nothing else. No
page is walked, no internal link is followed, no page content is stored.

**The model is never trusted.** Its JSON goes straight through
`normaliseCandidate`, which rejects a latitude of 900, a 4,000-character name, a
category of "brunch spot" and a country that does not exist. A caption is
untrusted user content: it is fenced and labelled as data in the prompt, and the
system prompt says plainly that instructions inside it are to be ignored.

---

## SSRF — the part to read before changing anything

Two endpoints take a URL from a user and make our server fetch it. That is the
textbook shape of an SSRF hole. Both are guarded the same way:

- An **exact-match hostname allowlist** — a `Set`, never `.endsWith()`, which
  would accept `nottiktok.com` and `tiktok.com.evil.tld`.
- Checked **before any socket is opened**.
- Re-checked at **every redirect hop** (`redirect: 'manual'`). A guard that only
  validates the first URL is not a guard.
- https only, no credentials in the URL, no non-443 ports, capped body reads.

Covered by `tests/linkPreview.test.ts` and `tests/mapsLink.test.ts`.

### One deliberate widening, for the owner to confirm

`lib/travel/mapsResolve.ts` now allows **`goo.gl`** and **`g.co`** alongside the
original four hosts. These are the links Google Maps on iOS and the Google search
result card actually hand out, and rejecting them is the bug behind most reports
that pasting a Maps link did nothing.

They are *generic* Google shorteners, not Maps-only ones, so this is a real
widening. It is safe for one specific reason: every hop is re-validated against
the same list, so a shortener pointing anywhere else is refused at the next hop.
The exposure is a GET to a public Google host whose body we never read. A prior
test pinned the allowlist to four hosts; that test now documents the change
rather than being deleted.

---

## Degrading (rule: the app must run with an empty `.env`)

| Missing | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | No model. The deterministic extractor runs instead: 📍 lines and numbered lists work, prose does not. The review screen says so. |
| `NOMINATIM_BASE_URL` unset | Uses the public OpenStreetMap geocoder. |
| `NOMINATIM_BASE_URL=""` | Geocoding off. Places import without pins; nothing errors. |
| Supabase unconfigured | Saving returns "unavailable right now", as everywhere else. |

### Environment variables

| Name | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Switches on model extraction. |
| `ANTHROPIC_PLACE_MODEL` | `claude-sonnet-5` | Which model reads captions. |
| `NOMINATIM_BASE_URL` | `https://nominatim.openstreetmap.org` | Geocoder. Empty string disables. |
| `ANTHROPIC_PLACE_MODEL_FAST` | unset | Optional cheap first pass. Unset means one call to `ANTHROPIC_PLACE_MODEL`, exactly as before. |
| `PLACE_IMPORT_DAILY_QUOTA` | `40` | Pipeline runs per traveler per rolling day. Replays are free and never counted. `0` disables. |

**On the geocoder:** OpenStreetMap's public instance permits at most one request
per second from an application and requires a real User-Agent. Both are enforced
in code — serially, with a gap, capped at 8 lookups per import — not written
down and forgotten. Point `NOMINATIM_BASE_URL` at your own instance to lift the
limit. Google's Places API would give better answers for the small businesses
these posts are usually about; that is an owner decision with a bill attached,
and swapping it in is a config change rather than a rewrite.

---

## Sharing into Domner

The manifest's `share_target` now lands on `/import`, so sharing a post from
TikTok straight into Domner starts the extraction immediately — no copy, no
paste. Works on Android/Chrome once Domner is installed. **iOS Safari does not
support share targets**; there, copy the link and paste it into `/import`.

`/share/maps-link` — the old share-target address — still exists and forwards
into `/import` with the shared item intact. An installed PWA keeps the manifest
it was installed with, so deleting that route would break sharing for exactly
the people who had already set it up.

---

## The two bugs this also fixes

1. **The Places card led nowhere.** It pointed at a guide page, or at `/explore`
   for a destination with no guide. Neither could add a place to the trip you
   were on. It now opens the importer for *that trip*.

2. **Pasting a Google Maps link did nothing.** Two causes, both fixed:
   - Google Maps shares the place name and the link as **one text blob**
     (`Wat Pho\nhttps://maps.app.goo.gl/…`). The old field ran `new URL()` on
     the whole blob, which threw, and answered "that is not a Google Maps
     link" — for the most common paste there is. The link is now pulled out of
     whatever was pasted.
   - `g.co/kgs/…` and `goo.gl/maps/…`, which iOS and the search card hand out,
     were not on the allowlist. They now are.


---

## The intake (Phase 3)

`POST /api/imports` — paste a link, and Domner writes down that it exists.

**This is not the extractor.** `/import` runs the whole pipeline and gives back
places, for the platforms Domner can read. The intake accepts a link from any
supported platform — including Xiaohongshu, which nothing can read yet — and
records a job. It fetches nothing. A successful intake means *"we have your
link"*, and the screen at `/import/link` says exactly that.

| Stage | Module |
|---|---|
| Validate the URL | `lib/travel/urlSafety.ts` — pure, no network |
| Normalize + hash | `lib/travel/urlHash.ts` |
| Classify the platform | `lib/travel/socialLink.ts` |
| Reuse or record | `lib/travel/importIntake.ts` |

### Classification is not permission to fetch

`xiaohongshu` is in the classifier and in the `place_imports.platform`
vocabulary. It is **not** in `linkPreview.ts`'s or `mapsResolve.ts`'s host
allowlists, and Phase 3 did not touch either. RED publishes no oEmbed endpoint,
we do not scrape, and no connector exists — so a RED link is recognised,
recorded, and never requested. `tests/urlSafety.test.ts` asserts both allowlists
still refuse it.

### What the URL gate refuses

http/https only · no credentials in the URL · ports 80/443 only · 2048 characters
max · localhost and the `.local`/`.internal`/`.lan` namespaces · loopback,
RFC1918, CGNAT, link-local and the metadata service — **including the decimal,
hex, octal and short-form spellings** (`2130706433`, `0x7f000001`, `0177.0.0.1`,
`127.1`) · IPv6 loopback, unique-local, link-local and IPv4-mapped forms.

It does **not** solve DNS rebinding or redirect chains: neither is visible in a
string. Those are fetch-time problems and are handled by the exact-match host
allowlists, which re-validate every hop.

### One open job per link per traveler

A partial unique index on `(user_id, url_hash)` covering the open statuses. A
double tap or a retrying client gets back the job it already has rather than
creating a second — the first implementation checked-then-wrote and five
simultaneous submissions produced five jobs.

**Known limitation, closed in Phase 4:** a job stuck in `processing` used to
keep that link un-importable for that traveler until it reached a terminal
status, with nothing to move it there. `lib/travel/importReaper.ts` now fails
any job that has been `processing` too long — see *The connector layer
(Phase 4)* below.

### Reuse is the traveler's own history, and only theirs

A completed import of the same link by the *same* traveler is replayed for free.
Another traveler's is not, and cannot be — the row is invisible to them under
RLS. Which links a person has pasted is a record of what they are planning and
who they follow.

If cross-user reuse is ever worth the cost saving, the thing to share is the
derived result — candidates keyed by `url_hash` in a table with no owner — never
another traveler's `place_imports` row.

---

## The connector layer (Phase 4)

`POST /api/imports/:id/process` — read a queued job and turn it into candidates.

Phase 3 only records that a link exists. Nothing then read it — this is the
gap that closes. It is a separate request from the intake, deliberately, for
the same reason recording and reading were already split for the synchronous
importer: recording a link must never itself fetch anything.

| Stage | Module |
|---|---|
| Claim the job (`queued` → `processing`) | `lib/travel/importOrchestrator.ts` |
| Which platform reads which link | `lib/connectors/places/registry.ts` |
| The one connector Domner has today | `lib/connectors/places/linkConnector.ts` |
| Sanitize what it returns | `lib/travel/connectorBoundary.ts` |
| Read the caption, same as `/import` | `lib/travel/placeAgent.ts`, `lib/travel/placeExtraction.ts` |
| Reap a job stuck in `processing` | `lib/travel/importReaper.ts` |

### One connector, and why it opens no new socket

`lib/connectors/places/linkConnector.ts` calls `fetchLinkPreview`
(`lib/travel/linkPreview.ts`) and, for a Google Maps link, `resolveFinalUrl`
(`lib/travel/mapsResolve.ts`) — the exact two functions `/api/travel/extract`
already uses. Both carry their own exact-match host allowlist, checked before
any socket opens and re-checked at every redirect hop. This connector opens no
socket of its own; it is registered for `tiktok`, `instagram`, `facebook`,
`youtube`, `google-maps` and `web` — every platform Domner can already read.

**Xiaohongshu still has no connector**, on purpose. Adding one would mean
adding RED's hosts to `linkPreview.ts`'s allowlist, which Phase 3 explicitly
declined to do (*Classification is not permission to fetch*, above). A link
with no registered connector fails cleanly with `error_code = 'no_connector'`
— never a silent fetch of a site that never agreed to be read, and never a job
stuck forever.

### The connector port

`lib/connectors/places/types.ts` — mirrors `lib/providers/places/types.ts`
exactly: an adapter returns a normalized `ConnectorExtraction` or throws, and
is responsible for its own timeout and retry. A future official TikTok/
Instagram/RED integration is a new adapter file plus one `register()` call in
the registry, never a change to the job state machine.

### Connector output is untrusted

A `ConnectorExtraction` is treated exactly like a model's JSON in
`placeAgent.ts` — "our own connector wrote it" is not a safety property. Every
field passes through `sanitizeConnectorResult()`
(`lib/travel/connectorBoundary.ts`) before anything downstream sees it: text is
length-capped, coordinates outside the physical range are dropped, a
confidence outside `[0,1]` is clamped, a thumbnail URL must be `https`, and
connector metadata is reduced to a small bag of primitives — a connector
reading a real vendor API cannot hand its entire raw payload through as
"metadata". Candidate place names still go through `normaliseCandidate()`, the
same single door every other candidate source (the model, the deterministic
extractor, a Maps link) uses. **A connector can never write to `places`,
`destination_places`, or any canonical record** — it produces candidates for a
human to review, and the existing SAVE endpoint is the only door onto a trip.

### Claiming is one conditional UPDATE

`UPDATE place_imports SET status = 'processing' ... WHERE status = 'queued'
RETURNING ...`. A double-tap of "process", or two workers reaching for the
same row, resolves without an application-level lock: Postgres serializes the
two statements, exactly one matches `status = 'queued'`, and the loser is told
the job's real current status rather than being allowed to run the connector
twice. The same pattern Phase 3 used for the open-job partial index, expressed
as a `WHERE` clause instead of a constraint because this is a state
transition, not a new row.

### The stuck-job reaper

`lib/travel/importReaper.ts` fails any job that has been `processing` for
longer than `PLACE_IMPORT_REAP_TIMEOUT_MS` (default ten minutes — generous
relative to the connector layer's own few-second timeouts). One `UPDATE ...
WHERE status = 'processing' AND (started_at < cutoff OR (started_at IS NULL
AND created_at < cutoff))`, which is the whole safety argument: idempotent
(a row it already failed is no longer `processing`, so a second sweep leaves
it alone) and safe under concurrency (two sweeps racing on one row serialize
at the database — the loser's `WHERE` matches nothing once the winner has
committed). The `started_at IS NULL` branch reaches a `processing` row written
by the older synchronous pipeline (`app/api/travel/extract`, migration 012),
which never set that column.

Reaping a job un-sticks the exact link it was stuck on: `failed` is not one of
the statuses `place_imports_open_idx` covers, so the traveler can submit that
link again immediately rather than being told one is already open.

`POST /api/imports/reap` runs it, gated by `requireAdminOrService()` — an
admin session or `DOMNER_SERVICE_TOKEN` — exactly like
`POST /api/notifications/dispatch`. There is still no `crons` block in
`vercel.json` and no queue (§1.14 of `SOCIAL-SAVE.md`); an external scheduler
calling this endpoint on an interval is the intended trigger, the same as the
flight-alert cron.

### Environment variables

| Name | Default | What it does |
|---|---|---|
| `PLACE_IMPORT_REAP_TIMEOUT_MS` | `600000` (10 min) | How long a job may sit in `processing` before the reaper fails it. |

### What Phase 4 deliberately did not do

- **No UI wires up to `/api/imports/:id/process` yet.** `/import/link`
  (Phase 3) still only records a job; nothing calls "process" for it
  automatically. The endpoint is built, tested, and ready to be called — from
  that screen, from a background trigger, or from a future connector-specific
  flow — but wiring a live product surface to it is a separate, smaller
  decision than building the orchestration layer itself.
- **No `needs_confirmation` status is produced yet.** The vocabulary
  (migration 015) reserves it for a future connector that can signal genuine
  ambiguity — "this could be one of three places" — rather than the
  deterministic completed/failed the current connector produces.
- **M1 and M2** (`docs/SOCIAL-SAVE.md`, Part 10) are unchanged by this phase.
