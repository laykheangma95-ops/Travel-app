// ─────────────────────────────────────────────────────────────────────────────
// Domner Concept Search — the offline brain that understands MEANING.
//
// WHAT THIS IS (for beginners):
//   The old offline engine matched raw keywords: it looked for the letters
//   "flight" inside your message. That is why "What can I carry on a flight?"
//   was answered with flight tracking — the word matched, the meaning did not.
//
//   This file fixes that. Instead of matching words, it matches CONCEPTS.
//   "carry", "bring", "pack", "luggage", "liquids", "power bank" and the Khmer
//   "យក", "ឥវ៉ាន់" all point at one idea: BAGGAGE. Every answer we can give is
//   tagged with the ideas it covers, so a question finds the right answer even
//   when it uses words nobody wrote down in advance.
//
//   It works in three passes:
//     1. CONCEPTS — which ideas is this question about? (the meaning layer)
//     2. WORDS    — which answers share rare, informative words with it?
//     3. PLACES   — did they name a country or airport we have data for?
//   The three scores are added up and the best answer wins, as long as it beats
//   a confidence bar. Below that bar we admit we don't know instead of guessing.
//
// KHMER NOTE:
//   Khmer does not put spaces between words, so you cannot split a sentence
//   into words the way you can in English. We compare short character sequences
//   instead, which works for both languages without a Khmer dictionary.
//
// WHAT IT IS NOT:
//   This is not a neural AI model — it does not learn and cannot reason about
//   something genuinely new. It is a very good librarian: it finds the right
//   page fast, for free, with no API key. The reasoning lives in lib/domnerAI.ts
//   (Claude), which takes over for the hard questions.
//
// HOW TO TEACH IT:
//   • New wording for an existing idea → add it to CONCEPTS below.
//   • A brand-new topic → add an entry to TOPIC_ANSWERS below.
//   • New countries, scams, customs rules, airports → just edit the files in
//     data/. Those answers are generated automatically; nothing to do here.
// ─────────────────────────────────────────────────────────────────────────────

import { destinations } from '@/data/destinations';
import { esimPlans } from '@/data/esimPlans';
import { customsRules } from '@/data/customsRules';
import { scamAlerts } from '@/data/scamAlerts';
import { airportGuides } from '@/data/airportGuides';
import { DOMNER_FACTS } from '@/lib/domnerBrain';

export type Lang = 'km' | 'en';

/** A bilingual string: the Khmer and English versions of the same answer. */
export interface Bilingual {
  km: string;
  en: string;
}

const TELEGRAM = DOMNER_FACTS.supportTelegram;

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE CONCEPT DICTIONARY — this is the "meaning" layer.
//
// Each concept is one idea a traveller might have in mind, followed by every
// way we have seen people express it, in English and Khmer. Adding a phrase
// here teaches every answer tagged with that concept to recognise it.
// ─────────────────────────────────────────────────────────────────────────────

