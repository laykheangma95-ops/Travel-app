// ─────────────────────────────────────────────────────────────────────────────
// Domner Offline Engine — the Copilot's safety net, self-hosted.
//
// WHAT THIS IS (for beginners):
//   This is the SIMPLE half of the Trip Copilot. It is not an AI model and it
//   cannot reason: for each message it (1) detects the language, (2) guesses the
//   topic by matching keywords (in Khmer AND English), and (3) returns a
//   pre-written answer built from our live data files. If nobody wrote an answer
//   for a question, it can only reply with a friendly "try asking about…".
//
//   That is exactly why adding more text here never made the Copilot feel
//   smarter — a keyword matcher has no understanding to improve. The thinking
//   now happens in lib/domnerAI.ts, which sends the question to Claude.
//
//   This engine still earns its place, because it:
//     • is FREE — it can never fail with a "no credits" / 402 error,
//     • answers instantly, with no network call at all,
//     • can't "hallucinate", since every reply comes from our own data.
//   So /api/chat tries Claude first and falls back to this whenever the AI is
//   switched off or unreachable. The traveller always gets an answer.
//
// HOW TO EDIT:
//   To change wording, edit the plain-text answers below. To teach a new topic,
//   add an entry to INTENTS (keywords + an answer). No AI knowledge needed.
// ─────────────────────────────────────────────────────────────────────────────

import { destinations } from '@/data/destinations';
import { esimPlans } from '@/data/esimPlans';
import { DOMNER_FACTS, detectCountry } from '@/lib/domnerBrain';

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

