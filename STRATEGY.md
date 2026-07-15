# 🧭 Domner — Product & Monetization Strategy (Founder View)

> Companion to `COSTS.md`. That doc answers *"what do we spend?"* — this one answers
> *"what are we building, who pays, and in what order?"* Read them together: the cost
> side and the revenue side of the same decisions.

---

## 1. The vision in one line

**Domner is a premium *personal travel agent* for the Cambodian traveler — and, over time,
the super-app where they do everything travel-related. The "Alipay of travel," first in
Cambodia.**

Not a marketplace. Not the cheapest. The most *trusted* and the most *convenient*.

---

## 2. Positioning: agent, not marketplace

| | Marketplace (Klook, Traveloka) | **Personal agent (Domner)** |
| --- | --- | --- |
| Competes on | Price & inventory | **Trust & convenience** |
| Relationship | Transaction — you leave after booking | **Ongoing — travels *with* you** |
| Loyalty | Whoever's cheapest today | **They come back because it just works** |
| Moat | Discounts (a race to the bottom) | **The traveler's trust (compounds over time)** |

**Why this wins:** elites don't fly Singapore Airlines because it's cheap — they fly it
because it's *trusted* and it makes them feel valued (PPS Club). Domner plays the same
game: be the airline people *choose*, not the aggregator they *compare*.

---

## 3. The trust principle (non-negotiable)

Trust is the entire moat — so we protect it above all else:

- **Never show unverified data as fact.** A wrong gate that makes someone miss a flight
  isn't a bug — it's the brand dying. If we can't verify it, we don't show it as
  authoritative (label it "confirm at the airport" or hide it). Real-or-silent.
- **Free tier is *real*, never faked.** Better to show less true data than more fake data.
- This is exactly why we run free live tracking (real ADS-B) at launch and gate our
  *unverified* data behind paid, real sources later — see `COSTS.md`.

A marketplace can be sloppy; nobody trusts it anyway. A premium agent cannot.

---

## 4. Monetization model — three tiers

The premium vision and cost discipline are the **same plan**: build trust free, then let
subscribers fund the premium data (the Flighty model — the customer using the expensive
data is the one paying for it).

### 🟢 Free — the trust builder
The loss-leader that gets people in and proves we're reliable. Runs at ~$0 (see `COSTS.md`).
- Live flight tracking (real ADS-B), airborne/landed status
- eSIM store, "Am I Ready?" checklist, airport guides, emergency phrases
- **Trip itinerary planner** (per the vision — a free hook that builds the daily habit)
- AI Trip Copilot (FAQ layer free; Haiku for the long tail)

### 🔵 Domner Pro — the subscription (~$3–5/mo or ~$35/yr)
Where paid, verified, premium data lives — now funded by the subscriber using it.
- Real gate / terminal / check-in counter + **predictive delay intelligence**
- Push alerts (gate change, delay, boarding, landed)
- Priority 24/7 Khmer concierge support
- Perks over time: lounge info, visa help, live exchange, priority deals

### 🟡 Comped Pro — the "PPS Club" move (your best idea)
Top eSIM spenders & most-frequent travelers get **Pro free**, as *status*.
- Costs a little data spend; it's a **retention + referral** expense, not a loss.
- The whales travel most, spend most, and tell other travelers — worth more loyal than
  monetized. Airlines comp elite status for exactly this reason.

---

## 5. Feature → tier map

| Feature | Tier | Data cost | How it earns |
| --- | --- | --- | --- |
| Live flight tracking (ADS-B) | Free | $0 | Habit / trust |
| eSIM store | Free to browse | $0 | **Margin on every eSIM sold** |
| Checklist / airport guide / phrases | Free | $0 | Habit / trust |
| Trip itinerary planner | Free | ~$0 (AI) | Habit → funnels into bookings |
| AI Trip Copilot | Free + Pro | cents (Haiku) | Convenience → retention |
| Real gate / check-in / delay prediction | **Pro** | paid API | **Subscription** |
| Push alerts, concierge | **Pro** | low | **Subscription** |
| Flight ticket comparison | Free to compare | affiliate feeds | **Booking commission** |
| Hotels / Domner Stays / Airbnb-style | Free to browse | partner/API | **Booking margin/commission** |
| Transportation (taxi, transfer) | Free to browse | partner API | **Per-ride margin** |

