// ─────────────────────────────────────────────────────────────────────────────
// Domner In-App Assistant Engine — the chatbot's own "brain", self-hosted.
//
// WHAT THIS IS (for beginners):
//   This is Domner's OWN chatbot engine. It runs entirely inside our app on our
//   own server — it does NOT call any outside AI service (no OpenAI, no
//   OpenRouter, no paid API keys). That means:
//     • It is FREE to run — it can never fail with a "no credits" / 402 error.
//     • It always answers instantly, even offline from third-party providers.
//     • Every answer is grounded in OUR real business data (eSIM prices,
//       countries, visa rules, currency rates, scam alerts, policies), so it
//       can't "hallucinate" wrong facts.
//
//   How it "thinks": for each traveller message it (1) detects the language,
//   (2) figures out the topic by matching keywords (in Khmer AND English) and
//   which country (if any) they mentioned, then (3) replies with a ready,
//   accurate answer built from our live data files. As we add countries or
//   change prices in data/*.ts, the answers update automatically — the engine
//   keeps learning from our own catalogue.
//
// HOW TO TEACH IT NATURAL LANGUAGE (this is the important part):
//   Real customers don't ask questions in one fixed way. They say "how do I set
//   up my sim", "my esim isn't working", "do i need a visa for thailand",
//   "is bangkok safe", "how much is the yen"… The engine understands these
//   because each INTENT below carries a LONG list of the different ways people
//   phrase the same thing (synonyms, slang, typos-of-intent, Khmer + English).
//   To make the copilot understand a new phrasing, just add it to the right
//   intent's `keywords`. To teach a whole new topic, add a new INTENT entry.
//   No AI/ML knowledge is needed — it's plain text.
// ─────────────────────────────────────────────────────────────────────────────

import { destinations, USD_TO_KHR } from '@/data/destinations';
import { esimPlans } from '@/data/esimPlans';
import { customsRules } from '@/data/customsRules';
import { scamAlerts } from '@/data/scamAlerts';
import { DOMNER_FACTS } from '@/lib/domnerBrain';

// ── Conversation shapes (must match app/api/chat/route.ts) ───────────────────
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface ChatContext {
  flightNumber?: string | null;
  flightSummary?: string | null;
}

type Lang = 'km' | 'en';

// A bilingual string: Khmer + English versions of the same answer.
interface Bilingual {
  km: string;
  en: string;
}
const pick = (b: Bilingual, lang: Lang) => (lang === 'km' ? b.km : b.en);

// ── Language detection ───────────────────────────────────────────────────────
// If the message contains Khmer script (Unicode block U+1780–U+17FF) we reply in
// Khmer; otherwise we reply in English. This matches the traveller's language.
function detectLang(text: string): Lang {
  return /[ក-៿]/.test(text) ? 'km' : 'en';
}

// ── Small helpers over our real data ─────────────────────────────────────────
const money = (n: number) => `$${n.toFixed(2)}`;
// Human-friendly number, e.g. 25400 → "25,400".
const num = (n: number) => n.toLocaleString('en-US');

function priceFor(slug: string, tier: 'basic' | 'standard' | 'premium'): number | undefined {
  return esimPlans.find((p) => p.countrySlug === slug && p.tier === tier)?.priceUsd;
}

function destName(slug: string, lang: Lang): string | null {
  const dest = destinations.find((d) => d.slug === slug);
  if (!dest) return null;
  return lang === 'km' ? `${dest.nameKm} ${dest.flag}` : `${dest.name} ${dest.flag}`;
}

// Build a one-line price summary for a specific country from live data.
function countryPriceLine(slug: string, lang: Lang): string | null {
  const dest = destinations.find((d) => d.slug === slug);
  if (!dest) return null;
  const basic = priceFor(slug, 'basic');
  const standard = priceFor(slug, 'standard');
  const premium = priceFor(slug, 'premium');
  const name = lang === 'km' ? `${dest.nameKm} ${dest.flag}` : `${dest.name} ${dest.flag}`;
  if (basic == null || standard == null || premium == null) {
    return lang === 'km'
      ? `${name}: ចាប់ពី ${money(dest.fromPriceUsd)}។`
      : `${name}: from ${money(dest.fromPriceUsd)}.`;
  }
  return lang === 'km'
    ? `${name}: Basic ${money(basic)} (៣ថ្ងៃ, ១GB/ថ្ងៃ), Standard ${money(
        standard,
      )} (៧ថ្ងៃ, ២GB/ថ្ងៃ — ពេញនិយម), Premium ${money(premium)} (១៥ថ្ងៃ, ៣GB/ថ្ងៃ)។ បណ្តាញ ${dest.networkTech}។`
    : `${name}: Basic ${money(basic)} (3 days, 1GB/day), Standard ${money(
        standard,
      )} (7 days, 2GB/day — most popular), Premium ${money(premium)} (15 days, 3GB/day). ${dest.networkTech} network.`;
}

// Visa / entry info for a country, straight from data/customsRules.ts.
function countryVisaLine(slug: string, lang: Lang): string | null {
  const rule = customsRules.find((c) => c.countrySlug === slug);
  const name = destName(slug, lang);
  if (!rule || !name) return null;
  return lang === 'km'
    ? `${name}៖ ${rule.visaInfo} ការស្នាក់នៅអតិបរមាជាទូទៅ ${rule.maxStayDays} ថ្ងៃ។ សូមផ្ទៀងផ្ទាត់ជាមួយស្ថានទូតជានិច្ចមុនពេលធ្វើដំណើរ ព្រោះលក្ខខណ្ឌអាចផ្លាស់ប្តូរ។`
    : `${name}: ${rule.visaInfo} Typical maximum stay is ${rule.maxStayDays} days. Always confirm with the embassy before you fly, as rules can change.`;
}

// Customs / cash-declaration info for a country.
function countryCustomsLine(slug: string, lang: Lang): string | null {
  const rule = customsRules.find((c) => c.countrySlug === slug);
  const name = destName(slug, lang);
  if (!rule || !name) return null;
  const notes = rule.notes.slice(0, 2).join(lang === 'km' ? '។ ' : '. ');
  return lang === 'km'
    ? `${name}៖ ត្រូវប្រកាសប្រាក់សុទ្ធលើសពី $${num(rule.maxCashUsd)}។ ${notes}។`
    : `${name}: cash over $${num(rule.maxCashUsd)} must be declared. ${notes}.`;
}

// Currency / exchange-rate info, using each destination's stored rate.
function countryCurrencyLine(slug: string, lang: Lang): string | null {
  const dest = destinations.find((d) => d.slug === slug);
  if (!dest) return null;
  const name = destName(slug, lang)!;
  const rate = dest.usdRate === 1 ? '1' : num(dest.usdRate);
  return lang === 'km'
    ? `${name}៖ $1 ≈ ${rate} ${dest.currency} (អត្រាប្រហាក់ប្រហែល — ផ្ទៀងផ្ទាត់នៅកន្លែងប្តូរប្រាក់)។ នៅកម្ពុជា $1 ≈ ${num(
        USD_TO_KHR,
      )}៛។ ប្តូរប្រាក់នៅធនាគារ ឬបញ្ជរមានអាជ្ញាប័ណ្ណ ហើយរាប់លុយមុនចាកចេញ។`
    : `${name}: $1 ≈ ${rate} ${dest.currency} (approximate — confirm at the exchange counter). In Cambodia, $1 ≈ ${num(
        USD_TO_KHR,
      )}៛. Exchange at banks or licensed counters, and count your notes before leaving.`;
}

// Scam / safety alerts for a country, straight from data/scamAlerts.ts.
function countryScamLine(slug: string, lang: Lang): string | null {
  const name = destName(slug, lang);
  if (!name) return null;
  const alerts = scamAlerts.filter((s) => s.countrySlug === slug);
  if (alerts.length === 0) {
    return lang === 'km'
      ? `${name} ជាទូទៅមានសុវត្ថិភាពសម្រាប់ភ្ញៀវទេសចរ។ ការប្រុងប្រយ័ត្នធម្មតា៖ ប្រើតែតាក់ស៊ី/Grab ផ្លូវការ, ព្រមព្រៀងតម្លៃមុនជិះ, កុំបង្ហាញលុយច្រើន និងរក្សា passport ឲ្យមានសុវត្ថិភាព។`
      : `${name} is generally safe for tourists. Usual precautions: use only official taxis/Grab, agree the price before you ride, don't flash large amounts of cash, and keep your passport secure.`;
  }
  const top = alerts.slice(0, 2).map((a) => (lang === 'km' ? `${a.title} — ${a.description}` : `${a.title} — ${a.description}`));
  return lang === 'km'
    ? `${name} — ការជូនដំណឹងសុវត្ថិភាព៖\n• ${top.join('\n• ')}\nមើលការជូនដំណឹងទាំងអស់ក្នុងផ្នែក Scam Alerts ក្នុងកម្មវិធី។`
    : `${name} — safety heads-up:\n• ${top.join('\n• ')}\nSee all alerts in the Scam Alerts section of the app.`;
}