function priceFor(slug: string, tier: 'basic' | 'standard' | 'premium'): number | undefined {
  return esimPlans.find((p) => p.countrySlug === slug && p.tier === tier)?.priceUsd;
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

// Which destination the traveller mentioned (English name, Khmer name, slug, or
// a nickname like "dubai") is worked out by detectCountry in lib/domnerBrain.ts,
// so the AI layer and this engine always resolve country names the same way.

// ── Intent definitions ───────────────────────────────────────────────────────
// Each intent is a set of trigger keywords (Khmer + English) and a bilingual
// answer. Order matters only for ties; we pick the intent with the most matches.
interface Intent {
  id: string;
  keywords: string[];
  answer: Bilingual;
}

const TELEGRAM = DOMNER_FACTS.supportTelegram; // https://t.me/domnerapp

const INTENTS: Intent[] = [
  {
    id: 'greeting',
    keywords: ['hello', 'hi ', 'hey', 'good morning', 'good evening', 'សួស្តី', 'ជម្រាបសួរ', 'អរុណសួស្តី'],
    answer: {
      km: 'សួស្តី! ខ្ញុំជា Domner Trip Copilot ✦ ជំនួយការធ្វើដំណើររបស់អ្នក។ ខ្ញុំអាចជួយអំពី eSIM, ការតាមដានជើងហោះហើរ, មគ្គុទេសក៍ព្រលានយន្តហោះ និងការរៀបចំដំណើរ។ តើខ្ញុំអាចជួយអ្វីបាន?',
      en: "Hi! I'm your Domner Trip Copilot ✦ — your travel assistant. I can help with eSIMs, flight tracking, airport guides, and trip prep. What can I help you with?",
    },
  },
  {
    id: 'esim_setup',
    keywords: [
      'install', 'setup', 'set up', 'qr', 'activate', 'how does my esim', 'how to use',
      'turn on', 'scan', 'ដំឡើង', 'ដំណើរការ', 'របៀបប្រើ', 'ស្កេន', 'បើក',
    ],
    answer: {
      km: 'បន្ទាប់ពីទិញរួច លេខកូដ QR eSIM នឹងផ្ញើទៅអ៊ីមែលរបស់អ្នកក្នុងរយៈពេលប្រហែល ១៥ នាទី។ សូម "ដំឡើង" eSIM មុនពេលឡើងយន្តហោះ (ត្រូវការ Wi-Fi) ដោយចូល Settings → Mobile/Cellular → Add eSIM → ស្កេន QR ពីអ៊ីមែល។ ប៉ុន្តែ "បើកដំណើរការ" វាបានតែពេលចុះដល់គោលដៅ ដើម្បីកុំឲ្យខាតទិន្នន័យ។',
      en: 'After you buy, your eSIM QR code is emailed within ~15 minutes. INSTALL it before you fly (needs Wi-Fi): Settings → Mobile/Cellular → Add eSIM → scan the QR from the email. Only TURN IT ON after you land, so no data is wasted. Every plan includes hotspot & 24/7 Khmer support.',
    },
  },
  {
    id: 'esim_compatibility',
    keywords: [
      'compatible', 'support esim', 'which phone', 'my phone', 'iphone', 'samsung', 'pixel', 'android',
      'ទូរស័ព្ទ', 'អាចប្រើ', 'ស៊ីម',
    ],
    answer: {
      km: 'eSIM ត្រូវការទូរស័ព្ទដែលគាំទ្រ eSIM៖ iPhone XS ឡើងទៅ, Google Pixel 3 ឡើងទៅ និង Samsung Galaxy S/Note/Z ជំនាន់ថ្មីៗ។ ទូរស័ព្ទចាស់ៗ អាចមិនគាំទ្រ។ ដើម្បីពិនិត្យ៖ Settings → About → មើលថាមាន "EID" ដែរឬទេ។',
      en: 'eSIM needs an eSIM-capable phone: iPhone XS and newer, Google Pixel 3 and newer, and recent Samsung Galaxy S/Note/Z. Older phones may not support it. To check: Settings → About → look for an "EID" number.',
    },
  },
  {
    id: 'china_vpn',
    keywords: ['china', 'vpn', 'google in china', 'whatsapp', 'facebook', 'ចិន', 'វីភីអិន'],
    answer: {
      km: 'eSIM ចិនរបស់ Domner មិនត្រូវការ VPN ទេ — Google, WhatsApp, Facebook ។ល។ ដំណើរការធម្មតា។ គ្រាន់តែដំឡើង eSIM មុនហោះ ហើយបើកនៅពេលចុះដល់ចិន។',
      en: "Domner's China eSIM needs NO VPN — Google, WhatsApp, Facebook, etc. all work normally. Just install the eSIM before you fly and turn it on when you land in China.",
    },
  },
  {
    id: 'flight',
    keywords: [
      'flight', 'delay', 'delayed', 'gate', 'boarding', 'track', 'departure', 'arrival', 'landing', 'status',
      'ជើងហោះហើរ', 'យន្តហោះ', 'ពន្យារ', 'ចេញ', 'ចុះ', 'តាមដាន', 'ផ្លូវចេញ',
    ],
    answer: {
      km: 'អ្នកអាចតាមដានជើងហោះហើររបស់អ្នកបានផ្ទាល់ជាមួយ Flight Guardian ក្នុងកម្មវិធី — វាផ្តល់ការជូនដំណឹងផ្ទាល់អំពីការប្តូរផ្លូវចេញ, ការពន្យារពេល, ការឡើងយន្តហោះ និងការចុះចត។ សូមបញ្ចូលលេខជើងហោះហើររបស់អ្នកនៅទំព័រ Flights។ ខ្ញុំមិនអាចប្រាប់ស្ថានភាពផ្ទាល់ដោយខ្លួនឯងបានទេ។',
      en: 'You can track your flight live with Flight Guardian in the app — it sends real-time alerts for gate changes, delays, boarding, and landing. Just enter your flight number on the Flights page. I can’t read live status myself, so the tracker is the source of truth.',
    },
  },
  {
    id: 'airport',
    keywords: ['airport', 'check-in', 'checkin', 'terminal', 'immigration', 'security', 'ព្រលានយន្តហោះ', 'ឆេកអ៊ីន', 'ធ្វើការឆែក'],
    answer: {
      km: 'Airport Companion ក្នុងកម្មវិធីមានមគ្គុទេសក៍ជាជំហានៗ ជាភាសាខ្មែរ ចាប់ពីការឆេកអ៊ីនរហូតដល់ការឡើងយន្តហោះ។ ជាទូទៅ សូមទៅដល់ព្រលានយន្តហោះ ២ ម៉ោងមុនជើងហោះហើរក្នុងស្រុក ឬ ៣ ម៉ោងមុនជើងហោះហើរអន្តរជាតិ។',
      en: 'The Airport Companion in the app gives step-by-step guides in Khmer, from check-in to boarding. As a rule, arrive 2 hours before a domestic flight or 3 hours before an international flight.',
    },
  },
  {
    id: 'checklist',
    keywords: ['checklist', 'ready', 'what to pack', 'what should i bring', 'prepare', 'បញ្ជី', 'ត្រៀម', 'រៀបចំ', 'យកអ្វី'],
    answer: {
      km: 'ប្រើ "Am I Ready?" checklist ក្នុងកម្មវិធី — វាបង្កើតបញ្ជីត្រៀមខ្លួនតាមគោលដៅរបស់អ្នក។ កុំភ្លេចរក្សាទុក passport, boarding pass និង QR eSIM ជាឯកសារ offline មុនពេលហោះ។',
      en: 'Use the "Am I Ready?" checklist in the app — it builds a personalised pre-trip list for your destination. Don’t forget to save your passport, boarding pass, and eSIM QR offline before you fly.',
    },
  },
  {
    id: 'emergency',
    keywords: ['emergency', 'phrase', 'hospital', 'police', 'help me', 'lost', 'អាសន្ន', 'ឃ្លា', 'មន្ទីរពេទ្យ', 'ប៉ូលិស', 'វង្វេង'],
    answer: {
      km: 'ផ្នែក Emergency Phrases ក្នុងកម្មវិធីមានឃ្លាធ្វើដំណើរសំខាន់ៗ (ចុចដើម្បីចម្លង) ដែលដំណើរការ offline — មានប្រយោជន៍ពេលអាសន្ន។ ក្នុងករណីអាសន្នពិត សូមទាក់ទងលេខសង្គ្រោះបន្ទាន់ក្នុងស្រុករបស់ប្រទេសនោះ។',
      en: 'The Emergency Phrases section has key travel phrases (tap to copy) that work offline — handy in a pinch. In a real emergency, always contact the local emergency number for the country you’re in.',
    },
  },
  {
    id: 'payment',
    keywords: ['pay', 'payment', 'card', 'visa', 'mastercard', 'khqr', 'aba', 'stripe', 'checkout', 'បង់ប្រាក់', 'ទូទាត់', 'កាត'],
    answer: {
      km: 'Domner ទទួលការទូទាត់ជាមួយ កាតអន្តរជាតិ (តាម Stripe) និង KHQR / ABA PayWay សម្រាប់ការបង់ប្រាក់ក្នុងស្រុក។ តម្លៃទាំងអស់បង្ហាញជា USD។',
      en: 'Domner accepts international cards (via Stripe) and KHQR / ABA PayWay for local Cambodian payment. All prices are shown in USD.',
    },
  },
  {
    id: 'support',
    keywords: ['support', 'contact', 'human', 'agent', 'talk to', 'help desk', 'ជំនួយ', 'ទំនាក់ទំនង', 'បុគ្គលិក'],
    answer: {
      km: `ក្រុមការងារ Domner ជួយ ២៤/៧ ជាភាសាខ្មែរ។ អ្នកអាចឆ្លើយតបទៅអ៊ីមែលបញ្ជាក់ការបញ្ជាទិញរបស់អ្នក ឬផ្ញើសារមក Telegram៖ ${TELEGRAM}`,
      en: `Domner support is available 24/7 in Khmer. You can reply to your order confirmation email or message us on Telegram: ${TELEGRAM}`,
    },
  },
  {
    id: 'refund_booking',
    keywords: ['refund', 'cancel', 'change my order', 'money back', 'rebook', 'សំណង', 'បោះបង់', 'ប្តូរ', 'សងប្រាក់'],
    answer: {
      km: `ខ្ញុំមិនអាចធ្វើការបញ្ជាទិញ, បោះបង់, ឬសងប្រាក់ដោយផ្ទាល់បានទេ។ សម្រាប់រឿងទាំងនេះ សូមទាក់ទងក្រុមការងារ Domner (ឆ្លើយតបអ៊ីមែលបញ្ជាទិញ ឬ Telegram៖ ${TELEGRAM}) ហើយពួកគេនឹងជួយភ្លាមៗ។`,
      en: `I can’t book, cancel, or refund orders myself. For those, please contact Domner support (reply to your order email or Telegram: ${TELEGRAM}) and the team will help you right away.`,
    },
  },
  {
    id: 'products',
    keywords: ['what do you offer', 'what can you do', 'services', 'features', 'what is domner', 'អ្វីខ្លះ', 'សេវាកម្ម', 'អាចធ្វើអ្វី'],
    answer: {
      km: 'Domner គឺជាកម្មវិធីធ្វើដំណើរ super app ភាសាខ្មែរដំបូងគេ។ យើងផ្តល់៖ ① eSIM សម្រាប់ ២០+ ប្រទេស, ② Flight Guardian តាមដានជើងហោះហើរផ្ទាល់, ③ Airport Companion មគ្គុទេសក៍ព្រលានយន្តហោះ, ④ "Am I Ready?" checklist, ⑤ ឃ្លាអាសន្ន offline, និង ⑥ ឧបករណ៍រៀបចំដំណើរ។',
      en: 'Domner is Cambodia’s first Khmer-language travel super app. We offer: ① eSIMs for 20+ countries, ② Flight Guardian live flight tracking, ③ Airport Companion airport guides, ④ the "Am I Ready?" checklist, ⑤ offline emergency phrases, and ⑥ trip-planning tools.',
    },
  },
  {
    id: 'thanks',
    keywords: ['thank', 'thanks', 'appreciate', 'អរគុណ', 'សូមអរគុណ'],
    answer: {
      km: 'មិនអីទេ! 😊 ជូនពរដំណើរកម្សាន្តរីករាយ។ បើមានសំណួរអ្វីទៀត សូមសួរបាន។',
      en: "You’re welcome! 😊 Safe travels — ask me anytime if you need anything else.",
    },
  },
];

// The eSIM-price intent is handled specially (it may name a country), so it is
// detected here rather than as a plain keyword answer above.
const PRICE_KEYWORDS = [
  'price', 'cost', 'how much', 'how many gb', 'data', 'plan', 'buy esim', 'esim for',
  'តម្លៃ', 'ថ្លៃ', 'ប៉ុន្មាន', 'ទិញ', 'គីកា', ' គី', 'ថេប្លុក',
];

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const k of keywords) {
    if (k.trim() && lower.includes(k.toLowerCase())) n += 1;
  }
  return n;
}