const CONCEPTS: Record<string, string[]> = {
  baggage: [
    'carry on', 'carry-on', 'carryon', 'bring', 'take with', 'allowed to take',
    'what can i carry', 'luggage', 'baggage', 'suitcase', 'bag', 'pack', 'packing',
    'hand luggage', 'checked bag', 'allowance', 'liquid', 'liquids', 'bottle',
    'power bank', 'powerbank', 'battery', 'batteries', 'laptop', 'knife', 'scissors',
    'lighter', 'prohibited', 'forbidden', 'not allowed', 'duty free',
    'ឥវ៉ាន់', 'វ៉ាលី', 'យកអ្វី', 'អាចយក', 'ទឹក', 'ថ្ម', 'កាំបិត', 'ហាមឃាត់',
  ],
  medication: [
    'medicine', 'medication', 'pills', 'prescription', 'drug', 'inhaler', 'insulin',
    'ថ្នាំ', 'ថ្នាំពេទ្យ',
  ],
  esim_setup: [
    'install', 'installation', 'setup', 'set up', 'activate', 'activation', 'qr',
    'qr code', 'scan', 'turn on', 'switch on', 'how to use', 'how do i use',
    'how does it work', 'how does this work', 'how does my esim', 'esim work',
    'sim work', 'does it work', 'how it works', 'not working', 'no signal',
    'no internet', 'no data', 'no connection',
    'ដំឡើង', 'ស្កេន', 'បើក', 'របៀបប្រើ', 'ដំណើរការ', 'មិនដំណើរការ',
  ],
  esim_compat: [
    'compatible', 'compatibility', 'support esim', 'supported', 'which phone',
    'my phone', 'iphone', 'samsung', 'galaxy', 'pixel', 'android', 'eid', 'device',
    'devices', 'handset', 'handsets', 'model', 'models', 'work with', 'works with',
    'ទូរស័ព្ទ', 'អាចប្រើ', 'ស៊ីម',
  ],
  price: [
    'price', 'prices', 'cost', 'costs', 'how much', 'how many dollar', 'fee', 'charge',
    'cheap', 'cheapest', 'expensive', 'budget', 'rate', 'plan', 'plans', 'package',
    'buy', 'purchase', 'order',
    'តម្លៃ', 'ថ្លៃ', 'ប៉ុន្មាន', 'ទិញ', 'ថោក', 'គម្រោង',
  ],
  data: [
    'gb', 'gigabyte', 'data', 'internet', 'mb', 'unlimited', 'hotspot', 'tethering',
    'speed', '4g', '5g', 'network', 'coverage',
    'ទិន្នន័យ', 'អ៊ីនធឺណិត', 'បណ្តាញ', 'ល្បឿន',
  ],
  china_vpn: [
    'china', 'vpn', 'blocked', 'block', 'great firewall', 'google in china',
    'whatsapp', 'facebook', 'instagram', 'youtube', 'censored',
    'ចិន', 'វីភីអិន', 'ហាមឃាត់',
  ],
  flight_status: [
    'my flight', 'flight status', 'track', 'tracking', 'delay', 'delayed', 'on time',
    'gate', 'boarding', 'departure time', 'arrival time', 'landing', 'landed',
    'cancelled', 'takeoff',
    'ជើងហោះហើរ', 'ពន្យារ', 'តាមដាន', 'ផ្លូវចេញ', 'ចុះចត', 'ហោះ',
  ],
  airport: [
    'airport', 'terminal', 'check in', 'check-in', 'checkin', 'immigration',
    'security', 'customs desk', 'counter', 'departures', 'arrivals', 'transit',
    'how early', 'what time should i arrive', 'queue',
    'ព្រលានយន្តហោះ', 'ឆេកអ៊ីន', 'អន្តោប្រវេសន៍', 'សន្តិសុខ',
  ],
  checklist: [
    'checklist', 'am i ready', 'ready', 'prepare', 'preparation', 'before i fly',
    'what should i do before', 'forget', 'remember to',
    'បញ្ជី', 'ត្រៀម', 'រៀបចំ',
  ],
  emergency: [
    'emergency', 'phrase', 'phrases', 'how do i say', 'translate', 'help me',
    'hospital', 'police', 'doctor', 'ambulance', 'sick', 'injured', 'accident',
    'lost', 'stolen', 'robbed',
    'អាសន្ន', 'ឃ្លា', 'និយាយ', 'មន្ទីរពេទ្យ', 'ប៉ូលិស', 'គ្រូពេទ្យ', 'វង្វេង', 'ជួយ',
  ],
  payment: [
    'pay', 'payment', 'card', 'credit card', 'debit', 'visa card', 'mastercard',
    'khqr', 'aba', 'wing', 'stripe', 'checkout', 'invoice', 'receipt',
    'បង់ប្រាក់', 'ទូទាត់', 'កាត',
  ],
  support: [
    'support', 'contact', 'human', 'agent', 'talk to someone', 'help desk',
    'customer service', 'telegram', 'email you', 'phone number',
    'ជំនួយ', 'ទំនាក់ទំនង', 'បុគ្គលិក',
  ],
  refund: [
    'refund', 'cancel', 'cancellation', 'money back', 'change my order', 'rebook',
    'return', 'wrong plan', 'charged twice',
    'សំណង', 'បោះបង់', 'សងប្រាក់', 'ប្តូរ',
  ],
  safety: [
    'safe', 'safety', 'dangerous', 'danger', 'scam', 'scams', 'scammed', 'cheat',
    'cheated', 'cheated me', 'rip off', 'ripoff', 'rip me off', 'ripped off',
    'overcharge', 'overcharged', 'fraud', 'tourist trap', 'careful', 'watch out',
    'risky', 'crime', 'theft', 'stolen', 'pickpocket', 'trust',
    'សុវត្ថិភាព', 'គ្រោះថ្នាក់', 'ការឆបោក', 'បោកប្រាស់', 'ប្រយ័ត្ន',
  ],
  visa_entry: [
    'visa', 'visa on arrival', 'e-visa', 'entry', 'enter the country', 'passport',
    'stamp', 'how long can i stay', 'stay', 'overstay', 'arrival card',
    'ទិដ្ឋាការ', 'លិខិតឆ្លងដែន', 'ចូលប្រទេស', 'ស្នាក់នៅ',
  ],
  money: [
    'cash', 'money', 'currency', 'exchange rate', 'exchange', 'atm', 'declare',
    'how much cash', 'how much money', 'dollars', 'local money', 'cash limit',
    'bring cash', 'carry cash', 'usd',
    'ប្រាក់', 'លុយ', 'ប្តូរប្រាក់', 'អត្រា',
  ],
  products: [
    'what do you offer', 'what can you do', 'what is domner', 'services', 'features',
    'who are you', 'about you', 'what do you sell',
    'អ្វីខ្លះ', 'សេវាកម្ម', 'អាចធ្វើអ្វី', 'អ្នកជានរណា',
  ],
  greeting: [
    'hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon',
    'សួស្តី', 'ជម្រាបសួរ', 'អរុណសួស្តី',
  ],
  thanks: ['thank', 'thanks', 'appreciate', 'អរគុណ'],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. TEXT HANDLING — turning a sentence into comparable pieces.
// ─────────────────────────────────────────────────────────────────────────────

const KHMER_RANGE = /[ក-៿]/;

/** Reply in Khmer if the traveller wrote any Khmer, otherwise English. */
export function detectLang(text: string): Lang {
  return KHMER_RANGE.test(text) ? 'km' : 'en';
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    // Drop punctuation, keeping Latin letters, digits, and Khmer script.
    .replace(/[^a-z0-9ក-៿\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Break text into comparable pieces.
 *
 * English gets whole words (with very common filler words dropped, since
 * matching on "the" tells us nothing). Khmer gets 3-character sequences,
 * because Khmer writes without spaces so there are no words to split on.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'do', 'does', 'did', 'to', 'of', 'in', 'on',
  'for', 'and', 'or', 'it', 'i', 'my', 'me', 'you', 'your', 'can', 'will', 'be',
  'have', 'has', 'with', 'at', 'that', 'this', 'what', 'how', 'when', 'where', 'if',
  'from', 'about', 'get', 'got', 'so', 'but', 'not', 'need', 'want', 'please',
]);

function tokenize(text: string): string[] {
  const clean = normalise(text);
  const tokens: string[] = [];

  for (const word of clean.split(' ')) {
    if (!word) continue;
    if (KHMER_RANGE.test(word)) {
      // Khmer: slide a 3-character window across the run of script.
      for (let i = 0; i + 3 <= word.length; i += 1) tokens.push(word.slice(i, i + 3));
      if (word.length < 3) tokens.push(word);
    } else if (word.length >= 2 && !STOP_WORDS.has(word)) {
      tokens.push(word);
    }
  }
  return tokens;
}

/**
 * Which concepts is this text about? A concept counts as present when any of
 * its phrases appears — for multi-word phrases we look for the whole phrase, so
 * "carry on" is not triggered by the word "on" alone.
 */
export function conceptsIn(text: string): Set<string> {
  const clean = normalise(text);
  const padded = ` ${clean} `;
  const found = new Set<string>();

  for (const [concept, phrases] of Object.entries(CONCEPTS)) {
    for (const phrase of phrases) {
      const needle = normalise(phrase);
      if (!needle) continue;
      // Khmer has no word boundaries, so substring matching is the right test.
      const hit = KHMER_RANGE.test(needle)
        ? clean.includes(needle)
        : padded.includes(` ${needle} `) || clean.includes(`${needle} `) || clean.endsWith(needle);
      if (hit) {
        found.add(concept);
        break;
      }
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE ANSWER LIBRARY — every page the librarian can find.
// ─────────────────────────────────────────────────────────────────────────────

/** One retrievable answer, tagged with the ideas it covers. */
export interface Passage {
  id: string;
  /** Ideas this answer is about — the main way it gets found. */
  concepts: string[];
  /** Extra searchable text (titles, country names) that isn't in the answer itself. */
  searchText: string;
  /** Which destination this answer is about, if any. */
  countrySlug?: string;
  /** Which airport this answer is about, if any. */
  airportCode?: string;
  answer: Bilingual;
}

/** Hand-written answers for the topics that aren't derived from data files. */
const TOPIC_ANSWERS: Passage[] = [
  {
    id: 'baggage',
    concepts: ['baggage', 'airport', 'medication'],
    searchText:
      'what can I carry bring on a flight hand luggage carry-on liquids power bank battery laptop knife prohibited items checked baggage allowance',
    answer: {
      km:
        'អ្វីដែលអាចយកឡើងយន្តហោះ (carry-on)៖ ទឹក/ក្រែម ត្រូវតែក្នុងដប ១០០ml ឬតិចជាង ដាក់ក្នុងថង់ប្លាស្ទិកថ្លាមួយ។ ថ្មបម្រុង (power bank) ត្រូវតែយកឡើងជាមួយខ្លួន — ហាមដាក់ក្នុងឥវ៉ាន់ផ្ញើ។ ' +
        'ហាមយកឡើង៖ កាំបិត, កន្ត្រៃ, ភ្លើងឆេះ។ ថ្នាំពេទ្យអាចយកបាន សូមទុកក្នុងកញ្ចប់ដើមរបស់វា។ ' +
        'ចំណែកទម្ងន់ឥវ៉ាន់ គឺកំណត់ដោយក្រុមហ៊ុនអាកាសចរណ៍ មិនមែន Domner ទេ — សូមពិនិត្យក្នុងសំបុត្ររបស់អ្នក។',
      en:
        'Carry-on rules: liquids must be in containers of 100ml or less, together in one clear plastic bag — bigger bottles go in checked baggage. Power banks and spare batteries must be in your CARRY-ON, never in checked baggage. ' +
        'Never in carry-on: knives, scissors, or lighters with fuel. Medication is fine — keep it in its original labelled packaging. ' +
        'At security you take out your laptop and remove your belt and jacket. Your baggage weight allowance is set by the airline, not Domner — check your booking confirmation.',
    },
  },
  {
    id: 'esim_setup',
    concepts: ['esim_setup', 'data'],
    searchText: 'how does my esim work install activate scan qr code turn on setup',
    answer: {
      km:
        'បន្ទាប់ពីទិញរួច លេខកូដ QR eSIM នឹងផ្ញើទៅអ៊ីមែលរបស់អ្នកក្នុងរយៈពេលប្រហែល ១៥ នាទី។ សូម "ដំឡើង" eSIM មុនពេលឡើងយន្តហោះ (ត្រូវការ Wi-Fi) ដោយចូល Settings → Mobile/Cellular → Add eSIM → ស្កេន QR ពីអ៊ីមែល។ ប៉ុន្តែ "បើកដំណើរការ" វាបានតែពេលចុះដល់គោលដៅ ដើម្បីកុំឲ្យខាតទិន្នន័យ។',
      en:
        'After you buy, your eSIM QR code is emailed within ~15 minutes. INSTALL it before you fly (needs Wi-Fi): Settings → Mobile/Cellular → Add eSIM → scan the QR from the email. Only TURN IT ON after you land, so no data is wasted. Every plan includes hotspot & 24/7 Khmer support.',
    },
  },
  {
    id: 'esim_compat',
    concepts: ['esim_compat'],
    searchText: 'is my phone compatible which handset device model iphone samsung galaxy pixel android EID',
    answer: {
      km:
        'eSIM ត្រូវការទូរស័ព្ទដែលគាំទ្រ eSIM៖ iPhone XS ឡើងទៅ, Google Pixel 3 ឡើងទៅ និង Samsung Galaxy S/Note/Z ជំនាន់ថ្មីៗ។ ទូរស័ព្ទចាស់ៗ អាចមិនគាំទ្រ។ ដើម្បីពិនិត្យ៖ Settings → About → មើលថាមាន "EID" ដែរឬទេ។',
      en:
        'eSIM needs an eSIM-capable phone: iPhone XS and newer, Google Pixel 3 and newer, and recent Samsung Galaxy S/Note/Z. Older phones may not support it. To check: Settings → About → look for an "EID" number.',
    },
  },
  {
    id: 'china_vpn',
    concepts: ['china_vpn', 'data'],
    countrySlug: 'china',
    searchText: 'china vpn google facebook whatsapp blocked great firewall',
    answer: {
      km:
        'eSIM ចិនរបស់ Domner មិនត្រូវការ VPN ទេ — Google, WhatsApp, Facebook ។ល។ ដំណើរការធម្មតា។ គ្រាន់តែដំឡើង eSIM មុនហោះ ហើយបើកនៅពេលចុះដល់ចិន។',
      en:
        "Domner's China eSIM needs NO VPN — Google, WhatsApp, Facebook, etc. all work normally. Just install the eSIM before you fly and turn it on when you land in China.",
    },
  },
  {
    id: 'flight_status',
    concepts: ['flight_status'],
    searchText: 'track my flight status delay gate boarding departure arrival landing',
    answer: {
      km:
        'អ្នកអាចតាមដានជើងហោះហើររបស់អ្នកបានផ្ទាល់ជាមួយ Flight Guardian ក្នុងកម្មវិធី — វាផ្តល់ការជូនដំណឹងផ្ទាល់អំពីការប្តូរផ្លូវចេញ, ការពន្យារពេល, ការឡើងយន្តហោះ និងការចុះចត។ សូមបញ្ចូលលេខជើងហោះហើររបស់អ្នកនៅទំព័រ Flights។ ខ្ញុំមិនអាចប្រាប់ស្ថានភាពផ្ទាល់ដោយខ្លួនឯងបានទេ។',
      en:
        'You can track your flight live with Flight Guardian in the app — it sends real-time alerts for gate changes, delays, boarding, and landing. Just enter your flight number on the Flights page. I can’t read live status myself, so the tracker is the source of truth.',
    },
  },
  {
    id: 'airport',
    concepts: ['airport'],
    searchText: 'airport check-in terminal immigration security how early should I arrive',
    answer: {
      km:
        'Airport Companion ក្នុងកម្មវិធីមានមគ្គុទេសក៍ជាជំហានៗ ជាភាសាខ្មែរ ចាប់ពីការឆេកអ៊ីនរហូតដល់ការឡើងយន្តហោះ។ ជាទូទៅ សូមទៅដល់ព្រលានយន្តហោះ ២ ម៉ោងមុនជើងហោះហើរក្នុងស្រុក ឬ ៣ ម៉ោងមុនជើងហោះហើរអន្តរជាតិ។',
      en:
        'The Airport Companion in the app gives step-by-step guides in Khmer, from check-in to boarding. As a rule, arrive 2 hours before a domestic flight or 3 hours before an international flight.',
    },
  },
  {
    id: 'checklist',
    concepts: ['checklist'],
    searchText: 'checklist am I ready what to pack prepare before I fly',
    answer: {
      km:
        'ប្រើ "Am I Ready?" checklist ក្នុងកម្មវិធី — វាបង្កើតបញ្ជីត្រៀមខ្លួនតាមគោលដៅរបស់អ្នក។ កុំភ្លេចរក្សាទុក passport, boarding pass និង QR eSIM ជាឯកសារ offline មុនពេលហោះ។',
      en:
        'Use the "Am I Ready?" checklist in the app — it builds a personalised pre-trip list for your destination. Don’t forget to save your passport, boarding pass, and eSIM QR offline before you fly.',
    },
  },
  {
    id: 'emergency',
    concepts: ['emergency'],
    searchText: 'emergency phrases how do I say help hospital police doctor ambulance lost',
    answer: {
      km:
        'ផ្នែក Emergency Phrases ក្នុងកម្មវិធីមានឃ្លាធ្វើដំណើរសំខាន់ៗ (ចុចដើម្បីចម្លង) ដែលដំណើរការ offline — មានប្រយោជន៍ពេលអាសន្ន។ ឧទាហរណ៍៖ "សូមជួយខ្ញុំផង", "ខ្ញុំត្រូវការគ្រូពេទ្យ", "សូមហៅឡានពេទ្យ"។ ក្នុងករណីអាសន្នពិត សូមទាក់ទងលេខសង្គ្រោះបន្ទាន់ក្នុងស្រុករបស់ប្រទេសនោះ។',
      en:
        'The Emergency Phrases section has key travel phrases (tap to copy) that work offline — for example "Please help me", "I need a doctor", and "Call an ambulance", each translated into your destination language. In a real emergency, always contact the local emergency number for the country you’re in.',
    },
  },
  {
    id: 'payment',
    concepts: ['payment'],
    searchText: 'how can I pay payment methods card visa mastercard khqr aba stripe checkout',
    answer: {
      km:
        'Domner ទទួលការទូទាត់ជាមួយ កាតអន្តរជាតិ (តាម Stripe) និង KHQR / ABA PayWay សម្រាប់ការបង់ប្រាក់ក្នុងស្រុក។ តម្លៃទាំងអស់បង្ហាញជា USD។',
      en:
        'Domner accepts international cards (via Stripe) and KHQR / ABA PayWay for local Cambodian payment. All prices are shown in USD.',
    },
  },
  {
    id: 'support',
    concepts: ['support'],
    searchText: 'contact support talk to a human agent customer service telegram',
    answer: {
      km: `ក្រុមការងារ Domner ជួយ ២៤/៧ ជាភាសាខ្មែរ។ អ្នកអាចឆ្លើយតបទៅអ៊ីមែលបញ្ជាក់ការបញ្ជាទិញរបស់អ្នក ឬផ្ញើសារមក Telegram៖ ${TELEGRAM}`,
      en: `Domner support is available 24/7 in Khmer. You can reply to your order confirmation email or message us on Telegram: ${TELEGRAM}`,
    },
  },
  {
    id: 'refund',
    concepts: ['refund'],
    searchText: 'refund cancel my order money back change rebook charged twice',
    answer: {
      km: `ខ្ញុំមិនអាចធ្វើការបញ្ជាទិញ, បោះបង់, ឬសងប្រាក់ដោយផ្ទាល់បានទេ។ សម្រាប់រឿងទាំងនេះ សូមទាក់ទងក្រុមការងារ Domner (ឆ្លើយតបអ៊ីមែលបញ្ជាទិញ ឬ Telegram៖ ${TELEGRAM}) ហើយពួកគេនឹងជួយភ្លាមៗ។`,
      en: `I can’t book, cancel, or refund orders myself. For those, please contact Domner support (reply to your order email or Telegram: ${TELEGRAM}) and the team will help you right away.`,
    },
  },
  {
    id: 'products',
    concepts: ['products'],
    searchText: 'what is domner what do you offer services features what can you do',
    answer: {
      km:
        'Domner គឺជាកម្មវិធីធ្វើដំណើរ super app ភាសាខ្មែរដំបូងគេ។ យើងផ្តល់៖ ① eSIM សម្រាប់ ២០+ ប្រទេស, ② Flight Guardian តាមដានជើងហោះហើរផ្ទាល់, ③ Airport Companion មគ្គុទេសក៍ព្រលានយន្តហោះ, ④ "Am I Ready?" checklist, ⑤ ឃ្លាអាសន្ន offline, និង ⑥ ឧបករណ៍រៀបចំដំណើរ។',
      en:
        'Domner is Cambodia’s first Khmer-language travel super app. We offer: ① eSIMs for 20+ countries, ② Flight Guardian live flight tracking, ③ Airport Companion airport guides, ④ the "Am I Ready?" checklist, ⑤ offline emergency phrases, and ⑥ trip-planning tools.',
    },
  },
  {
    id: 'greeting',
    concepts: ['greeting'],
    searchText: 'hello hi hey good morning',
    answer: {
      km:
        'សួស្តី! ខ្ញុំជា Domner Trip Copilot ✦ ជំនួយការធ្វើដំណើររបស់អ្នក។ ខ្ញុំអាចជួយអំពី eSIM, ការតាមដានជើងហោះហើរ, មគ្គុទេសក៍ព្រលានយន្តហោះ និងការរៀបចំដំណើរ។ តើខ្ញុំអាចជួយអ្វីបាន?',
      en:
        "Hi! I'm your Domner Trip Copilot ✦ — your travel assistant. I can help with eSIMs, flight tracking, airport guides, and trip prep. What can I help you with?",
    },
  },
  {
    id: 'thanks',
    concepts: ['thanks'],
    searchText: 'thank you thanks',
    answer: {
      km: 'មិនអីទេ! 😊 ជូនពរដំណើរកម្សាន្តរីករាយ។ បើមានសំណួរអ្វីទៀត សូមសួរបាន។',
      en: "You’re welcome! 😊 Safe travels — ask me anytime if you need anything else.",
    },
  },
];

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Answers generated from the data files. Add a country to data/destinations.ts
 * or a warning to data/scamAlerts.ts and the Copilot can answer about it
 * immediately — nothing in this file needs to change.
 */
function buildDataAnswers(): Passage[] {
  const passages: Passage[] = [];

  // ── One price answer per destination ──
  for (const dest of destinations) {
    const plans = esimPlans.filter((p) => p.countrySlug === dest.slug);
    const en = plans
      .map(
        (p) =>
          `${p.name} ${money(p.priceUsd)} (${p.durationDays} days, ${p.dataGbDaily}GB/day)`,
      )
      .join(', ');
    const km = plans
      .map((p) => `${p.name} ${money(p.priceUsd)} (${p.durationDays} ថ្ងៃ, ${p.dataGbDaily}GB/ថ្ងៃ)`)
      .join(', ');

    passages.push({
      id: `price-${dest.slug}`,
      concepts: ['price', 'data'],
      countrySlug: dest.slug,
      searchText: `${dest.name} ${dest.nameKm} ${dest.slug.replace(/-/g, ' ')} esim price plans`,
      answer: {
        km:
          `${dest.nameKm} ${dest.flag}: ${km}។ បណ្តាញ ${dest.networkTech} (${dest.networks.join(' & ')})។ ` +
          'គ្រប់គម្រោងរួមបញ្ចូល hotspot, ការផ្ញើ QR ភ្លាមៗ និងជំនួយខ្មែរ ២៤/៧។',
        en:
          `${dest.name} ${dest.flag}: ${en}. ${dest.networkTech} on ${dest.networks.join(' & ')}. ` +
          'Every plan includes hotspot, instant QR delivery, and 24/7 Khmer support.',
      },
    });
  }

  // ── Entry rules & cash limits, per country ──
  for (const rule of customsRules) {
    const dest = destinations.find((d) => d.slug === rule.countrySlug);
    if (!dest) continue;
    const detail = `${rule.visaInfo} Maximum stay ${rule.maxStayDays} days. Cash limit $${rule.maxCashUsd.toLocaleString()} USD. ${rule.notes.map((n) => `${n}.`).join(' ')}`;
    passages.push({
      id: `customs-${rule.countrySlug}`,
      concepts: ['visa_entry', 'money'],
      countrySlug: rule.countrySlug,
      searchText: `${dest.name} ${dest.nameKm} visa entry passport stay cash declare customs`,
      answer: {
        km: `ការចូល ${dest.nameKm} ${dest.flag}៖ ${detail}`,
        en: `Entering ${dest.name} ${dest.flag}: ${detail}`,
      },
    });
  }

  // ── Scam warnings, grouped per country ──
  const scamCountries = Array.from(new Set(scamAlerts.map((s) => s.countrySlug)));
  for (const slug of scamCountries) {
    const dest = destinations.find((d) => d.slug === slug);
    const alerts = scamAlerts.filter((s) => s.countrySlug === slug);
    if (!dest || alerts.length === 0) continue;
    const detail = alerts.map((s) => `• ${s.title} (${s.severity} risk) — ${s.description}`).join('\n');
    passages.push({
      id: `scam-${slug}`,
      concepts: ['safety'],
      countrySlug: slug,
      searchText: `${dest.name} ${dest.nameKm} scam safe safety danger cheat tourist trap ${alerts
        .map((s) => s.title)
        .join(' ')}`,
      answer: {
        km: `សូមប្រយ័ត្នការឆបោកនៅ ${dest.nameKm} ${dest.flag}៖\n${detail}`,
        en: `Watch out for these scams in ${dest.name} ${dest.flag}:\n${detail}`,
      },
    });
  }

  // ── Airport walkthroughs ──
  for (const guide of airportGuides) {
    const steps = guide.departureSteps
      .map((s) => `• ${s.title}${s.timing ? ` (${s.timing})` : ''}: ${s.description}`)
      .join('\n');
    passages.push({
      id: `airport-${guide.code}`,
      concepts: ['airport'],
      airportCode: guide.code,
      searchText: `${guide.code} ${guide.name} ${guide.city} ${guide.country} airport terminal check-in departure`,
      answer: {
        km: `${guide.name} (${guide.code}) — ជំហានចេញដំណើរ៖\n${steps}`,
        en: `${guide.name} (${guide.code}) — departure steps:\n${steps}`,
      },
    });
  }

  return passages;
}

/** The full library, built once when the server starts. */
const KNOWLEDGE: Passage[] = [...TOPIC_ANSWERS, ...buildDataAnswers()];

// Pre-compute each answer's searchable pieces and concepts so a question only
// has to be analysed once at request time, not compared against raw text.
interface IndexedPassage {
  passage: Passage;
  tokens: Set<string>;
  concepts: Set<string>;
}

// Both language versions are indexed, so a Khmer question can match on wording
// as well as on concepts — not just the concepts alone.
const INDEX: IndexedPassage[] = KNOWLEDGE.map((passage) => ({
  passage,
  tokens: new Set(
    tokenize(`${passage.searchText} ${passage.answer.en} ${passage.answer.km}`),
  ),
  // Concepts are ONLY the ones declared on the passage. We deliberately do not
  // infer them from the answer's own wording: the phone-compatibility answer
  // contains the word "support", which would wrongly tag it as the "contact
  // support" topic and hijack every help request.
  concepts: new Set(passage.concepts),
}));

/**
 * How informative is each word? A word appearing in almost every answer (like
 * "esim") barely narrows things down; a rare one (like "powerbank") is a strong
 * signal. This is the standard "inverse document frequency" idea.
 */
const IDF = new Map<string, number>();
{
  const docCount = INDEX.length;
  const seenIn = new Map<string, number>();
  for (const entry of INDEX) {
    entry.tokens.forEach((token) => seenIn.set(token, (seenIn.get(token) ?? 0) + 1));
  }
  seenIn.forEach((count, token) => {
    IDF.set(token, Math.log(1 + docCount / count));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE SEARCH ITSELF.
// ─────────────────────────────────────────────────────────────────────────────

/** Weights for the three signals. Concepts matter most — that's the meaning. */
const CONCEPT_WEIGHT = 3.0;
const WORD_WEIGHT = 1.0;
const PLACE_WEIGHT = 2.5;
/** Below this score we say "I don't know" instead of guessing. */
const CONFIDENCE_FLOOR = 1.4;
/**
 * When a question shares NO idea with an answer, any word overlap is probably a
 * coincidence — "what is the capital of Peru" shares the word "capital" with
 * "Capital International Beijing" and means nothing by it. Word-only matches
 * therefore have to clear a much higher bar to be trusted.
 */
const NO_CONCEPT_PENALTY_FLOOR = CONFIDENCE_FLOOR * 2.5;

export interface SearchHit {
  passage: Passage;
  score: number;
  /** How many ideas the question and this answer share. */
  conceptMatches: number;
}

/**
 * searchKnowledge — find the answers that best match a question.
 *
 * `countrySlug` / `airportCode` come from the caller when the traveller named a
 * place, and give matching answers a strong boost so "Thailand scams" beats
 * "Vietnam scams".
 */
export function searchKnowledge(
  question: string,
  options: { countrySlug?: string | null; airportCode?: string | null } = {},
): SearchHit[] {
  const queryTokens = tokenize(question);
  const queryConcepts = conceptsIn(question);
  if (queryTokens.length === 0 && queryConcepts.size === 0) return [];

  const hits: SearchHit[] = [];

  for (const entry of INDEX) {
    let score = 0;
    let conceptMatches = 0;

    // 1. Shared ideas — the meaning layer.
    queryConcepts.forEach((concept) => {
      if (entry.concepts.has(concept)) {
        score += CONCEPT_WEIGHT;
        conceptMatches += 1;
      }
    });

    // 2. Shared informative words.
    let wordScore = 0;
    new Set(queryTokens).forEach((token) => {
      if (entry.tokens.has(token)) wordScore += IDF.get(token) ?? 0;
    });
    // Damp it so a long question can't win on word count alone.
    score += WORD_WEIGHT * Math.sqrt(wordScore);

    // 3. Named place.
    if (options.countrySlug && entry.passage.countrySlug === options.countrySlug) {
      score += PLACE_WEIGHT;
    }
    if (options.airportCode && entry.passage.airportCode === options.airportCode) {
      score += PLACE_WEIGHT;
    }
    // An answer tied to a DIFFERENT country than the one asked about is wrong.
    if (
      options.countrySlug &&
      entry.passage.countrySlug &&
      entry.passage.countrySlug !== options.countrySlug
    ) {
      score -= PLACE_WEIGHT;
    }

    if (score > 0) hits.push({ passage: entry.passage, score, conceptMatches });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * findAnswer — the one-call version: the best answer, or null if nothing in the
 * library is a confident match. Returning null is deliberate: an honest "I
 * don't know, try asking about X" beats a confidently wrong answer.
 */
export function findAnswer(
  question: string,
  lang: Lang,
  options: { countrySlug?: string | null; airportCode?: string | null } = {},
): { text: string; id: string; score: number } | null {
  const [best] = searchKnowledge(question, options);
  if (!best) return null;

  const floor = best.conceptMatches > 0 ? CONFIDENCE_FLOOR : NO_CONCEPT_PENALTY_FLOOR;
  if (best.score < floor) return null;

  return {
    text: lang === 'km' ? best.passage.answer.km : best.passage.answer.en,
    id: best.passage.id,
    score: best.score,
  };
}

/** Exposed for the airport lookup in the engine. */
export function detectAirportCode(text: string): string | null {
  const lower = normalise(text);
  for (const guide of airportGuides) {
    if (
      new RegExp(`\\b${guide.code.toLowerCase()}\\b`).test(lower) ||
      lower.includes(guide.city.toLowerCase())
    ) {
      return guide.code;
    }
  }
  return null;
}
