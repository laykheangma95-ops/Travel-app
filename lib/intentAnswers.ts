// ─────────────────────────────────────────────────────────────────────────────
// Grounded intent answers — computed from Domner's own data, never hardcoded.
//
// WHAT THIS IS:
//   The 15 intents marked `grounded: true` in data/intentTaxonomy.js must never
//   have their answers written by hand. A hand-written "$3.99" goes stale the
//   moment someone edits data/destinations.ts, and a chatbot quoting a price we
//   no longer charge is worse than one that says "check the store".
//
//   So every function here READS the answer out of the data files:
//     data/destinations.ts   countries, currencies, carriers, base prices
//     data/esimPlans.ts      tiers, durations, daily data, real prices
//     data/customsRules.ts   visa rules, cash limits, per-country notes
//     data/scamAlerts.ts     known scams per country
//     data/emergencyPhrases  which languages have offline phrases
//     lib/domnerBrain.ts     DOMNER_FACTS (payment methods, support channel)
//
//   Add a country or change a price in those files and these answers update
//   themselves. Nothing here needs editing.
//
// NOT WIRED IN YET:
//   domnerEngine.ts does not import this file. Wiring happens in step 5 of
//   docs/HANDOFF.md, once the answers below have been reviewed.
//
// THE RULE WHEN DATA IS MISSING:
//   Visa and customs data covers 7 of 20 destinations; scam data covers 6. When
//   a traveller asks about a country we have no data for, these functions say
//   so plainly and name the countries we DO cover. They never guess, and never
//   imply the country has no rules just because we have no row for it.
// ─────────────────────────────────────────────────────────────────────────────

import { destinations, USD_TO_KHR } from '@/data/destinations';
import { esimPlans } from '@/data/esimPlans';
import { customsRules } from '@/data/customsRules';
import { scamAlerts } from '@/data/scamAlerts';
import type { ScamAlert } from '@/types';
import { phraseLanguages } from '@/data/emergencyPhrases';
import { DOMNER_FACTS } from '@/lib/domnerBrain';

export type Lang = 'km' | 'en';

/** What the engine knows at answer time: the language, and the country (if any). */
export interface AnswerInput {
  lang: Lang;
  /** Destination slug detected in the message, or null if none was named. */
  country: string | null;
}

export type GroundedAnswer = (input: AnswerInput) => string;

// ── Formatting helpers ───────────────────────────────────────────────────────

const money = (n: number) => `$${n.toFixed(2)}`;

/** Khmer digits, so numbers read from data still look native in Khmer replies. */
function khNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => '០១២៣៤៥៦៧៨៩'[Number(d)]);
}

/** Render a number in the reply's own script. */
const num = (n: number | string, lang: Lang) => (lang === 'km' ? khNum(n) : String(n));

const moneyIn = (n: number, lang: Lang) => (lang === 'km' ? `$${khNum(n.toFixed(2))}` : money(n));

/** Whole-dollar amounts with thousand separators, for cash-declaration limits. */
const bigMoney = (n: number, lang: Lang) => {
  const grouped = n.toLocaleString('en-US');
  return lang === 'km' ? `$${khNum(grouped)}` : `$${grouped}`;
};

