# 🚀 Drop-in Vercel APIs

Two self-contained API endpoints you can deploy to Vercel with (almost) zero
setup. Each lives in a **single file** with no internal imports, so you can copy
it straight into any Next.js App-Router project and it just works.

| Endpoint | File | Needs a key? | What it does |
| --- | --- | --- | --- |
| `POST /api/chatbot` | `app/api/chatbot/route.ts` | Optional | AI travel-agent chatbot that already knows the Domner business |
| `GET /api/flightradar` | `app/api/flightradar/route.ts` | **No** | Real-time aircraft position from the open ADS-B network (FlightRadar24-grade) |

Both already ship inside this repo, so deploying this project to Vercel exposes
them automatically. The instructions below are for copying them into a **separate**
Vercel project.

---

## 1. Chatbot API — `POST /api/chatbot`

Our own AI chatbot code, with the whole business "brain" embedded in the file —
products, eSIM setup rules, prices, tone, and guardrails. It answers as Domner's
own Khmer-first travel agent.

### Deploy

1. Copy `app/api/chatbot/route.ts` into your project (same path).
2. Install the SDK: `npm i @anthropic-ai/sdk`
3. In **Vercel → Project → Settings → Environment Variables**, add:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   ```
   Get the key at [console.anthropic.com](https://console.anthropic.com) and set a
   **monthly spend cap** first. Without the key the endpoint still runs in a
   friendly **demo mode** (`"demo": true`).
4. Redeploy.

### Use it

```bash
curl -s -X POST https://YOUR-APP.vercel.app/api/chatbot \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
```

Response:

```json
{ "reply": "Install your eSIM before you fly...", "demo": false }
```

The `messages` array is the whole conversation — include past turns
(`role: "user"` / `role: "assistant"`) so the AI keeps context. History is capped
at the last 20 turns to protect your token bill.

### Teaching it new facts

Open the file and edit the plain-English `SYSTEM_PROMPT` — no AI knowledge needed.
Keep the **STRICT RULES** section strong; it's what stops the AI from inventing
prices or flight statuses. To trade cost for quality, change one line:

```ts
const MODEL = 'claude-haiku-4-5';   // fast + cheap (default)
// const MODEL = 'claude-opus-4-8';  // higher quality, costs more per message
```

---

## 2. FlightRadar API — `GET /api/flightradar`

Real-time aircraft position for a flight number, powered by the **open ADS-B
receiver network** — the same crowdsourced network FlightRadar24 is built on.
**No API key, no signup, no env vars.** It races three open providers
(`adsb.lol`, `airplanes.live`, `adsb.fi`) in parallel and returns the first hit,
with an aircraft photo from planespotters.net.

### Deploy

Just copy `app/api/flightradar/route.ts` into your project and deploy. There is
nothing to configure.

### Use it

```bash
curl -s "https://YOUR-APP.vercel.app/api/flightradar?flight=VN841"
```

Airborne response:

```json
{
  "live": true,
  "callsign": "HVN841",
  "lat": 10.81, "lon": 106.65,
  "altitudeFt": 35000, "groundSpeedKt": 450, "headingDeg": 270,
  "onGround": false,
  "aircraftType": "A321", "registration": "VN-A616",
  "photoUrl": "https://.../thumbnail.jpg",
  "source": "adsb.lol", "ageSeconds": 0
}
```

When the flight isn't currently transmitting a position:

```json
{ "live": false, "reason": "not-airborne" }
```

`reason` is `"unavailable"` if no provider responded at all (e.g. a network
outage).

### Notes

- Flight numbers use the IATA form (e.g. `VN841`). The endpoint maps common
  airlines to their ICAO callsign (`VN` → `HVN`). Add rows to `IATA_TO_ICAO` in
  the file for any airline you need.
- A short in-memory cache keeps the last known fix (up to 10 minutes) so brief
  provider hiccups don't blank the panel. Poll every ~15 seconds for live tracking.
- The open ADS-B feeds don't require a key, but they are best-effort community
  data — coverage is excellent over land and busy routes, thinner over remote
  ocean.