// Common short names / nicknames / major cities travellers use → destination
// slug. This lets "korea", "uk", "dubai", "bangkok", "seoul", etc. resolve to
// the right catalogue entry — the way people naturally refer to places.
const COUNTRY_ALIASES: Record<string, string> = {
  // Nicknames & alternate country names
  korea: 'south-korea',
  's korea': 'south-korea',
  'south korea': 'south-korea',
  uk: 'united-kingdom',
  england: 'united-kingdom',
  britain: 'united-kingdom',
  'great britain': 'united-kingdom',
  america: 'usa',
  'united states': 'usa',
  'the states': 'usa',
  us: 'usa',
  dubai: 'uae',
  'abu dhabi': 'uae',
  emirates: 'uae',
  hongkong: 'hong-kong',
  aussie: 'australia',
  oz: 'australia',
  filipino: 'philippines',
  nippon: 'japan',
  bharat: 'india',
  // Major cities → country (very common in real questions)
  bangkok: 'thailand',
  phuket: 'thailand',
  'chiang mai': 'thailand',
  saigon: 'vietnam',
  'ho chi minh': 'vietnam',
  hanoi: 'vietnam',
  'da nang': 'vietnam',
  tokyo: 'japan',
  osaka: 'japan',
  kyoto: 'japan',
  seoul: 'south-korea',
  busan: 'south-korea',
  beijing: 'china',
  shanghai: 'china',
  guangzhou: 'china',
  shenzhen: 'china',
  taipei: 'taiwan',
  'kuala lumpur': 'malaysia',
  'kl ': 'malaysia',
  penang: 'malaysia',
  bali: 'indonesia',
  jakarta: 'indonesia',
  manila: 'philippines',
  cebu: 'philippines',
  delhi: 'india',
  mumbai: 'india',
  bangalore: 'india',
  london: 'united-kingdom',
  paris: 'france',
  berlin: 'germany',
  munich: 'germany',
  sydney: 'australia',
  melbourne: 'australia',
  toronto: 'canada',
  vancouver: 'canada',
  'new york': 'usa',
  nyc: 'usa',
  'los angeles': 'usa',
  vientiane: 'laos',
};

// Short Khmer names / nicknames people type (e.g. កូរ៉េ for South
// Korea). Matched with plain includes() because JS \b word boundaries don't
// work around Khmer script.
const KM_ALIASES: Record<string, string> = {
  'កូរ៉េ': 'south-korea',
  'អង់គ្លេស': 'united-kingdom',
  'អូស្ត្រាលី': 'australia',
};