/** "a, b and c" / "a, b និង c" */
function list(items: string[], lang: Lang): string {
  if (items.length <= 1) return items.join('');
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(', ')} ${lang === 'km' ? 'និង' : 'and'} ${last}`;
}

const nameOf = (slug: string, lang: Lang): string => {
  const d = destinations.find((x) => x.slug === slug);
  if (!d) return slug;
  return `${lang === 'km' ? d.nameKm : d.name} ${d.flag}`;
};

const CONTACT = (lang: Lang) =>
  lang === 'km'
    ? `សូមទាក់ទងក្រុមការងារ Domner តាម Telegram៖ ${DOMNER_FACTS.supportTelegram}`
    : `Contact Domner support on Telegram: ${DOMNER_FACTS.supportTelegram}`;

// ── Catalogue introspection ──────────────────────────────────────────────────
// The tier line-up (how many tiers, what each includes) is READ from the plan
// catalogue rather than restated here, so adding a fourth tier needs no edit.

interface TierSpec {
  tier: string;
  name: string;
  durationDays: number;
  dataGbDaily: number;
  popular: boolean;
  minPriceUsd: number;
  maxPriceUsd: number;
}

/** Distinct tiers in catalogue order, with their real price range across countries. */
function tierSpecs(slug?: string | null): TierSpec[] {
  const pool = slug ? esimPlans.filter((p) => p.countrySlug === slug) : esimPlans;
  const out = new Map<string, TierSpec>();
  for (const p of pool) {
    const existing = out.get(p.tier);
    if (!existing) {
      out.set(p.tier, {
        tier: p.tier,
        name: p.name,
        durationDays: p.durationDays,
        dataGbDaily: p.dataGbDaily,
        popular: p.popular,
        minPriceUsd: p.priceUsd,
        maxPriceUsd: p.priceUsd,
      });
    } else {
      existing.minPriceUsd = Math.min(existing.minPriceUsd, p.priceUsd);
      existing.maxPriceUsd = Math.max(existing.maxPriceUsd, p.priceUsd);
    }
  }
  return Array.from(out.values());
}

/** "Basic ៣ថ្ងៃ ១GB/ថ្ងៃ $៣.៩៩" — one tier, priced for a country if given. */
function tierLine(t: TierSpec, lang: Lang, exact: boolean): string {
  const price = exact
    ? moneyIn(t.minPriceUsd, lang)
    : t.minPriceUsd === t.maxPriceUsd
      ? moneyIn(t.minPriceUsd, lang)
      : `${moneyIn(t.minPriceUsd, lang)}–${moneyIn(t.maxPriceUsd, lang)}`;
  const popular = t.popular ? (lang === 'km' ? ' — ពេញនិយម' : ' — most popular') : '';
  return lang === 'km'
    ? `${t.name} ${price} (${khNum(t.durationDays)}ថ្ងៃ, ${khNum(t.dataGbDaily)}GB/ថ្ងៃ)${popular}`
    : `${t.name} ${price} (${t.durationDays} days, ${t.dataGbDaily}GB/day)${popular}`;
}

/** Countries grouped by region, for coverage answers. */
function coverageByRegion(lang: Lang): string {
  const groups = new Map<string, string[]>();
  for (const d of destinations) {
    if (!groups.has(d.region)) groups.set(d.region, []);
    groups.get(d.region)!.push(lang === 'km' ? d.nameKm : d.name);
  }
  return Array.from(groups.entries())
    .map(([region, names]) => `${region}: ${names.join(', ')}`)
    .join('\n');
}

const covered = (slug: string | null): boolean =>
  !!slug && destinations.some((d) => d.slug === slug);

/** Names of the countries that have a row in a per-country data file. */
function slugsWithData(slugs: string[], lang: Lang): string {
  const uniq = Array.from(new Set(slugs));
  return list(
    uniq.map((s) => nameOf(s, lang)),
    lang,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The 15 grounded answers
// ─────────────────────────────────────────────────────────────────────────────

/** esim_price — exact tier prices for a country, or the catalogue's entry point. */
const esim_price: GroundedAnswer = ({ lang, country }) => {
  if (covered(country)) {
    const tiers = tierSpecs(country);
    const lines = tiers.map((t) => tierLine(t, lang, true)).join(' · ');
    const d = destinations.find((x) => x.slug === country)!;
    return lang === 'km'
      ? `${nameOf(country!, lang)}៖ ${lines}។ បណ្តាញ ${d.networkTech}។`
      : `${nameOf(country!, lang)}: ${lines}. ${d.networkTech} network.`;
  }

  const cheapest = Math.min(...esimPlans.map((p) => p.priceUsd));
  const popular = destinations.filter((d) => d.popular);
  const examples = popular
    .slice(0, 5)
    .map((d) => `${lang === 'km' ? d.nameKm : d.name} ${d.flag} ${moneyIn(d.fromPriceUsd, lang)}`)
    .join(', ');
  return lang === 'km'
    ? `eSIM គ្របដណ្តប់ ${khNum(destinations.length)} ប្រទេស ចាប់ពី ${moneyIn(cheapest, lang)}។ ឧទាហរណ៍៖ ${examples}។ ប្រាប់ខ្ញុំពីប្រទេស ខ្ញុំនឹងបង្ហាញតម្លៃពិតប្រាកដ។`
    : `Our eSIMs cover ${destinations.length} countries from ${money(cheapest)}. Examples: ${examples}. Tell me the country and I'll give exact prices.`;
};