// ── The fallback answer (when we can't confidently match a topic) ────────────
function fallback(lang: Lang): string {
  return lang === 'km'
    ? 'ខ្ញុំនៅទីនេះដើម្បីជួយអំពីការធ្វើដំណើរ និង Domner។ សូមសាកសួរអំពី៖ eSIM និងតម្លៃ, ការតាមដានជើងហោះហើរ, មគ្គុទេសក៍ព្រលានយន្តហោះ, បញ្ជីត្រៀមដំណើរ, ការទូទាត់ ឬការទាក់ទងជំនួយ។ តើខ្ញុំអាចជួយអ្វី?'
    : "I'm here to help with your trip and Domner. Try asking about: eSIMs & prices, flight tracking, airport guides, the trip checklist, payments, or contacting support. What do you need?";
}

// ── Main entry point ─────────────────────────────────────────────────────────
/**
 * generateReply — produce a fallback answer for a conversation.
 *
 * Reads the latest traveller message, works out the language and topic, and
 * returns a grounded reply built from Domner's own data. It never throws and
 * never calls an external service, so it always responds — which is what makes
 * it a safe last resort when the Claude layer is unavailable.
 */
export function generateReply(turns: ChatTurn[], context?: ChatContext): string {
  const lastUser = [...turns].reverse().find((t) => t.role === 'user');
  const text = (lastUser?.content ?? '').trim();
  const lang = detectLang(text);

  if (!text) return fallback(lang);

  const askedPrice = countMatches(text, PRICE_KEYWORDS) > 0;
  const esimSignal = countMatches(text, ['esim', 'e-sim', 'ស៊ីម', 'អ៊ីស៊ីម', 'internet', 'data']) > 0;
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

  // 1) Explicit price question about a specific country → exact price line.
  if (country && askedPrice) {
    const line = countryPriceLine(country, lang);
    if (line) return line + priceTail;
  }

  // 2) A clear topic keyword matched (setup, VPN, flights, payment, …) → use it.
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

  // 3) Country named with an eSIM/data signal, or the message is essentially
  //    just the country name → show that country's live prices.
  if (country && (esimSignal || wordCount <= 3)) {
    const line = countryPriceLine(country, lang);
    if (line) return line + (esimSignal || askedPrice ? priceTail : '');
  }

  // 4) General price question with no country → show popular starting prices.
  if (askedPrice && !country) {
    const from = money(DOMNER_FACTS.fromPriceUsd);
    const popular = destinations.filter((d) => d.popular).slice(0, 5);
    const list = popular
      .map((d) => `${lang === 'km' ? d.nameKm : d.name} ${d.flag} ${money(d.fromPriceUsd)}`)
      .join(', ');
    return lang === 'km'
      ? `eSIM របស់យើងគ្របដណ្តប់ ${DOMNER_FACTS.countryCount}+ ប្រទេស ចាប់ពី ${from}។ ឧទាហរណ៍ពេញនិយម៖ ${list}។ គម្រោងមាន ៣ កម្រិត៖ Basic (៣ថ្ងៃ), Standard (៧ថ្ងៃ — ពេញនិយម), Premium (១៥ថ្ងៃ)។ ប្រាប់ខ្ញុំពីប្រទេសណា ខ្ញុំនឹងបង្ហាញតម្លៃពិត។`
      : `Our eSIMs cover ${DOMNER_FACTS.countryCount}+ countries from ${from}. Popular examples: ${list}. Each has 3 tiers: Basic (3 days), Standard (7 days — most popular), Premium (15 days). Tell me which country and I’ll show exact prices.`;
  }

  // 5) Nothing matched → friendly fallback that guides them to real topics.
  return fallback(lang);
}
