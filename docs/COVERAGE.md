# Coverage — which countries we can actually sell

## The problem this fixes

Our supplier's catalogue is organised by SKU, not by where a customer is going.
GoHub file a **32-country European roaming plan under the single name "France"**.
The same footprint is also sold as "United Kingdom", "Germany" and "Europe" —
four names, one product.

Until this work, the store rendered one card per SKU. That meant:

- 29 destination cards, so the site looked like it covered 29 countries.
- Searching "Italy", "Portugal", "Norway" or "Spain" returned nothing, even
  though we can put data on a phone in all of them today.
- `/esim/italy` was a 404.
- The plan page said "Works in 33 countries" — it was counting price-list rows,
  and France appears twice (Free Mobile and Wireless France). It is 32.

We were underselling the product we already own.

## What we actually cover

Derived, not asserted — see `data/coverage.ts` and `tests/coverage.test.ts`.

| | |
|---|---|
| Countries we can sell data in | **52** |
| Destination SKUs | 29 |
| Countries with no SKU of their own | 29 |
| Widest single plan | France / UK / Germany / Europe — 32 countries |

The 29 countries that had no page before: Austria, Belgium, Bulgaria, Cyprus,
Czech Republic, Denmark, Estonia, Finland, Hungary, Ireland, Italy,
Liechtenstein, Lithuania, Luxembourg, Malta, Mexico, Moldova, Netherlands,
New Zealand, Norway, Poland, Portugal, Romania, Russia, Slovakia, Spain, Sweden,
Switzerland, Vatican City.

## How the index is built

`data/coverage.ts` expands each destination into the countries it covers, then
inverts the map so any country can find the plans that reach it.

Three resolution cases, in order:

1. **The supplier gave a per-country breakdown** — use it. This is most
   multi-country SKUs, including the Europe footprint.
2. **The breakdown is blank but the SKU name lists countries** — `BUNDLE_MEMBERS`
   in `coverage.ts` spells them out. Today that is Hong Kong · Macao and
   USA · Mexico · Canada.
3. **Neither** — it is a single-country SKU and covers itself.

Everything else is derived from those three cases. Nothing invents coverage.

### The two hand-written parts

- `COUNTRY_REGISTRY` — ISO code, slug, Khmer name and region for every country
  a coverage list names. Also holds supplier aliases, because the price list
  says "United States" where our destination is called "USA".
- `BUNDLE_MEMBERS` — case 2 above.

A supplier country that is not in the registry is **silently dropped** rather
than rendered half-formed. `tests/coverage.test.ts` fails if that ever happens,
so a new GoHub country shows up as a failing test rather than a missing card.

## Cities — `data/cities.ts`

Nobody says "I'm going to France." They say Paris. They say Guangzhou, not
China. The coverage index answers country questions; the city index turns the
question people actually type into a country.

- A city is **a pointer, never a product**. `countrySlug` names a country in
  `COUNTRY_REGISTRY`, and coverage decides which SKU serves it. So Paris →
  France → the France or Europe plan, whichever is cheaper.
- A city whose country we do not sell is **dropped at load**, not rendered.
  Athens and Riga are in the list and stay invisible until GoHub add Greece or
  Latvia — at which point they light up with no code change.
- Aliases carry IATA codes and the other spellings people type: `CAN`,
  `Canton`, `Saigon`, `Peking`, `Macau`.
- Khmer spellings are given where they are settled in Khmer-language media, and
  omitted rather than transliterated by guesswork.

Both search boxes read it:

| Search | Behaviour |
|---|---|
| Homepage search bar | **Sells plans only** — see `data/esimSearch.ts`. Every row is a country, a bundle, or the country a city sits in, priced "eSIM from $3.99", and pressing one goes to `/esim/<slug>`. No guide rows, and no "we haven't written this guide yet" screen: that was an editorial answer to a shopping question. The written guides are still reached from the globe pins and from `/explore`. |
| `/esim` store search | A city query filters the country grid and the top grid — "Guangzhou" surfaces China, "Paris" surfaces France and the Europe bundle. |

Ranking in both: product names first (exact 70, prefix 55, contained 25), then
cities one point below a name that matched as well, so "chi" leads with China
rather than Chiang Mai. A city's weight (0–10) only orders cities among
themselves.

## What the store shows

Four tabs on `/esim`:

| Tab | Contents |
|---|---|
| **Top destinations** | `popular: true` — what Cambodians actually buy |
| **Countries** | All 52, each card naming the plan that serves it |
| **Regions** | Multi-country bundles, plus country SKUs that roam (France's 32) |
| **Global** | Every plan crossing three or more countries, widest first |

The region chips (Southeast Asia, East Asia, Europe …) belong to the
**Countries** tab only. Top destinations is already a short curated grid, and a
region chip left switched on there quietly hid most of it. Switching away from
Countries resets the filter rather than leaving it applied off screen.

A country card for Italy says *"Covered by the France plan"*, and
`/esim/italy` repeats it above the plans. The customer learns which product they
are buying before they pay, not when the order confirmation arrives.

## There is no global eSIM

The Global tab shows the widest plans we have. It does **not** show a worldwide
eSIM, because GoHub's price list has no such SKU and rule 8 forbids inventing
one. The tab says so in plain language.

If we want a true global plan, it has to come from the supplier first.

## Regenerating

`data/gohubNetworks.ts` and `data/gohubCatalog.ts` are generated:

```bash
node scripts/build-gohub-catalog.mjs <GOHUB_PRICE_US_SILVER*.xlsx>
npx vitest run tests/coverage.test.ts
```

If GoHub add a country, the test fails with its name. Add it to
`COUNTRY_REGISTRY` — ISO code, slug, Khmer name, region — and it appears
everywhere: store, country page, coverage list, sitemap.