/** esim_plan_compare — what separates the tiers, priced from the catalogue. */
const esim_plan_compare: GroundedAnswer = ({ lang, country }) => {
  const exact = covered(country);
  const tiers = tierSpecs(exact ? country : null);
  const lines = tiers.map((t) => `• ${tierLine(t, lang, exact)}`).join('\n');
  const head = exact
    ? lang === 'km'
      ? `គម្រោងសម្រាប់ ${nameOf(country!, lang)}៖`
      : `Plans for ${nameOf(country!, lang)}:`
    : lang === 'km'
      ? `គ្រប់ប្រទេសមាន ${khNum(tiers.length)} កម្រិត (តម្លៃប្រែប្រួលតាមប្រទេស)៖`
      : `Every country has ${tiers.length} tiers (prices vary by country):`;
  return `${head}\n${lines}`;
};

/** esim_data_amount — daily allowance and the trip total it works out to. */
const esim_data_amount: GroundedAnswer = ({ lang, country }) => {
  const tiers = tierSpecs(covered(country) ? country : null);
  const lines = tiers
    .map((t) => {
      const total = t.dataGbDaily * t.durationDays;
      return lang === 'km'
        ? `• ${t.name}៖ ${khNum(t.dataGbDaily)}GB/ថ្ងៃ × ${khNum(t.durationDays)}ថ្ងៃ = ${khNum(total)}GB សរុប`
        : `• ${t.name}: ${t.dataGbDaily}GB/day × ${t.durationDays} days = ${total}GB total`;
    })
    .join('\n');
  return lang === 'km'
    ? `ទិន្នន័យត្រូវបានកំណត់ជារៀងរាល់ថ្ងៃ៖\n${lines}\nគ្រប់គម្រោងរួមបញ្ចូល hotspot។`
    : `Data is a daily allowance, not one pooled bucket:\n${lines}\nEvery plan includes hotspot.`;
};

/** esim_validity — how long each tier lasts. */
const esim_validity: GroundedAnswer = ({ lang, country }) => {
  const tiers = tierSpecs(covered(country) ? country : null);
  const lines = tiers
    .map((t) =>
      lang === 'km'
        ? `• ${t.name}៖ ${khNum(t.durationDays)} ថ្ងៃ`
        : `• ${t.name}: ${t.durationDays} days`,
    )
    .join('\n');
  return lang === 'km'
    ? `រយៈពេលនៃគម្រោង៖\n${lines}\nសូមដំឡើង eSIM មុនពេលហោះ (ត្រូវការ Wi-Fi) ប៉ុន្តែបើកដំណើរការតែពេលចុះដល់គោលដៅ។`
    : `Plan lengths:\n${lines}\nInstall the eSIM before you fly (needs Wi-Fi), but only turn it on when you land.`;
};