// Find which destination (if any) the traveller mentioned, by English name,
// Khmer name, slug, or a common nickname/city. Returns the slug or null.
function detectCountry(text: string): string | null {
  const lower = text.toLowerCase();
  for (const d of destinations) {
    const slugWord = d.slug.replace(/-/g, ' ');
    if (
      lower.includes(d.name.toLowerCase()) ||
      lower.includes(slugWord) ||
      text.includes(d.nameKm)
    ) {
      return d.slug;
    }
  }
  // Khmer short names first (plain substring match).
  for (const k of Object.keys(KM_ALIASES)) {
    if (text.includes(k)) return KM_ALIASES[k];
  }
  // Fall back to nickname/city matching, longest alias first so "s korea"
  // beats "us" and "kuala lumpur" beats "kl".
  for (const alias of Object.keys(COUNTRY_ALIASES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${alias.trim()}\\b`).test(lower)) return COUNTRY_ALIASES[alias];
  }
  return null;
}

// ── Intent definitions ───────────────────────────────────────────────────────
// Each intent is a set of trigger keywords (Khmer + English) and a bilingual
// answer. We pick the intent with the most keyword matches. The keyword lists
// are intentionally LONG and full of everyday phrasings, so the copilot
// understands customers who ask the same thing many different ways.
interface Intent {
  id: string;
  keywords: string[];
  answer: Bilingual;
}

const TELEGRAM = DOMNER_FACTS.supportTelegram; // https://t.me/domnerapp

const INTENTS: Intent[] = [
  // ── Conversational glue ────────────────────────────────────────────────────
  {
    id: 'greeting',
    keywords: [
      'hello', 'hi ', 'hey', 'good morning', 'good afternoon', 'good evening',
      'howdy', 'yo ', 'greetings', 'anyone there', 'are you there',
      'សួស្តី', 'ជម្រាបសួរ', 'អរុណសួស្តី', 'ទីវាសួស្តី', 'សាយ័ណ្ហសួស្តី',
    ],
    answer: {
      km: 'សួស្តី! ខ្ញុំជា Domner Trip Copilot ✦ ជំនួយការធ្វើដំណើររបស់អ្នក។ ខ្ញុំអាចជួយអំពី eSIM, ការតាមដានជើងហោះហើរ, ទិដ្ឋាការ, រូបិយប័ណ្ណ, សុវត្ថិភាព, មគ្គុទេសក៍ព្រលានយន្តហោះ និងការរៀបចំដំណើរ។ តើខ្ញុំអាចជួយអ្វីបាន?',
      en: "Hi! I'm your Domner Trip Copilot ✦ — your personal travel assistant. I can help with eSIMs, flight tracking, visas, currency, safety, airport guides, and trip prep. What can I help you with?",
    },
  },
  {
    id: 'thanks',
    keywords: [
      'thank', 'thanks', 'thx', 'ty ', 'appreciate', 'much appreciated', 'thank you so much',
      'អរគុណ', 'សូមអរគុណ', 'អរគុណច្រើន',
    ],
    answer: {
      km: 'មិនអីទេ! 😊 ជូនពរដំណើរកម្សាន្តរីករាយ។ បើមានសំណួរអ្វីទៀត សូមសួរបានគ្រប់ពេល។',
      en: "You're welcome! 😊 Safe travels — ask me anytime if you need anything else.",
    },
  },
  {
    id: 'bye',
    keywords: ['bye', 'goodbye', 'see you', 'see ya', 'talk later', 'that is all', "that's all", ' លាហើយ', 'ជម្រាបលា'],
    answer: {
      km: 'ជម្រាបលា! 👋 សូមធ្វើដំណើរដោយសុវត្ថិភាព។ Domner នៅទីនេះ ២៤/៧ ពេលអ្នកត្រូវការ។',
      en: "Goodbye! 👋 Have a safe trip. Domner is here 24/7 whenever you need us.",
    },
  },
  {
    id: 'smalltalk_identity',
    keywords: [
      'who are you', 'what are you', 'your name', 'are you a bot', 'are you human', 'are you real', 'are you ai',
      'អ្នកជានរណា', 'ឈ្មោះអ្វី', 'ជាមនុស្សឬ',
    ],
    answer: {
      km: 'ខ្ញុំជា Domner Trip Copilot ✦ — ជំនួយការធ្វើដំណើរដោយ AI ក្នុងកម្មវិធី Domner។ ខ្ញុំនិយាយភាសាខ្មែរ និងអង់គ្លេស ហើយឆ្លើយភ្លាមៗ ២៤/៧។ ចង់ជួបបុគ្គលិកមនុស្សក៏បាន — ខ្ញុំនឹងភ្ជាប់ឲ្យ។',
      en: "I'm the Domner Trip Copilot ✦ — the in-app AI travel assistant. I speak Khmer and English and answer instantly, 24/7. If you'd rather talk to a human, I can point you to our support team too.",
    },
  },
  {
    id: 'languages',
    keywords: [
      'do you speak', 'what language', 'speak english', 'speak khmer', 'ភាសាអ្វី', 'និយាយអង់គ្លេស', 'និយាយខ្មែរ',
    ],
    answer: {
      km: 'ខ្ញុំនិយាយបានទាំង ភាសាខ្មែរ 🇰🇭 និង ភាសាអង់គ្លេស។ សរសេរមកភាសាណាក៏បាន ខ្ញុំនឹងឆ្លើយតបភាសានោះ។',
      en: 'I speak both Khmer 🇰🇭 and English. Write in whichever you prefer and I\'ll reply in the same language.',
    },
  },

  // ── eSIM: buying, setup, using ─────────────────────────────────────────────
  {
    id: 'esim_setup',
    keywords: [
      'install', 'setup', 'set up', 'set it up', 'qr', 'activate', 'activation', 'how does my esim',
      'how do i use', 'how to use', 'how to install', 'get it working', 'turn on', 'turn it on',
      'scan', 'add esim', 'add data plan',
      'ដំឡើង', 'ដំណើរការ', 'របៀបប្រើ', 'របៀបដំឡើង', 'ស្កេន', 'បើក', 'ធ្វើឲ្យដំណើរការ', 'កូដ',
    ],
    answer: {
      km: 'បន្ទាប់ពីទិញរួច លេខកូដ QR eSIM នឹងផ្ញើទៅអ៊ីមែលរបស់អ្នកក្នុងរយៈពេលប្រហែល ១៥ នាទី។ សូម "ដំឡើង" eSIM មុនពេលឡើងយន្តហោះ (ត្រូវការ Wi-Fi)៖ Settings → Mobile/Cellular → Add eSIM → ស្កេន QR ពីអ៊ីមែល។ ប៉ុន្តែ "បើកដំណើរការ" វាបានតែពេលចុះដល់គោលដៅ ដើម្បីកុំឲ្យខាតទិន្នន័យ។ គ្រប់គម្រោងរួមបញ្ចូល hotspot និងជំនួយខ្មែរ ២៤/៧។',
      en: 'After you buy, your eSIM QR code is emailed within ~15 minutes. INSTALL it before you fly (needs Wi-Fi): Settings → Mobile/Cellular → Add eSIM → scan the QR from the email. Only TURN IT ON after you land, so no data is wasted. Every plan includes hotspot & 24/7 Khmer support.',
    },
  },
  {
    id: 'esim_compatibility',
    keywords: [
      'compatible', 'compatibility', 'support esim', 'supports esim', 'which phone', 'my phone',
      'does my phone', 'will it work on', 'iphone', 'samsung', 'galaxy', 'pixel', 'android', 'huawei', 'oppo', 'xiaomi',
      'ទូរស័ព្ទ', 'អាចប្រើ', 'ស៊ីមអេឡិចត្រូនិច', 'ទូរស័ព្ទខ្ញុំ',
    ],
    answer: {
      km: 'eSIM ត្រូវការទូរស័ព្ទដែលគាំទ្រ eSIM៖ iPhone XS ឡើងទៅ, Google Pixel 3 ឡើងទៅ និង Samsung Galaxy S/Note/Z ជំនាន់ថ្មីៗ។ ទូរស័ព្ទចាស់ ឬ ម៉ូដែលមួយចំនួន (រួមទាំង Huawei/Xiaomi មួយចំនួន) អាចមិនគាំទ្រ។ ដើម្បីពិនិត្យ៖ Settings → About → មើលថាមាន "EID" ដែរឬទេ។ បើគ្មាន សូមទាក់ទងជំនួយមុនទិញ។',
      en: 'eSIM needs an eSIM-capable phone: iPhone XS and newer, Google Pixel 3 and newer, and recent Samsung Galaxy S/Note/Z. Older phones (and some Huawei/Xiaomi models) may not support it. To check: Settings → About → look for an "EID" number. If there\'s none, message support before buying.',
    },
  },
  {
    id: 'esim_data_amount',
    keywords: [
      'how much data', 'how many gb', 'enough data', 'is 1gb enough', 'is 2gb enough', 'run out of data',
      'unlimited', 'daily data', 'per day', 'data cap', 'fair use', 'how much gb do i need',
      'ទិន្នន័យប៉ុន្មាន', 'ប៉ុន្មាន gb', 'គ្រប់គ្រាន់', 'អស់ទិន្នន័យ', 'មិនកំណត់',
    ],
    answer: {
      km: 'គម្រោងគិតទិន្នន័យ "ក្នុងមួយថ្ងៃ"៖ Basic ១GB/ថ្ងៃ (៣ថ្ងៃ), Standard ២GB/ថ្ងៃ (៧ថ្ងៃ — ពេញនិយម), Premium ៣GB/ថ្ងៃ (១៥ថ្ងៃ)។ ២GB/ថ្ងៃ គ្រប់គ្រាន់សម្រាប់ផែនទី, chat, រូបភាព និង video ខ្លះៗ។ បើមើល video ច្រើន ឬ tether កុំព្យូទ័រ សូមជ្រើស Premium។ បន្ទាប់ពីអស់កូតាប្រចាំថ្ងៃ ល្បឿនអាចថយ ហើយនឹងឡើងវិញនៅថ្ងៃបន្ទាប់។',
      en: 'Plans are measured per-DAY: Basic 1GB/day (3 days), Standard 2GB/day (7 days — most popular), Premium 3GB/day (15 days). 2GB/day is plenty for maps, chat, photos and some video. If you stream a lot or tether a laptop, pick Premium. After the daily cap the speed may slow, then resets the next day.',
    },
  },
  {
    id: 'esim_validity',
    keywords: [
      'when does it start', 'when does the plan start', 'plan start', 'start counting', 'when does it begin',
      'valid', 'validity', 'expire', 'expires', 'expiry',
      'how long does it last', 'when does it activate', 'countdown', 'buy in advance', 'buy early', 'before my trip',
      'ចាប់ផ្តើមពេលណា', 'ចាប់ផ្តើមរាប់', 'សុពលភាព', 'ផុតកំណត់', 'ប៉ុន្មានថ្ងៃ', 'ទិញមុន',
    ],
    answer: {
      km: 'សុពលភាព (៣/៧/១៥ ថ្ងៃ) ចាប់ផ្តើមរាប់នៅពេល eSIM "ភ្ជាប់បណ្តាញ" នៅគោលដៅ — មិនមែននៅពេលទិញទេ។ ដូច្នេះអ្នកអាចទិញ និងដំឡើងទុកជាមុនដោយសុវត្ថិភាព ហើយបើកវាតែពេលចុះដល់កន្លែង។',
      en: 'The validity (3/7/15 days) starts counting when the eSIM first CONNECTS to a network at your destination — not when you buy it. So you can safely buy and install ahead of time, and only turn it on once you land.',
    },
  },
  {
    id: 'esim_multicountry',
    keywords: [
      'multiple countries', 'more than one country', 'several countries', 'two countries', 'regional',
      'regional plan', 'asia plan', 'europe plan', 'multi country', 'multi-country', 'whole trip many countries',
      'ច្រើនប្រទេស', 'ពីរប្រទេស', 'តំបន់', 'ដំណើរច្រើនប្រទេស',
    ],
    answer: {
      km: 'បច្ចុប្បន្ន eSIM នីមួយៗគឺសម្រាប់ "ប្រទេសមួយ"។ បើដំណើរឆ្លងច្រើនប្រទេស អ្នកអាចទិញ eSIM មួយសម្រាប់ប្រទេសនីមួយៗ (ដំឡើងទុកជាមុនទាំងអស់ ហើយបើកម្តងមួយៗ)។ គម្រោងតំបន់ (regional) កំពុងមកដល់ — ចង់បានប្រទេសណាខ្លះ ប្រាប់ក្រុមការងារបាន។',
      en: 'Right now each eSIM covers ONE country. For a multi-country trip, buy one eSIM per country (install them all ahead of time, then switch them on one by one). Regional/multi-country plans are on the roadmap — tell support which countries you need.',
    },
  },
  {
    id: 'esim_calls',
    keywords: [
      'make calls', 'phone call', 'can i call', 'voice call', 'sms', 'text message', 'texting', 'keep my number',
      'my number', 'phone number', 'whatsapp call', 'telegram call', 'receive calls', 'data only',
      'ហៅទូរស័ព្ទ', 'ខល', 'លេខរបស់ខ្ញុំ', 'ផ្ញើសារ', 'ការហៅ',
    ],
    answer: {
      km: 'eSIM របស់ Domner គឺ "ទិន្នន័យ (data) សុទ្ធ" — គ្មានលេខ voice/SMS ថ្មីទេ។ ប៉ុន្តែអ្នកអាចហៅ និង chat តាម WhatsApp, Telegram, Messenger ដោយប្រើ data បានធម្មតា។ បើទូរស័ព្ទរបស់អ្នកមាន dual-SIM លេខកម្ពុជាដើមនៅតែដំណើរការ (បិទ roaming លើវាដើម្បីកុំខាតលុយ) ហើយប្រើ eSIM សម្រាប់ internet។',
      en: "Domner eSIMs are DATA-ONLY — they don't give a new voice/SMS number. But you can call and chat over WhatsApp, Telegram or Messenger using the data normally. If your phone is dual-SIM, your Cambodian number keeps working (switch OFF roaming on it to avoid charges) while the eSIM handles internet.",
    },
  },
  {
    id: 'esim_troubleshoot',
    keywords: [
      'not working', "isn't working", 'no internet', 'no signal', 'no service', 'no data', 'not connecting',
      "can't connect", 'cannot connect', "didn't receive", 'did not get', 'no qr', "can't scan", 'cant scan',
      'not activated', 'stopped working', 'slow internet', 'no network',
      'មិនដំណើរការ', 'គ្មានអ៊ីនធឺណិត', 'គ្មានសេវា', 'គ្មានសញ្ញា', 'មិនទទួល', 'ភ្ជាប់មិនបាន', 'យឺត',
    ],
    answer: {
      km: 'សូមសាកល្បងតាមលំដាប់៖ ① បើកភ្លើងបញ្ជី eSIM ក្នុង Settings ✓ ② បើក "Data Roaming" សម្រាប់ eSIM ✓ ③ ជ្រើស eSIM ជាបណ្តាញទិន្នន័យ (Mobile Data line) ✓ ④ បិទ-បើក Airplane mode ឬ restart ទូរស័ព្ទ ✓ ⑤ ជ្រើសបណ្តាញដោយដៃ (Settings → Network Selection)។ បើនៅតែមិនដើរ ឬ QR មិនមកដល់ (ពិនិត្យ spam) សូមទាក់ទងជំនួយ Telegram៖ ' + TELEGRAM + ' ក្រុមការងារជួយ ២៤/៧។',
      en: "Try this in order: ① eSIM line is turned ON in Settings ✓ ② turn ON 'Data Roaming' for the eSIM ✓ ③ set the eSIM as your Mobile Data line ✓ ④ toggle Airplane mode or restart the phone ✓ ⑤ pick the network manually (Settings → Network Selection). Still stuck, or QR never arrived (check spam)? Message support on Telegram: " + TELEGRAM + " — we're here 24/7.",
    },
  },
  {
    id: 'esim_topup',
    keywords: [
      'top up', 'topup', 'top-up', 'recharge', 'add more data', 'buy more data', 'extend', 'extension',
      'renew', 'more days', 'ran out need more', 'reload',
      'បញ្ចូលទឹកប្រាក់', 'បន្ថែមទិន្នន័យ', 'បន្ថែមថ្ងៃ', 'ពន្យារ', 'ទិញបន្ថែម',
    ],
    answer: {
      km: 'ដើម្បីបន្ថែមទិន្នន័យ ឬថ្ងៃ គ្រាន់តែទិញគម្រោងថ្មីមួយ (ឬជ្រើសកម្រិតវែងជាងមុន ដូចជា Premium ១៥ថ្ងៃ) នៅ eSIM store ក្នុងកម្មវិធី ហើយដំឡើងវាដូចធម្មតា។ បើត្រូវការជំនួយជ្រើសគម្រោងឲ្យសមនឹងដំណើររបស់អ្នក សូមប្រាប់ខ្ញុំពីប្រទេស និងចំនួនថ្ងៃ។',
      en: "To add data or days, just buy another plan (or pick a longer tier like Premium 15-day) in the in-app eSIM store and install it as usual. If you want help choosing the right plan for your trip, tell me the country and how many days.",
    },
  },
  {
    id: 'esim_remove',
    keywords: [
      'delete esim', 'remove esim', 'uninstall', 'get rid of', 'after my trip', 'reuse esim', 'reuse the sim',
      'លុប eSIM', 'ដកចេញ', 'បន្ទាប់ពីដំណើរ',
    ],
    answer: {
      km: 'បន្ទាប់ពីដំណើរ អ្នកអាចលុប eSIM ក្នុង Settings → Mobile/Cellular → ជ្រើស eSIM → Remove/Delete។ សូមកុំលុបរហូតទាល់តែប្រាកដថាឈប់ប្រើ ព្រោះ QR ដដែលមួយ ជាទូទៅមិនអាចដំឡើងឡើងវិញបានទេ។ eSIM ថ្មីនីមួយៗគឺជាការទិញថ្មី។',
      en: "After your trip you can delete the eSIM: Settings → Mobile/Cellular → select the eSIM → Remove/Delete. Don't delete it until you're sure you're done, because the same QR usually can't be re-installed. Each new eSIM is a fresh purchase.",
    },
  },
  {
    id: 'china_vpn',
    keywords: [
      'china', 'vpn', 'google in china', 'whatsapp in china', 'facebook in china', 'instagram in china',
      'blocked apps', 'great firewall', 'ចិន', 'វីភីអិន', 'កម្មវិធីត្រូវបានហាមឃាត់',
    ],
    answer: {
      km: 'eSIM ចិនរបស់ Domner មិនត្រូវការ VPN ទេ — Google, WhatsApp, Facebook, Instagram ។ល។ ដំណើរការធម្មតា (traffic ចេញតាមក្រៅ China firewall)។ គ្រាន់តែដំឡើង eSIM មុនហោះ ហើយបើកនៅពេលចុះដល់ចិន។',
      en: "Domner's China eSIM needs NO VPN — Google, WhatsApp, Facebook, Instagram, etc. all work normally (your traffic routes outside China's firewall). Just install the eSIM before you fly and turn it on when you land in China.",
    },
  },
  {
    id: 'esim_coverage',
    keywords: [
      'coverage', 'does it work in', 'will it work in', 'network in', 'signal in', 'which network', 'which carrier',
      '5g', '4g', 'lte', 'reception', ' គ្របដណ្តប់', 'បណ្តាញនៅ', 'សញ្ញានៅ',
    ],
    answer: {
      km: 'eSIM របស់យើងភ្ជាប់បណ្តាញធំៗក្នុងស្រុករបស់ប្រទេសនីមួយៗ (បង្ហាញក្នុង eSIM store) ដោយ 4G LTE ឬ 5G អាស្រ័យប្រទេស។ ការគ្របដណ្តប់ល្អនៅទីក្រុង និងតំបន់ភ្ញៀវទេសចរ។ ប្រាប់ខ្ញុំពីប្រទេស ខ្ញុំនឹងបង្ហាញបណ្តាញ និងគុណភាព។',
      en: "Our eSIMs connect to each country's major local networks (shown in the eSIM store), on 4G LTE or 5G depending on the country. Coverage is strong in cities and tourist areas. Tell me the country and I'll show you the networks and quality.",
    },
  },

  // ── Flights ────────────────────────────────────────────────────────────────
  {
    id: 'missed_flight',
    keywords: [
      'missed my flight', 'missed flight', 'missed the flight', 'missed connection', 'missed my connection',
      'late for flight', 'plane left', 'ខកជើងហោះហើរ', 'ខកយន្តហោះ', 'មិនទាន់ជើងហោះហើរ',
    ],
    answer: {
      km: 'សូមកុំភ័យ — ទៅកន្លែងបញ្ជរ (counter) ក្រុមហ៊ុនអាកាសរបស់អ្នកភ្លាមៗ ឬហៅ hotline របស់ពួកគេ ដើម្បីស្នើ rebooking (ជើងហោះហើរបន្ទាប់)។ បើពន្យារ/ខកដោយសារក្រុមហ៊ុនអាកាស ពួកគេច្រើនតែរៀបចំឲ្យឥតគិតថ្លៃ។ Domner មិនអាច rebook សំបុត្រជំនួសអ្នកបានទេ ប៉ុន្តែខ្ញុំអាចជួយអំពី eSIM ឬជំហានបន្ទាប់។',
      en: "Don't panic — go straight to your airline's counter or call their hotline to ask for a rebooking on the next flight. If the miss was the airline's fault (delay/cancellation), they usually rebook you free. Domner can't rebook tickets for you, but I can help with your eSIM or what to do next.",
    },
  },
  {
    // Specific flight sub-intents come BEFORE the generic 'flight' intent so a
    // clearly-specific question ("share my flight", "flight alerts") isn't
    // swallowed by the broad tracker answer.
    id: 'flight_share',
    keywords: [
      'share my flight', 'share flight', 'share link', 'track link', 'family track', 'someone pick me up',
      'picking me up', 'send my flight', 'let them follow', 'follow my flight',
      'ចែករំលែកជើងហោះហើរ', 'តំណភ្ជាប់', 'ឲ្យគ្រួសារតាមដាន',
    ],
    answer: {
      km: 'បាទ/ចាស — Flight Guardian បង្កើត "តំណចែករំលែកសាធារណៈ" បាន។ បើកជើងហោះហើររបស់អ្នក ចុច Share ហើយផ្ញើតំណទៅគ្រួសារ ឬអ្នកមកទទួល ។ ពួកគេអាចមើលស្ថានភាព និងម៉ោងចុះចតបានផ្ទាល់ ដោយមិនចាំបាច់មានគណនី Domner។',
      en: "Yes — Flight Guardian creates a public share link. Open your flight, tap Share, and send the link to family or whoever's picking you up. They can watch your live status and landing time without needing a Domner account.",
    },
  },
  {
    id: 'flight_alerts',
    keywords: [
      'notification', 'notifications', 'push alert', 'push alerts', 'notify me', 'get updates', 'get alerts',
      'reminder', 'alert me', 'ការជូនដំណឹង', 'ជូនដំណឹង', 'រំលឹក',
    ],
    answer: {
      km: 'បើអនុញ្ញាតការជូនដំណឹង (notifications) ក្នុងកម្មវិធី Flight Guardian នឹងផ្ញើ push alert ស្វ័យប្រវត្តិ នៅពេលមានការប្តូរផ្លូវចេញ, ការពន្យារ, ការឡើងយន្តហោះ និងការចុះចត។ គ្រាន់តែរក្សាទុកជើងហោះហើររបស់អ្នក ហើយបើក notifications។',
      en: "If you allow notifications, Flight Guardian sends automatic push alerts for gate changes, delays, boarding and landing. Just save your flight and turn notifications on — you don't have to keep checking the app.",
    },
  },
  {
    id: 'baggage',
    keywords: [
      'baggage', 'luggage', 'checked bag', 'check-in bag', 'checked luggage', 'weight limit', 'how many kg',
      'baggage allowance', 'suitcase', 'extra bag', 'overweight', 'how much luggage',
      'ឥវ៉ាន់', 'វ៉ាលី', 'ទម្ងន់', 'គីឡូ', 'ឥវ៉ាន់ដាក់ក្រោម',
    ],
    answer: {
      km: 'ការអនុញ្ញាតឥវ៉ាន់អាស្រ័យលើ "ក្រុមហ៊ុនអាកាស និងសំបុត្រ" របស់អ្នក — សូមពិនិត្យលើ boarding pass ឬគេហទំព័រក្រុមហ៊ុនអាកាស។ ជាទូទៅ៖ ឥវ៉ាន់យួរដៃប្រហែល ៧គីឡូ, ឥវ៉ាន់ដាក់ក្រោម ២០–៣០គីឡូ (សេដ្ឋកិច្ច)។ ការលើសទម្ងន់ត្រូវបង់បន្ថែម ដូច្នេះថ្លឹងមុនចេញពីផ្ទះ។',
      en: "Baggage allowance depends on YOUR airline and ticket — check your boarding pass or the airline's site. As a rough guide: carry-on around 7kg, checked bags 20–30kg (economy). Overweight bags cost extra fees, so weigh yours before leaving home.",
    },
  },
  {
    id: 'carry_on',
    keywords: [
      'carry on', 'carry-on', 'what can i carry', 'what can i bring on', 'hand luggage', 'cabin bag',
      'liquids', 'liquid', '100ml', 'power bank', 'powerbank', 'battery', 'batteries', 'laptop', 'scissors',
      'lighter', 'razor', 'allowed on plane', 'take on the plane', 'what can i take on',
      'bring onboard', 'prohibited items',
      'យួរដៃ', 'យកឡើងយន្តហោះ', 'យកអ្វីខ្លះឡើង', 'អ្វីខ្លះឡើងយន្តហោះ',
      'អង្គធាតុរាវ', 'ថ្មសាក', 'ថ្មបម្រុង',
    ],
    answer: {
      km: 'ច្បាប់ឥវ៉ាន់យួរដៃទូទៅ៖ • អង្គធាតុរាវ ត្រូវ ≤ ១០០ml ក្នុងធុងតូច ដាក់ថង់ថ្លាឥតលើស ១ លីត្រ។ • Power bank និងថ្មបម្រុង ត្រូវយកក្នុងឥវ៉ាន់យួរដៃ "ប៉ុណ្ណោះ" — ហាមដាក់ក្នុងឥវ៉ាន់ក្រោម។ • Laptop យកឡើងបាន (យកចេញពេល security)។ • កាំបិត, កន្ត្រៃធំ, របស់មុតស្រួច ត្រូវដាក់ក្នុងឥវ៉ាន់ក្រោម។ ពិនិត្យច្បាប់ក្រុមហ៊ុនអាកាសរបស់អ្នក ព្រោះអាចខុសគ្នាបន្តិច។',
      en: "Common carry-on rules: • Liquids must be ≤100ml each, inside one clear bag under 1 litre. • Power banks / spare batteries go in your CARRY-ON only — never in checked luggage. • Laptops are fine (take them out at security). • Knives, large scissors and sharp objects must go in checked luggage. Always check your airline's specific rules, as they vary slightly.",
    },
  },
  {
    id: 'flight',
    keywords: [
      'flight', 'delay', 'delayed', 'gate', 'gate number', 'boarding', 'track my flight',
      'tracking', 'departure time', 'arrival time', 'landing', 'landed', 'flight status', 'is my flight on time',
      'flight number', 'when do i board', 'takeoff',
      'ជើងហោះហើរ', 'យន្តហោះ', 'ពន្យារ', 'ចេញ', 'ចុះ', 'តាមដាន', 'ផ្លូវចេញ', 'ឡើងយន្តហោះ', 'ទាន់ពេល',
    ],
    answer: {
      km: 'អ្នកអាចតាមដានជើងហោះហើររបស់អ្នកបានផ្ទាល់ជាមួយ Flight Guardian ក្នុងកម្មវិធី — វាផ្តល់ការជូនដំណឹងផ្ទាល់អំពីការប្តូរផ្លូវចេញ, ការពន្យារពេល, ការឡើងយន្តហោះ និងការចុះចត។ សូមបញ្ចូលលេខជើងហោះហើររបស់អ្នកនៅទំព័រ Flights។ ខ្ញុំមិនអាចអានស្ថានភាពផ្ទាល់ដោយខ្លួនឯងបានទេ ដូច្នេះ tracker គឺជាប្រភពពិត។',
      en: "You can track your flight live with Flight Guardian in the app — it sends real-time alerts for gate changes, delays, boarding, and landing. Just enter your flight number on the Flights page. I can't read live status myself, so the tracker is the source of truth.",
    },
  },

  // ── Airport & entry ────────────────────────────────────────────────────────
  {
    id: 'airport',
    keywords: [
      'airport', 'check-in', 'checkin', 'check in', 'terminal', 'immigration', 'security', 'how early',
      'how many hours before', 'arrive at airport', 'boarding time', 'departure hall',
      'ព្រលានយន្តហោះ', 'ឆេកអ៊ីន', 'ធ្វើការឆែក', 'អន្តោប្រវេសន៍', 'សុវត្ថិភាព', 'ប៉ុន្មានម៉ោងមុន',
    ],
    answer: {
      km: 'Airport Companion ក្នុងកម្មវិធីមានមគ្គុទេសក៍ជាជំហានៗ ជាភាសាខ្មែរ ចាប់ពីការឆេកអ៊ីនរហូតដល់ការឡើងយន្តហោះ (រួមទាំងការព្រមានពីការបោកប្រាស់)។ ជាទូទៅ សូមទៅដល់ព្រលានយន្តហោះ ២ ម៉ោងមុនជើងហោះហើរក្នុងស្រុក ឬ ៣ ម៉ោងមុនជើងហោះហើរអន្តរជាតិ។',
      en: 'The Airport Companion in the app gives step-by-step guides in Khmer, from check-in to boarding (scam warnings included). As a rule, arrive 2 hours before a domestic flight or 3 hours before an international flight.',
    },
  },
  {
    id: 'visa',
    keywords: [
      'visa', 'e-visa', 'evisa', 'entry requirement', 'do i need a visa', 'visa on arrival', 'visa free',
      'visa-free', 'k-eta', 'keta', 'eta', 'arrival card', 'passport requirement', 'how long can i stay',
      'entry stamp', 'immigration requirement',
      'ទិដ្ឋាការ', 'វីសា', 'លិខិតឆ្លងដែន', 'ត្រូវការទិដ្ឋាការ', 'ស្នាក់នៅបានប៉ុន្មានថ្ងៃ',
    ],
    answer: {
      km: 'លក្ខខណ្ឌទិដ្ឋាការ (visa) ខុសគ្នាតាមប្រទេស — ប្រាប់ខ្ញុំពីប្រទេសដែលអ្នកទៅ ខ្ញុំនឹងបង្ហាញព័ត៌មានទិដ្ឋាការ និងរយៈពេលស្នាក់នៅសម្រាប់អ្នកកាន់លិខិតឆ្លងដែនកម្ពុជា។ សូមផ្ទៀងផ្ទាត់ជាមួយស្ថានទូតជានិច្ចមុនធ្វើដំណើរ ព្រោះលក្ខខណ្ឌអាចផ្លាស់ប្តូរ។',
      en: "Visa rules depend on the country — tell me where you're going and I'll show the visa info and allowed stay for a Cambodian passport holder. Always double-check with the embassy before you travel, as requirements can change.",
    },
  },
  {
    id: 'customs',
    keywords: [
      'customs', 'declare', 'declaration', 'how much cash can i bring', 'bring into', 'import limit',
      'duty free', 'duty-free', 'prohibited to bring', 'medication', 'medicine',
      'គយ', 'ប្រកាស', 'នាំចូល', 'លុយអតិបរមា', 'ថ្នាំ',
    ],
    answer: {
      km: 'ច្បាប់គយ (customs) និងដែនកំណត់ប្រាក់ខុសគ្នាតាមប្រទេស — ប្រាប់ខ្ញុំពីប្រទេស ខ្ញុំនឹងបង្ហាញចំនួនប្រាក់ដែលត្រូវប្រកាស និងចំណុចសំខាន់ៗ (ដូចជាថ្នាំតាមវេជ្ជបញ្ជា ត្រូវនៅក្នុងកញ្ចប់ដើម)។ Am I Ready? checklist ក៏រៀបចំបញ្ជីតាមគោលដៅផងដែរ។',
      en: "Customs rules and cash limits vary by country — tell me the country and I'll show how much cash must be declared and the key do's and don'ts (like keeping prescription meds in original packaging). The Am I Ready? checklist also tailors this to your destination.",
    },
  },
  {
    id: 'currency',
    keywords: [
      'exchange rate', 'currency', 'money changer', 'change money', 'atm', 'how much is the', 'convert',
      'exchange money', 'local currency', 'riel', 'dollar to', 'usd to', 'cash or card',
      'អត្រាប្តូរប្រាក់', 'ប្តូរប្រាក់', 'រូបិយប័ណ្ណ', 'រៀល', 'ដុល្លារ', 'atm', 'លុយ',
    ],
    answer: {
      km: 'ខ្ញុំអាចប្រាប់អត្រាប្តូរប្រាក់ប្រហាក់ប្រហែលបាន — ប្រាប់ខ្ញុំពីប្រទេស ខ្ញុំនឹងបង្ហាញ $1 ស្មើប៉ុន្មានក្នុងរូបិយប័ណ្ណនោះ។ គន្លឹះ៖ ប្តូរប្រាក់នៅធនាគារ ឬបញ្ជរមានអាជ្ញាប័ណ្ណ, រាប់លុយមុនចាកចេញ, ហើយ ATM ច្រើនតែផ្តល់អត្រាល្អ។',
      en: "I can give you an approximate exchange rate — tell me the country and I'll show what $1 is worth in that currency. Tips: exchange at banks or licensed counters, count your notes before leaving, and ATMs often give good rates.",
    },
  },
  {
    id: 'safety',
    keywords: [
      'scam', 'scams', 'is it safe', 'safe', 'safety', 'dangerous', 'danger', 'rip off', 'ripoff', 'cheat',
      'fraud', 'avoid', 'tourist trap', 'pickpocket', 'get robbed', 'crime',
      'បោកប្រាស់', 'សុវត្ថិភាព', 'គ្រោះថ្នាក់', 'មានសុវត្ថិភាពទេ', 'ចោរ', 'បោក',
    ],
    answer: {
      km: 'ខ្ញុំអាចប្រាប់ការជូនដំណឹងសុវត្ថិភាព និងការបោកប្រាស់ទូទៅ — ប្រាប់ខ្ញុំពីប្រទេស ខ្ញុំនឹងបង្ហាញការបោកប្រាស់ដែលគួរប្រុងប្រយ័ត្ន។ គោលការណ៍ទូទៅ៖ ប្រើតែតាក់ស៊ី/Grab ផ្លូវការ, ព្រមព្រៀងតម្លៃមុនជិះ, កុំបង្ហាញលុយច្រើន និងរក្សា passport ឲ្យមានសុវត្ថិភាព។ មើលបន្ថែមក្នុងផ្នែក Scam Alerts។',
      en: "I can share safety and common-scam warnings — tell me the country and I'll show what to watch out for. General rules: use only official taxis/Grab, agree the price before you ride, don't flash cash, and keep your passport secure. See more in the Scam Alerts section.",
    },
  },
  {
    id: 'currency_cambodia_arrival',
    keywords: [
      'arrived', 'just landed', 'i landed', 'welcome', 'arrival experience', 'i am here now', 'reached',
      'ចុះដល់ហើយ', 'មកដល់', 'ស្វាគមន៍',
    ],
    answer: {
      km: 'ស្វាគមន៍ការមកដល់! 🎉 កម្មវិធីនឹងបង្ហាញ Arrival card ស្វ័យប្រវត្តិ ជាមួយអត្រាប្តូរប្រាក់, ព័ត៌មានឥវ៉ាន់ និងវិធីជិះតាក់ស៊ីដោយសុវត្ថិភាព។ កុំភ្លេចបើក eSIM ឥឡូវនេះ (បើមិនទាន់) ដើម្បីភ្ជាប់អ៊ីនធឺណិត។ ត្រូវការជំនួយអ្វីទៀត?',
      en: "Welcome — you made it! 🎉 The app shows an Arrival card automatically with the exchange rate, baggage info and how to grab a safe taxi. Don't forget to turn on your eSIM now (if you haven't) to get online. Anything else I can help with?",
    },
  },

  // ── Trip prep ──────────────────────────────────────────────────────────────
  {
    id: 'checklist',
    keywords: [
      'checklist', 'am i ready', 'what to pack', 'what should i bring', 'packing list', 'prepare for trip',
      'get ready', 'before i travel', 'what do i need', 'documents needed',
      'បញ្ជី', 'ត្រៀម', 'រៀបចំ', 'យកអ្វី', 'ខ្ចប់', 'ត្រៀមខ្លួន',
    ],
    answer: {
      km: 'ប្រើ "Am I Ready?" checklist ក្នុងកម្មវិធី — វាបង្កើតបញ្ជីត្រៀមខ្លួនតាមគោលដៅរបស់អ្នក (ឯកសារ, ទិដ្ឋាការ, ថ្នាំ, adapter ។ល។)។ កុំភ្លេចរក្សាទុក passport, boarding pass និង QR eSIM ជាឯកសារ offline មុនពេលហោះ។',
      en: 'Use the "Am I Ready?" checklist in the app — it builds a personalised pre-trip list for your destination (documents, visa, meds, adapter, etc.). Don\'t forget to save your passport, boarding pass, and eSIM QR offline before you fly.',
    },
  },
  {
    id: 'weather',
    keywords: [
      'weather', 'best time to visit', 'when to go', 'when should i go', 'season', 'rainy season', 'monsoon',
      'hot', 'cold', 'temperature', 'what to wear', 'អាកាសធាតុ', 'រដូវ', 'ពេលណាល្អ', 'ភ្លៀង', 'ក្តៅ',
    ],
    answer: {
      km: 'ខ្ញុំមិនអានពាករណ៍អាកាសធាតុផ្ទាល់បានទេ — សូមពិនិត្យ app អាកាសធាតុ ឬ Google សម្រាប់គោលដៅ និងកាលបរិច្ឆេទរបស់អ្នក។ ជាទូទៅ អាស៊ីអាគ្នេយ៍មានរដូវប្រាំង (ស្ងួត) និងរដូវវស្សា (ភ្លៀង)។ សូមខ្ចប់អាវភ្លៀងស្រាល និងសម្លៀកបំពាក់ស្រាលៗសម្រាប់អាកាសក្តៅ។',
      en: "I can't read live forecasts — check a weather app or Google for your destination and dates. As a rule, Southeast Asia has a dry season and a wet (rainy) season. Pack a light rain jacket and breathable clothes for the heat.",
    },
  },
  {
    id: 'power_adapter',
    keywords: [
      'adapter', 'adaptor', 'plug', 'socket', 'outlet', 'voltage', 'charger type', 'power plug', 'universal adapter',
      'អាដាប់ទ័រ', 'ព្រី', 'រន្ធភ្លើង', 'វ៉ុល', 'ឆ្នាំងសាក',
    ],
    answer: {
      km: 'ដើម្បីកុំមានបញ្ហា សូមយក "universal travel adapter" មួយ — វាដំណើរការស្ទើរគ្រប់ប្រទេស។ អាស៊ីភាគច្រើនប្រើ 220–240V (ដូចកម្ពុជា) ដូច្នេះឧបករណ៍ភាគច្រើនរបស់អ្នកសាកបានធម្មតា។ ជប៉ុន/អាមេរិកប្រើ 100–120V — ពិនិត្យថាឆ្នាំងសាករបស់អ្នកគាំទ្រ "100–240V" (ភាគច្រើនគាំទ្រ)។',
      en: "To be safe, bring one universal travel adapter — it works in almost every country. Most of Asia uses 220–240V (like Cambodia), so your chargers work fine. Japan/USA use 100–120V — check your charger says '100–240V' (most do). A universal adapter covers all plug shapes.",
    },
  },
  {
    id: 'insurance',
    keywords: [
      'insurance', 'travel insurance', 'insured', 'medical cover', 'ធានារ៉ាប់រង', 'ការធានា',
    ],
    answer: {
      km: 'Domner មិនទាន់លក់ការធានារ៉ាប់រងធ្វើដំណើរនៅឡើយទេ ប៉ុន្តែយើងណែនាំយ៉ាងខ្លាំងឲ្យមានមួយ — វាគ្របដណ្តប់ការឈឺ, គ្រោះថ្នាក់, ការពន្យារ ឬ ការបាត់ឥវ៉ាន់។ សូមទិញពីក្រុមហ៊ុនធានារ៉ាប់រងដែលទុកចិត្តបាន មុនពេលធ្វើដំណើរ។',
      en: "Domner doesn't sell travel insurance yet, but we strongly recommend having some — it covers illness, accidents, delays and lost luggage. Buy from a trusted insurer before you travel. It's usually cheap and worth the peace of mind.",
    },
  },

  // ── Emergency ──────────────────────────────────────────────────────────────
  {
    id: 'emergency',
    keywords: [
      'emergency', 'phrase', 'phrases', 'hospital', 'police', 'help me', 'i am lost', 'lost', 'ambulance',
      'doctor', 'accident', 'urgent', 'how do i say',
      'អាសន្ន', 'សង្គ្រោះបន្ទាន់', 'បន្ទាន់', 'ប្រយោគ', 'ឃ្លា', 'មន្ទីរពេទ្យ', 'ប៉ូលិស',
      'វង្វេង', 'ជួយខ្ញុំ', 'ឡានពេទ្យ', 'គ្រូពេទ្យ',
    ],
    answer: {
      km: 'ផ្នែក Emergency Phrases ក្នុងកម្មវិធីមានឃ្លាធ្វើដំណើរសំខាន់ៗ ជាភាសាវៀតណាម, ថៃ, ចិន, ជប៉ុន (ចុចដើម្បីចម្លង ឬស្តាប់សំឡេង) ដែលដំណើរការ offline — មានប្រយោជន៍ពេលអាសន្ន។ ក្នុងករណីអាសន្នពិត សូមទាក់ទងលេខសង្គ្រោះបន្ទាន់ក្នុងស្រុករបស់ប្រទេសនោះជាមុនសិន។',
      en: 'The Emergency Phrases section has key travel phrases in Vietnamese, Thai, Chinese and Japanese (tap to copy or hear them spoken) that work offline — handy in a pinch. In a real emergency, always contact the local emergency number for the country you\'re in first.',
    },
  },

  // ── Payments, orders, account, business ────────────────────────────────────
  {
    id: 'payment',
    keywords: [
      'pay', 'payment', 'how do i pay', 'card', 'visa card', 'mastercard', 'credit card', 'debit card',
      'khqr', 'aba', 'aba pay', 'wing', 'stripe', 'checkout', 'currency of price', 'in usd',
      'បង់ប្រាក់', 'ទូទាត់', 'កាត', 'របៀបបង់', 'ខ្យូអរ',
    ],
    answer: {
      km: 'Domner ទទួលការទូទាត់ជាមួយ កាតអន្តរជាតិ (តាម Stripe) និង KHQR / ABA PayWay សម្រាប់ការបង់ប្រាក់ក្នុងស្រុក។ តម្លៃទាំងអស់បង្ហាញជា USD។ ការទូទាត់មានសុវត្ថិភាព — Domner មិនរក្សាទុកលេខកាតរបស់អ្នកទេ។',
      en: 'Domner accepts international cards (via Stripe) and KHQR / ABA PayWay for local Cambodian payment. All prices are shown in USD. Checkout is secure — Domner never stores your card number.',
    },
  },
  {
    id: 'refund_booking',
    keywords: [
      'refund', 'cancel', 'cancel my order', 'change my order', 'money back', 'rebook', 'wrong country',
      'bought wrong', 'order problem', 'double charged', 'charged twice',
      'សំណង', 'បោះបង់', 'ប្តូរ', 'សងប្រាក់', 'ខុសប្រទេស', 'គិតលុយពីរដង',
    ],
    answer: {
      km: `ខ្ញុំមិនអាចធ្វើការបញ្ជាទិញ, បោះបង់, ឬសងប្រាក់ដោយផ្ទាល់បានទេ។ សម្រាប់រឿងទាំងនេះ (រួមទាំងទិញខុសប្រទេស ឬគិតលុយពីរដង) សូមទាក់ទងក្រុមការងារ Domner — ឆ្លើយតបអ៊ីមែលបញ្ជាទិញ ឬ Telegram៖ ${TELEGRAM} — ហើយពួកគេនឹងជួយភ្លាមៗ ២៤/៧។`,
      en: `I can't book, cancel, or refund orders myself. For those (including buying the wrong country or a double charge), please contact Domner support — reply to your order email or Telegram: ${TELEGRAM} — and the team will help you right away, 24/7.`,
    },
  },
  {
    id: 'order_status',
    keywords: [
      'where is my order', 'order status', 'my order', 'my esim not arrived', 'not received my esim',
      'order confirmation', 'receipt', 'invoice', 'my purchase',
      'ការបញ្ជាទិញ', 'មិនទាន់ទទួល', 'វិក្កយបត្រ', 'បង្កាន់ដៃ',
    ],
    answer: {
      km: `បន្ទាប់ពីទិញ អ្នកគួរទទួលអ៊ីមែលបញ្ជាក់ + QR eSIM ក្នុងរយៈពេលប្រហែល ១៥ នាទី។ បើមិនឃើញ សូមពិនិត្យ spam/junk ជាមុន។ បើនៅតែគ្មាន សូមទាក់ទងជំនួយ (ឆ្លើយតបអ៊ីមែល ឬ Telegram៖ ${TELEGRAM}) ជាមួយអ៊ីមែលដែលអ្នកបានប្រើទិញ ក្រុមការងារនឹងតាមរកឲ្យ។`,
      en: `After buying, you should get a confirmation email + eSIM QR within ~15 minutes. If you don't see it, check spam/junk first. Still nothing? Contact support (reply to the email or Telegram: ${TELEGRAM}) with the email you bought with, and the team will track it down.`,
    },
  },
  {
    id: 'account',
    keywords: [
      'account', 'log in', 'login', 'sign in', 'sign up', 'signup', 'register', 'create account', 'password',
      'reset password', 'forgot password', 'cant log in', 'verify email',
      'គណនី', 'ចូលគណនី', 'ចុះឈ្មោះ', 'ពាក្យសម្ងាត់', 'ភ្លេចពាក្យសម្ងាត់',
    ],
    answer: {
      km: 'អ្នកអាចបង្កើតគណនី ឬចូល (sign in) ដោយប្រើអ៊ីមែលក្នុងកម្មវិធី។ ភ្លេចពាក្យសម្ងាត់? ចុច "Forgot password" ដើម្បីទទួលតំណកំណត់ឡើងវិញតាមអ៊ីមែល។ អ្នកអាចទិញ eSIM ដោយមិនចាំបាច់មានគណនីក៏បាន ប៉ុន្តែគណនីជួយរក្សាការបញ្ជាទិញ និងជើងហោះហើររបស់អ្នក។ សូមកុំចែករំលែកពាក្យសម្ងាត់ជាមួយនរណា។',
      en: 'You can create an account or sign in with your email in the app. Forgot your password? Tap "Forgot password" to get a reset link by email. You can buy an eSIM without an account, but an account keeps your orders and saved flights in one place. Never share your password with anyone.',
    },
  },
  {
    id: 'affiliate',
    keywords: [
      'affiliate', 'referral', 'refer a friend', 'refer', 'commission', 'earn money', 'promo code',
      'discount code', 'coupon', 'invite friends', 'partner program', 'become a partner',
      'ភ្នាក់ងារ', 'ណែនាំមិត្ត', 'កម្រៃជើងសារ', 'កូដបញ្ចុះតម្លៃ', 'រកលុយ',
    ],
    answer: {
      km: 'Domner មានកម្មវិធីភ្នាក់ងារ (affiliate)៖ ចែករំលែកតំណណែនាំរបស់អ្នក ហើយទទួលបានកម្រៃជើងសារ ៣០% ពីការទិញ ចំណែកមិត្តរបស់អ្នកទទួលបានការបញ្ចុះតម្លៃស្វ័យប្រវត្តិ។ ចុះឈ្មោះក្នុងផ្នែក Affiliate ក្នុងកម្មវិធី — ល្អសម្រាប់អ្នកបង្កើតមាតិកា និងមគ្គុទេសក៍ទេសចរណ៍។',
      en: "Domner has an affiliate program: share your referral link and earn 30% commission on purchases, while your friends get an automatic discount. Sign up in the Affiliate section of the app — great for content creators and tour guides. I can point you there anytime.",
    },
  },
  {
    id: 'pro_subscription',
    keywords: [
      'domner pro', 'pro plan', 'subscription', 'subscribe', 'premium membership', 'upgrade to pro', 'membership',
      'concierge', 'predictive delay', 'real gate',
      'ជាវ', 'សមាជិកភាព', 'ព្រូ', 'ដំឡើងកម្រិត',
    ],
    answer: {
      km: 'Domner Pro (ជាវប្រចាំខែ) កំពុងមកដល់ — វានឹងបន្ថែម ព័ត៌មានផ្លូវចេញ/counter ពិតប្រាកដ, ការទស្សន៍ទាយការពន្យារ, ការជូនដំណឹង push កម្រិតខ្ពស់ និងជំនួយ concierge ខ្មែរ ២៤/៧ អាទិភាព។ មុខងារសំខាន់ៗ (តាមដានជើងហោះហើរ, eSIM, checklist, ឃ្លាអាសន្ន) នៅតែឥតគិតថ្លៃ។ ខ្ញុំនឹងប្រាប់នៅពេលបើកដំណើរការ។',
      en: 'Domner Pro (a monthly subscription) is on the way — it will add verified real gate/counter info, predictive delay intelligence, advanced push alerts, and priority 24/7 Khmer concierge support. The core features (flight tracking, eSIM, checklist, emergency phrases) stay free. I\'ll let you know when it launches.',
    },
  },
  {
    id: 'privacy',
    keywords: [
      'privacy', 'my data', 'data safe', 'secure', 'do you sell my data', 'gdpr', 'personal information',
      'ឯកជនភាព', 'ទិន្នន័យរបស់ខ្ញុំ', 'សុវត្ថិភាពទិន្នន័យ',
    ],
    answer: {
      km: 'ឯកជនភាពរបស់អ្នកសំខាន់សម្រាប់ Domner។ យើងមិនលក់ទិន្នន័យផ្ទាល់ខ្លួនរបស់អ្នកទេ ហើយ ខ្ញុំ (Copilot) មិនស្នើសុំ ឬរក្សាទុកពាក្យសម្ងាត់, លេខកាត, ឬលេខ passport ពេញលេញឡើយ។ ការទូទាត់ដំណើរការតាមអ្នកផ្តល់សេវាមានសុវត្ថិភាព (Stripe / ABA)។',
      en: "Your privacy matters to Domner. We don't sell your personal data, and I (the Copilot) never ask for or store passwords, card numbers, or full passport numbers. Payments run through secure providers (Stripe / ABA). If you have a specific privacy question, support can help.",
    },
  },
  {
    id: 'support',
    keywords: [
      'support', 'contact', 'contact you', 'human', 'real person', 'agent', 'talk to someone', 'talk to a person',
      'help desk', 'customer service', 'call you', 'phone number for support', 'complaint',
      'ជំនួយ', 'ទំនាក់ទំនង', 'បុគ្គលិក', 'មនុស្សពិត', 'សេវាអតិថិជន', 'តវ៉ា',
    ],
    answer: {
      km: `ក្រុមការងារ Domner ជួយ ២៤/៧ ជាភាសាខ្មែរ។ អ្នកអាចឆ្លើយតបទៅអ៊ីមែលបញ្ជាក់ការបញ្ជាទិញរបស់អ្នក ឬផ្ញើសារមក Telegram៖ ${TELEGRAM}។ សម្រាប់សំណួរលឿនៗអំពី eSIM, ជើងហោះហើរ ឬដំណើរ ខ្ញុំក៏អាចជួយភ្លាមៗនៅទីនេះ។`,
      en: `Domner support is available 24/7 in Khmer. You can reply to your order confirmation email or message us on Telegram: ${TELEGRAM}. For quick questions about eSIMs, flights or your trip, I can help you right here too.`,
    },
  },
  {
    id: 'products',
    keywords: [
      'what do you offer', 'what can you do', 'what can you help', 'services', 'features', 'what is domner',
      'about domner', 'how does domner work', 'what is this app',
      'អ្វីខ្លះ', 'សេវាកម្ម', 'អាចធ្វើអ្វី', 'អំពី domner', 'កម្មវិធីនេះ',
    ],
    answer: {
      km: 'Domner គឺជាកម្មវិធីធ្វើដំណើរ super app ភាសាខ្មែរដំបូងគេ — ជាភ្នាក់ងារធ្វើដំណើរផ្ទាល់ខ្លួនរបស់អ្នក។ យើងផ្តល់៖ ① eSIM សម្រាប់ ២០+ ប្រទេស, ② Flight Guardian តាមដានជើងហោះហើរផ្ទាល់, ③ Airport Companion មគ្គុទេសក៍ព្រលានយន្តហោះ, ④ "Am I Ready?" checklist, ⑤ ព័ត៌មានទិដ្ឋាការ/គយ/រូបិយប័ណ្ណ/សុវត្ថិភាព, ⑥ ឃ្លាអាសន្ន offline, និង ⑦ ឧបករណ៍រៀបចំដំណើរ។ តើចាប់ផ្តើមពីអ្វី?',
      en: 'Domner is Cambodia\'s first Khmer-language travel super app — your personal travel agent. We offer: ① eSIMs for 20+ countries, ② Flight Guardian live flight tracking, ③ Airport Companion airport guides, ④ the "Am I Ready?" checklist, ⑤ visa / customs / currency / safety info, ⑥ offline emergency phrases, and ⑦ trip-planning tools. Where would you like to start?',
    },
  },
  {
    id: 'availability',
    keywords: [
      'are you open', 'what are your hours', 'always available', '24/7', 'open now', 'when can i reach you',
      'ម៉ោងធ្វើការ', 'បើកម៉ោងណា', '២៤ម៉ោង',
    ],
    answer: {
      km: 'ខ្ញុំ (Copilot) នៅទីនេះ ២៤/៧ — ឆ្លើយភ្លាមៗគ្រប់ពេលវេលា។ ក្រុមការងារមនុស្សក៏ជួយ ២៤/៧ ជាភាសាខ្មែរផងដែរ តាមអ៊ីមែល ឬ Telegram។',
      en: "I (the Copilot) am here 24/7 — instant answers any time of day. Our human support team is also available 24/7 in Khmer, by email or Telegram.",
    },
  },
];

