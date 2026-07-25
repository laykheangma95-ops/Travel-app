# Taxonomy ↔ engine gap analysis

Step 2 of `docs/HANDOFF.md`. Regenerate with `npm run intents:gap`.

No answers have been written yet. This is the gap list only.

## Headline

`data/intentTaxonomy.js` describes **64 intents**. `lib/domnerEngine.ts` answers
**13** via its `INTENTS` array plus **2** special-cased paths in `generateReply`
(the per-country price line and the popular-countries price list).

The trained model in `data/intentModel.json` covers **13 labels** — the engine's
13, not the taxonomy's 64. `data/intents.jsonl` has 222 examples across those
same 13. **Nothing has ever been trained on the taxonomy.** Until
`intents:generate` runs, 51 of the 64 taxonomy ids cannot be predicted at all,
so wiring the classifier in today can only ever reproduce existing behaviour.

| Status | Count | Meaning |
| --- | --- | --- |
| EXACT | 8 | Same id in both sides |
| COVERED | 11 | Engine answers it under a different or broader id |
| PARTIAL | 13 | An engine answer mentions it in passing; not a real answer |
| NONE | 32 | Nothing in the engine answers this |

## 1. Taxonomy intents with no answer in the engine

32 have nothing. The ones where the **data already exists**, so an answer is a
matter of writing the lookup rather than sourcing facts:

| Intent | Grounded | Data available |
| --- | --- | --- |
| `visa` | yes | `customsRules.visaInfo` — **7 of 20 countries** |
| `customs` | yes | `customsRules` — **7 of 20 countries** |
| `currency` | yes | `destinations.currency` + `usdRate` — all 20 |
| `safety_scams` | yes | `scamAlerts` — **8 countries**, 20 alerts |
| `affiliate` | no | `REFERRAL_DISCOUNT_PCT` (5%), `/affiliate` page |

The remaining 27 need both an answer and a policy decision, because the app has
no data or feature behind them:

- eSIM lifecycle: `esim_multi_country` *(grounded)*, `esim_not_working`,
  `esim_qr_lost`, `esim_topup`, `esim_remove`, `esim_keep_number`,
  `esim_calls_sms`, `esim_two_phones`
- Destination knowledge: `local_transport`, `best_time`, `power_plug`
- Flights: `flight_share`, `flight_missed`, `flight_baggage`
- Airports: `airport_transfer`, `airport_wifi`, `airport_lounge`
- Commerce: `payment_failed`, `order_status`, `invoice`, `travel_insurance`
- Account: `account_login`, `account_delete`, `privacy`
- Business: `domner_pro` *(grounded)*, `partnership`, `complaint`

## 2. Engine intents missing from the taxonomy

Five. In each case the taxonomy split one engine intent into several finer ones,
so the answer exists but under an id the taxonomy does not contain:

| Engine id | Taxonomy replaces it with |
| --- | --- |
| `flight` | `flight_track`, `flight_delay`, `flight_alerts`, `flight_share`, `flight_missed`, `flight_baggage`, `flight_booking` |
| `airport` | `airport_guide`, `airport_arrival_time`, `airport_transfer`, `airport_wifi`, `airport_lounge` |
| `payment` | `payment_methods`, `payment_failed`, `payment_currency` |
| `refund_booking` | `refund`, `cancel_order`, `change_booking` |
| `support` | `support_human`, `complaint`, `availability` |

## 3. Where the ids disagree

**Eight ids match exactly:** `greeting`, `thanks`, `esim_setup`,
`esim_compatibility`, `china_vpn`, `checklist`, `emergency`, `products`.

Two of those match in name but not in substance:

- **`emergency`** is `grounded: true` in the taxonomy, but the engine's answer is
  hand-written prose pointing at the Emergency Phrases page. It reads nothing
  from `data/emergencyPhrases.ts`, which is keyed by phrase category, not by
  `countrySlug` — so "grounding" it needs a different shape than the other four
  data files.
- **`products`** is `grounded: true`, but the engine's answer hardcodes the
  feature list and "20+ countries" as literal text. `DOMNER_FACTS.countryCount`
  is derived from `destinations.length`, so the grounded version should read it.

**The 5-into-1 collapses above are the real disagreement.** A classifier trained
on the taxonomy will emit `flight_baggage`; `INTENTS.find(i => i.id === ...)` in
the INTEGRATE.md patch will miss, `best` stays null, and it silently falls
through to keyword scoring. That is safe but it means those predictions are
wasted until the ids are reconciled in one of two directions:

1. **Engine follows taxonomy** — split the 5 broad intents into the 18 fine ones
   and write the missing answers. Most work, best answers.
2. **Alias layer** — map fine taxonomy ids onto the broad engine ids
   (`flight_* → flight`). Cheap, and every flight question gets the same generic
   answer, which is today's behaviour.

Recommendation: alias layer first so the classifier is useful immediately, then
split the intents that alias badly. `flight_baggage` and `flight_missed`
answered with the generic flight-tracking blurb would be actively unhelpful, so
those two want real answers either way.

## 4. Problems found in the taxonomy itself

- **`domner_pro` is marked `grounded: true` but there is no Domner Pro.** No
  product, price, or tier exists anywhere in the app. The only mention is in
  `LAUNCH-CHECKLIST.md:85`, as a future funding idea for paid flight data. A
  grounded answer is impossible; the honest options are to drop the intent or
  answer it as "not available yet."
- **`payment_methods` describes methods the app does not take.** The taxonomy
  says "ABA, Wing, KHQR, card" and its file header repeats "Payments are ABA,
  Wing and KHQR". There is no Wing integration in the repo — `grep -i wing`
  returns nothing. Actual methods, per `DOMNER_FACTS.paymentMethods`: Stripe
  international cards, and KHQR / ABA PayWay. The generation script embeds this
  same wrong claim in its prompt (`scripts/generate-questions.mjs:84`), so it
  will produce training examples asking about Wing.
- **`esim_coverage` and `visa`/`customs` have uneven data depth.** Coverage
  answers work for all 20 destinations, but visa and customs only for 7, and
  scams for 8. A grounded answer must say "I don't have that for this country"
  for the other 13 rather than implying none exist.
- **The file header says "20 destinations"** and that is correct —
  `destinations.length` is 20. The engine's own answer text says "20+".

## 5. Suggested order of work

1. Fix the taxonomy errors in section 4 before generating — the generation
   prompt inherits the Wing mistake and the `domner_pro` fiction.
2. Decide the id reconciliation direction from section 3.
3. Write the grounded answer functions (step 3 of the handoff), including the
   "no data for this country" path.
4. Only then generate and train.