/** esim_coverage — is this country available, and what else is. */
const esim_coverage: GroundedAnswer = ({ lang, country }) => {
  if (covered(country)) {
    const d = destinations.find((x) => x.slug === country)!;
    return lang === 'km'
      ? `បាទ/ចាស — ${nameOf(country!, lang)} មានក្នុងបញ្ជី ចាប់ពី ${moneyIn(d.fromPriceUsd, lang)} លើបណ្តាញ ${d.networks.join(' & ')}។`
      : `Yes — ${nameOf(country!, lang)} is covered, from ${money(d.fromPriceUsd)} on ${d.networks.join(' & ')}.`;
  }
  return lang === 'km'
    ? `យើងគ្របដណ្តប់ ${khNum(destinations.length)} ប្រទេស៖\n${coverageByRegion(lang)}\nបើប្រទេសដែលអ្នកត្រូវការមិនមានក្នុងបញ្ជីនេះ សូមប្រាប់ខ្ញុំ។`
    : `We cover ${destinations.length} countries:\n${coverageByRegion(lang)}\nIf the country you need isn't listed, tell me and I'll pass it on.`;
};

/**
 * esim_multi_country — every plan in the catalogue is tied to ONE countrySlug,
 * so there is no regional plan to offer. This answer states that honestly
 * rather than inventing a product.
 */
const esim_multi_country: GroundedAnswer = ({ lang }) => {
  const perCountry = esimPlans.every((p) => !!p.countrySlug);
  const cheapest = Math.min(...esimPlans.map((p) => p.priceUsd));
  if (!perCountry) {
    // A multi-country plan was added to the catalogue — do not claim otherwise.
    return lang === 'km' ? CONTACT(lang) : CONTACT(lang);
  }
  return lang === 'km'
    ? `បច្ចុប្បន្ន គម្រោងនីមួយៗសម្រាប់ប្រទេសមួយ — យើងមិនមានគម្រោងតំបន់ច្រើនប្រទេសទេ។ សម្រាប់ដំណើរច្រើនប្រទេស សូមទិញ eSIM មួយក្នុងមួយប្រទេស (ចាប់ពី ${moneyIn(cheapest, lang)})។ អ្នកអាចដំឡើងច្រើន eSIM ក្នុងទូរស័ព្ទ ហើយប្តូរនៅពេលឆ្លងកាត់ព្រំដែន។`
    : `Right now each plan covers a single country — we don't sell a multi-country regional plan. For a multi-stop trip, buy one eSIM per country (from ${money(cheapest)}). You can install several on the phone and switch as you cross borders.`;
};

/** esim_network — which carriers and what speed, per country. */
const esim_network: GroundedAnswer = ({ lang, country }) => {
  if (covered(country)) {
    const d = destinations.find((x) => x.slug === country)!;
    return lang === 'km'
      ? `នៅ ${nameOf(country!, lang)} eSIM ភ្ជាប់ទៅ ${d.networks.join(' & ')} — ${d.networkTech}, គុណភាព ${d.networkQuality}។`
      : `In ${nameOf(country!, lang)} the eSIM connects to ${d.networks.join(' & ')} — ${d.networkTech}, ${d.networkQuality} quality.`;
  }
  const techs = Array.from(new Set(destinations.map((d) => d.networkTech)));
  return lang === 'km'
    ? `បណ្តាញប្រែប្រួលតាមប្រទេស (${techs.join(', ')}) ហើយ eSIM ភ្ជាប់ទៅប្រតិបត្តិករធំៗក្នុងស្រុក។ ប្រាប់ខ្ញុំពីប្រទេស ខ្ញុំនឹងបង្ហាញឈ្មោះបណ្តាញពិត។`
    : `Network depends on the country (${techs.join(', ')}); the eSIM connects to major local carriers. Tell me the country and I'll name the exact networks.`;
};