// The eSIM-price intent is handled specially (it may name a country), so it is
// detected here rather than as a plain keyword answer above.
const PRICE_KEYWORDS = [
  'price', 'cost', 'how much', 'how much is', 'how many gb', 'data plan', 'plan', 'buy esim', 'esim for',
  'cheapest', 'rate for', 'pricing',
  'តម្លៃ', 'ថ្លៃ', 'ប៉ុន្មាន', 'ទិញ', 'គីកា', ' គី', 'ថេប្លុក', 'តម្លៃប៉ុន្មាន',
];

// Topic signal words reused for country-aware answers (visa/customs/currency/
// safety). When one of these appears AND a country is named, we answer with the
// exact data for that country instead of the generic intent text.
const VISA_SIGNAL = [
  'visa', 'e-visa', 'evisa', 'entry requirement', 'visa on arrival', 'visa free', 'visa-free', 'k-eta', 'keta',
  'how long can i stay', 'arrival card', 'ទិដ្ឋាការ', 'វីសា',
];
const CUSTOMS_SIGNAL = [
  'customs', 'declare', 'declaration', 'how much cash', 'bring into', 'duty free', 'duty-free', 'import',
  'គយ', 'ប្រកាស', 'នាំចូល',
];
const CURRENCY_SIGNAL = [
  'exchange rate', 'currency', 'money changer', 'change money', 'atm', 'convert', 'exchange money', 'riel',
  'dollar to', 'usd to', 'អត្រា', 'ប្តូរប្រាក់', 'រូបិយប័ណ្ណ', 'រៀល',
];
const SAFETY_SIGNAL = [
  'scam', 'scams', 'is it safe', 'safe', 'safety', 'dangerous', 'danger', 'rip off', 'ripoff', 'pickpocket',
  'crime', 'បោកប្រាស់', 'សុវត្ថិភាព', 'គ្រោះថ្នាក់',
];

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const k of keywords) {
    if (k.trim() && lower.includes(k.toLowerCase())) n += 1;
  }
  return n;
}
const has = (text: string, keywords: string[]) => countMatches(text, keywords) > 0;

