# 🚀 Drop-in Vercel API

A self-contained API endpoint you can deploy to Vercel with (almost) zero setup.
It lives in a **single file** with no internal imports, so you can copy it
straight into any Next.js App-Router project and it just works.

| Endpoint | File | Needs a key? | What it does |
| --- | --- | --- | --- |
| `GET /api/flightradar` | `app/api/flightradar/route.ts` | **No** | Real-time aircraft position from the open ADS-B network (FlightRadar24-grade) |

It already ships inside this repo, so deploying this project to Vercel exposes it
automatically. The instructions below are for copying it into a **separate**
Vercel project.

> Looking for the chatbot? The app's AI chatbot lives at `POST /api/chat` and is
> documented in [`AI-CHATBOT.md`](./AI-CHATBOT.md). It shares the business "brain"
> in `lib/domnerBrain.ts`, so it isn't a single-file drop-in.

---

## FlightRadar API — `GET /api/flightradar`

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