/** visa — from customsRules.visaInfo. Only 7 of 20 countries have a row. */
const visa: GroundedAnswer = ({ lang, country }) => {
  const rule = country ? customsRules.find((c) => c.countrySlug === country) : undefined;
  if (rule) {
    return lang === 'km'
      ? `${nameOf(rule.countrySlug, lang)} — ${rule.visaInfo} ស្នាក់នៅបានរហូតដល់ ${khNum(rule.maxStayDays)} ថ្ងៃ។ សូមផ្ទៀងផ្ទាត់ជាមួយស្ថានទូតមុនពេលធ្វើដំណើរ ព្រោះវិធានអាចផ្លាស់ប្តូរ។`
      : `${nameOf(rule.countrySlug, lang)} — ${rule.visaInfo} Stay up to ${rule.maxStayDays} days. Always reconfirm with the embassy before you travel, as rules change.`;
  }
  const have = slugsWithData(
    customsRules.map((c) => c.countrySlug),
    lang,
  );
  if (!country) {
    return lang === 'km'
      ? `តើប្រទេសណា? ខ្ញុំមានព័ត៌មានវីសាសម្រាប់៖ ${have}។`
      : `Which country? I have visa information for: ${have}.`;
  }
  const which = covered(country) ? nameOf(country, lang) : lang === 'km' ? 'ប្រទេសនោះ' : 'that country';
  return lang === 'km'
    ? `ខ្ញុំមិនមានព័ត៌មានវីសាសម្រាប់ ${which} ទេ — នេះមិនមានន័យថាគ្មានវិធានទេ គ្រាន់តែខ្ញុំមិនមានទិន្នន័យ។ ខ្ញុំមានសម្រាប់៖ ${have}។ ${CONTACT(lang)}`
    : `I don't have visa information for ${which} — that doesn't mean there are no requirements, only that I have no data for it. I do have: ${have}. ${CONTACT(lang)}`;
};

/** customs — cash limits and per-country notes from customsRules. */
const customs: GroundedAnswer = ({ lang, country }) => {
  const rule = country ? customsRules.find((c) => c.countrySlug === country) : undefined;
  if (rule) {
    const notes = rule.notes.map((n) => `• ${n}`).join('\n');
    return lang === 'km'
      ? `${nameOf(rule.countrySlug, lang)} — សាច់ប្រាក់លើស ${bigMoney(rule.maxCashUsd, lang)} ត្រូវប្រកាស។\n${notes}`
      : `${nameOf(rule.countrySlug, lang)} — cash above ${bigMoney(rule.maxCashUsd, lang)} must be declared.\n${notes}`;
  }
  const have = slugsWithData(
    customsRules.map((c) => c.countrySlug),
    lang,
  );
  if (!country) {
    return lang === 'km'
      ? `តើប្រទេសណា? ខ្ញុំមានវិធានគយសម្រាប់៖ ${have}។`
      : `Which country? I have customs rules for: ${have}.`;
  }
  const which = covered(country) ? nameOf(country, lang) : lang === 'km' ? 'ប្រទេសនោះ' : 'that country';
  return lang === 'km'
    ? `ខ្ញុំមិនមានវិធានគយសម្រាប់ ${which} ទេ។ ខ្ញុំមានសម្រាប់៖ ${have}។ ${CONTACT(lang)}`
    : `I don't have customs rules for ${which}. I do have: ${have}. ${CONTACT(lang)}`;
};

/** currency — local currency and rate, from destinations. All 20 covered. */
const currency: GroundedAnswer = ({ lang, country }) => {
  if (covered(country)) {
    const d = destinations.find((x) => x.slug === country)!;
    const rate = `${num(1, lang)} USD ≈ ${num(d.usdRate, lang)} ${d.currency}`;
    return lang === 'km'
      ? `${nameOf(country!, lang)} ប្រើ ${d.currency} (${rate})។ តម្លៃ Domner ទាំងអស់ជា USD (${khNum(USD_TO_KHR)} រៀល ក្នុង ១ ដុល្លារ)។ អត្រាប្តូរប្រាក់ពិតប្រាកដប្រែប្រួលរាល់ថ្ងៃ។`
      : `${nameOf(country!, lang)} uses ${d.currency} (${rate}). All Domner prices are in USD. Live exchange rates move daily, so treat this as a guide.`;
  }
  return lang === 'km'
    ? `តម្លៃ Domner ទាំងអស់ជា USD។ សម្រាប់អ្នកនៅកម្ពុជា ១ ដុល្លារ ≈ ${khNum(USD_TO_KHR)} រៀល។ ប្រាប់ខ្ញុំពីប្រទេស ខ្ញុំនឹងបង្ហាញរូបិយប័ណ្ណក្នុងស្រុក។`
    : `All Domner prices are in USD. In Cambodia, 1 USD ≈ ${USD_TO_KHR} riel. Tell me the destination and I'll give its local currency and rate.`;
};