// ── The fallback answer (when we can't confidently match a topic) ────────────
function fallback(lang: Lang): string {
  return lang === 'km'
    ? 'ខ្ញុំនៅទីនេះដើម្បីជួយអំពីការធ្វើដំណើរ និង Domner។ សូមសាកសួរអំពី៖ eSIM និងតម្លៃ, ការតាមដានជើងហោះហើរ, ទិដ្ឋាការ, រូបិយប័ណ្ណ, សុវត្ថិភាព/ការបោកប្រាស់, ឥវ៉ាន់, មគ្គុទេសក៍ព្រលានយន្តហោះ, បញ្ជីត្រៀមដំណើរ, ការទូទាត់ ឬការទាក់ទងជំនួយ។ តើខ្ញុំអាចជួយអ្វី?'
    : "I'm here to help with your trip and Domner. Try asking about: eSIMs & prices, flight tracking, visas, currency, safety/scams, baggage, airport guides, the trip checklist, payments, or contacting support. What do you need?";
}

// ── Main entry point ─────────────────────────────────────────────────────────
/**
 * generateReply — produce the assistant's answer for a conversation.
 *
 * This is the whole "AI": it reads the latest traveller message, works out the
 * language, topic, and country, and returns a grounded reply built from
 * Domner's own data. It never throws and never calls an external service, so it
 * always responds.
 *
 * Priority order (most specific first):
 *   1. Country + price          → exact eSIM price line
 *   2. Country + visa/customs/currency/safety → exact data for that country
 *   3. A clear topic keyword     → that intent's answer
 *   4. Country + eSIM signal / bare country name → that country's prices
 *   5. General price question    → popular starting prices
 *   6. Friendly fallback
 */