**Two engines run in parallel:** (1) **subscription** (Pro, recurring, funds premium data),
and (2) **transaction margin** (eSIM, tickets, hotels, transport — you earn per booking).
The subscription buys loyalty; the transactions buy scale.

---

## 6. Revenue-gated rollout (the discipline)

Premium ≠ spend now. It means: build trust free → charge → the data pays for itself.

- **Phase 0 — Launch (now):** Free tier only, ~$0 fixed cost (per `COSTS.md`). Get users,
  prove reliability, watch what they come back for.
- **Phase 1 — Monetize what exists:** eSIM sales are the first revenue. Optimize the funnel
  (Copilot → checklist → eSIM checkout).
- **Phase 2 — Launch Domner Pro:** Turn on paid, *real* flight data as a Pro feature once
  engaged-traveler volume justifies it (with a monthly call cap). Comp the whales from day 1.
- **Phase 3 — Expand the super-app** (Section 7), one trusted feature at a time.

Each phase only starts when the previous one's revenue can fund it. That's how you're
premium *and* never underwater.

---

## 7. The super-app roadmap — "Alipay of travel"

**Sequencing philosophy:** Alipay didn't launch as a super-app — it started as *one*
trusted thing (safe payment for Taobao) and *earned* the right to add the next. Domner does
the same: **each feature must be trusted before we add the next, so the trust compounds
instead of spreading thin.** Ship one, earn the loyalty, then expand.

Roadmap (each earns its own way, so expansion funds itself):

1. **Flight ticket comparison** — compare fares in-app; free to search. Earns **booking
   commission** via airline/affiliate feeds. Deepens the "I start my trip in Domner" habit.
2. **Trip itinerary planner (free)** — the daily-habit hook and the *personal-agent* soul of
   the app. Free on purpose: it's the surface the AI Copilot lives on, and it funnels every
   other paid feature (need an eSIM? a hotel? a ride? — planned right here).
3. **Hotels + Domner Stays (Airbnb-style)** — curated, trusted stays. Earns **booking
   margin/commission**. "Domner version" = the trust layer competitors lack.
4. **Transportation** — airport transfers, taxis, intercity. Earns **per-ride margin** and
   closes the door-to-door convenience loop.

Underneath it all: **the AI Trip Copilot as the unifying "personal agent"** — one assistant
that knows the traveler across flights, stays, and rides. *That's* the super-app feel; no
single API delivers it, so it's where the premium investment compounds.

Why Domner can be *first in Cambodia*: Khmer-first, trust-first, and built for the Cambodian
traveler specifically — a wedge the global marketplaces don't serve well.

---

## 8. Revenue streams summary

| Stream | Type | When |
| --- | --- | --- |
| eSIM margin | Transaction | Now |
| Domner Pro | Subscription (recurring) | Phase 2 |
| Flight booking commission | Transaction | Phase 3 |
| Hotel / stays commission | Transaction | Phase 3 |
| Transportation margin | Transaction | Phase 3 |
| Affiliate / referral (30% program) | Transaction | Now |

Recurring subscription + repeatable transaction margin, all funded by trust and convenience —
never by being the cheapest.

---

## 9. Guardrails

- **Trust before growth.** Never fake data to look more complete. Real-or-silent.
- **Revenue before spend.** Each paid API / feature switches on when its revenue covers it
  (see `COSTS.md` for the current $0 config).
- **Earn the super-app.** One trusted feature at a time — don't spread thin chasing breadth
  before depth is loved.
- **Concentrate premium investment in the AI agent + reliability** — that's the moat, not
  any single data vendor.