/** safety_scams — real alerts from scamAlerts. Only 6 countries have any. */
const safety_scams: GroundedAnswer = ({ lang, country }) => {
  const alerts = country ? scamAlerts.filter((s) => s.countrySlug === country) : [];
  if (alerts.length) {
    const SEV_KM: Record<ScamAlert['severity'], string> = { high: 'ខ្ពស់', medium: 'មធ្យម', low: 'ទាប' };
    const sev = (s: ScamAlert['severity']) => (lang === 'km' ? SEV_KM[s] : s);
    const lines = alerts.map((a) => `• [${sev(a.severity)}] ${a.title} — ${a.description}`).join('\n');
    return lang === 'km'
      ? `ការប្រុងប្រយ័ត្នសម្រាប់ ${nameOf(country!, lang)}៖\n${lines}`
      : `Known scams in ${nameOf(country!, lang)}:\n${lines}`;
  }
  const have = slugsWithData(
    scamAlerts.map((s) => s.countrySlug),
    lang,
  );
  if (!country) {
    return lang === 'km'
      ? `តើប្រទេសណា? ខ្ញុំមានព័ត៌មានការឆបោកសម្រាប់៖ ${have}។`
      : `Which country? I have scam details for: ${have}.`;
  }
  const which = covered(country) ? nameOf(country, lang) : lang === 'km' ? 'ប្រទេសនោះ' : 'that country';
  return lang === 'km'
    ? `ខ្ញុំមិនមានបញ្ជីការឆបោកសម្រាប់ ${which} ទេ — សូមប្រុងប្រយ័ត្នជាទូទៅ (តាក់ស៊ីមានម៉ែត្រ, កុំដូរប្រាក់តាមផ្លូវ)។ ខ្ញុំមានព័ត៌មានលម្អិតសម្រាប់៖ ${have}។`
    : `I don't have a scam list for ${which} — general caution still applies (metered taxis, no street money changers). I do have details for: ${have}.`;
};

/**
 * emergency — grounded in which offline phrase languages actually ship.
 * Deliberately does NOT state local emergency numbers: no data file holds them,
 * and a wrong emergency number is the most dangerous thing this bot could say.
 */
const emergency: GroundedAnswer = ({ lang, country }) => {
  // The phrase pack is keyed by language, not country, so map the ones we ship.
  const LANG_FOR_COUNTRY: Record<string, string> = {
    vietnam: 'vi',
    thailand: 'th',
    china: 'zh',
    japan: 'ja',
    singapore: 'en',
  };
  const code = country ? LANG_FOR_COUNTRY[country] : undefined;
  const match = code ? phraseLanguages.find((p) => p.code === code) : undefined;
  const available = phraseLanguages.map((p) => `${p.name} ${p.flag}`).join(', ');

  const head = match
    ? lang === 'km'
      ? `ឃ្លាអាសន្នជា${match.name} ${match.flag} មានក្នុងកម្មវិធី ហើយដំណើរការ offline (${khNum(match.categories.length)} ប្រភេទ)។`
      : `Offline emergency phrases in ${match.name} ${match.flag} are in the app (${match.categories.length} categories).`
    : lang === 'km'
      ? `ផ្នែក Emergency Phrases ដំណើរការ offline ហើយមានភាសា៖ ${available}។`
      : `The Emergency Phrases section works offline and covers: ${available}.`;

  return lang === 'km'
    ? `${head}\nក្នុងករណីអាសន្នពិត សូមទូរស័ព្ទទៅលេខសង្គ្រោះបន្ទាន់ក្នុងស្រុក — ខ្ញុំមិនផ្តល់លេខទេ ដើម្បីកុំឲ្យខុស។ សូមសួរបុគ្គលិកសណ្ឋាគារ ឬប៉ូលិសនៅជិតបំផុត។ ${CONTACT(lang)}`
    : `${head}\nIn a real emergency call the local emergency number — I won't quote one, because a wrong number costs time you may not have. Ask hotel staff or the nearest police post. ${CONTACT(lang)}`;
};