export function generateReply(turns: ChatTurn[], context?: ChatContext): string {
  const lastUser = [...turns].reverse().find((t) => t.role === 'user');
  const text = (lastUser?.content ?? '').trim();
  const lang = detectLang(text);

  if (!text) return fallback(lang);

  const askedPrice = countMatches(text, PRICE_KEYWORDS) > 0;
  const esimSignal = countMatches(text, ['esim', 'e-sim', 'ស៊ីម', 'អ៊ីស៊ីម', 'internet', 'mobile data', ' data']) > 0;
  const country = detectCountry(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Score the keyword intents up front so a clear topic (e.g. "VPN in China")
  // wins over a bare country mention.
  let best: Intent | null = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const score = countMatches(text, intent.keywords);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }

  const priceTail =
    lang === 'km'
      ? ' គ្រប់គម្រោងរួមបញ្ចូល hotspot, ការផ្ញើ QR ភ្លាមៗ និងជំនួយខ្មែរ ២៤/៧។ ទិញបាននៅ eSIM store ក្នុងកម្មវិធី។'
      : ' Every plan includes hotspot, instant QR delivery, and 24/7 Khmer support. Buy it in the eSIM store in the app.';

  // 1) Country named together with a visa / customs / currency / safety signal
  //    → answer with the exact data for that country (our biggest "deep
  //    knowledge" win — grounded in data/customsRules.ts, scamAlerts.ts, etc.).
  //    This runs BEFORE the price check because words like "how much (cash)"
  //    overlap with price wording; and we skip it when there's a clear eSIM
  //    signal, so "is the japan esim reliable" stays about the eSIM, not scams.
  if (country && !esimSignal) {
    if (has(text, VISA_SIGNAL)) {
      const line = countryVisaLine(country, lang);
      if (line) return line;
    }
    if (has(text, CUSTOMS_SIGNAL)) {
      const line = countryCustomsLine(country, lang);
      if (line) return line;
    }
    if (has(text, CURRENCY_SIGNAL)) {
      const line = countryCurrencyLine(country, lang);
      if (line) return line;
    }
    if (has(text, SAFETY_SIGNAL)) {
      const line = countryScamLine(country, lang);
      if (line) return line;
    }
  }

  // 2) Explicit price question about a specific country → exact price line.
  if (country && askedPrice) {
    const line = countryPriceLine(country, lang);
    if (line) return line + priceTail;
  }

  // 3) A clear topic keyword matched (setup, VPN, flights, payment, …) → use it.
  if (best && bestScore > 0) {
    let reply = pick(best.answer, lang);
    if (best.id === 'flight' && context?.flightSummary) {
      reply +=
        lang === 'km'
          ? `\n\nជើងហោះហើរបច្ចុប្បន្នរបស់អ្នក៖ ${context.flightSummary}`
          : `\n\nYour current flight: ${context.flightSummary}`;
    }
    return reply;
  }

  // 4) Country named with an eSIM/data signal, or the message is essentially
  //    just the country name → show that country's live prices.
  if (country && (esimSignal || wordCount <= 3)) {
    const line = countryPriceLine(country, lang);
    if (line) return line + (esimSignal || askedPrice ? priceTail : '');
  }

  // 5) General price question with no country → show popular starting prices.
  if (askedPrice && !country) {
    const from = money(DOMNER_FACTS.fromPriceUsd);
    const popular = destinations.filter((d) => d.popular).slice(0, 5);
    const list = popular
      .map((d) => `${lang === 'km' ? d.nameKm : d.name} ${d.flag} ${money(d.fromPriceUsd)}`)
      .join(', ');
    return lang === 'km'
      ? `eSIM របស់យើងគ្របដណ្តប់ ${DOMNER_FACTS.countryCount}+ ប្រទេស ចាប់ពី ${from}។ ឧទាហរណ៍ពេញនិយម៖ ${list}។ គម្រោងមាន ៣ កម្រិត៖ Basic (៣ថ្ងៃ), Standard (៧ថ្ងៃ — ពេញនិយម), Premium (១៥ថ្ងៃ)។ ប្រាប់ខ្ញុំពីប្រទេសណា ខ្ញុំនឹងបង្ហាញតម្លៃពិត។`
      : `Our eSIMs cover ${DOMNER_FACTS.countryCount}+ countries from ${from}. Popular examples: ${list}. Each has 3 tiers: Basic (3 days), Standard (7 days — most popular), Premium (15 days). Tell me which country and I'll show exact prices.`;
  }

  // 6) Nothing matched → friendly fallback that guides them to real topics.
  return fallback(lang);
}