/** payment_methods — read from DOMNER_FACTS, not restated. */
const payment_methods: GroundedAnswer = ({ lang }) => {
  const methods = list([...DOMNER_FACTS.paymentMethods], lang);
  return lang === 'km'
    ? `Domner ទទួល៖ ${methods}។ តម្លៃទាំងអស់បង្ហាញជា USD។`
    : `Domner accepts: ${methods}. All prices are shown in USD.`;
};

/**
 * domner_pro — the taxonomy marks this grounded, but NO Domner Pro product
 * exists in the app: no plan, no price, no tier anywhere in the data files.
 * The only honest grounded answer is that it isn't available. Do not invent
 * pricing here — if Pro ships, add it to the data and rewrite this from it.
 */
const domner_pro: GroundedAnswer = ({ lang }) => {
  return lang === 'km'
    ? `បច្ចុប្បន្ន Domner មិនមានការជាវ Pro ទេ — មុខងារទាំងអស់ដែលមាន គឺបើកសម្រាប់អ្នកទាំងអស់គ្នា ហើយអ្នកបង់ថ្លៃតែ eSIM ដែលអ្នកទិញ។ បើយើងចេញ Pro យើងនឹងប្រកាស។`
    : `There's no Domner Pro subscription today — every feature in the app is open to everyone, and you only pay for the eSIMs you buy. If we launch Pro, we'll announce it.`;
};

/** products — feature list, with the country count read from the catalogue. */
const products: GroundedAnswer = ({ lang }) => {
  const tiers = tierSpecs();
  const cheapest = Math.min(...esimPlans.map((p) => p.priceUsd));
  return lang === 'km'
    ? `${DOMNER_FACTS.brand} — "${DOMNER_FACTS.tagline}"\n① eSIM សម្រាប់ ${khNum(destinations.length)} ប្រទេស (${khNum(tiers.length)} កម្រិត, ចាប់ពី ${moneyIn(cheapest, lang)})\n② Flight Guardian តាមដានជើងហោះហើរផ្ទាល់\n③ Airport Companion មគ្គុទេសក៍ព្រលានយន្តហោះ\n④ "Am I Ready?" checklist\n⑤ ឃ្លាអាសន្ន offline (${khNum(phraseLanguages.length)} ភាសា)\n⑥ វិធានគយ និងការប្រុងប្រយ័ត្នការឆបោក`
    : `${DOMNER_FACTS.brand} — "${DOMNER_FACTS.tagline}"\n① eSIMs for ${destinations.length} countries (${tiers.length} tiers, from ${money(cheapest)})\n② Flight Guardian live flight tracking\n③ Airport Companion airport guides\n④ The "Am I Ready?" checklist\n⑤ Offline emergency phrases (${phraseLanguages.length} languages)\n⑥ Customs rules and scam alerts`;
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GROUNDED_ANSWERS — keyed by the taxonomy ids marked `grounded: true`.
 * scripts/intent-gap.mjs cross-checks these keys against GROUNDED_IDS.
 */
export const GROUNDED_ANSWERS: Record<string, GroundedAnswer> = {
  esim_price,
  esim_plan_compare,
  esim_data_amount,
  esim_validity,
  esim_coverage,
  esim_multi_country,
  esim_network,
  visa,
  customs,
  currency,
  safety_scams,
  emergency,
  payment_methods,
  domner_pro,
  products,
};

export const GROUNDED_ANSWER_IDS = Object.keys(GROUNDED_ANSWERS);
