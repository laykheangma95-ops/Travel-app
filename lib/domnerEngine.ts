// ─────────────────────────────────────────────────────────────────────────────
// Domner Offline Engine — the Copilot's free, self-hosted brain.
//
// WHAT THIS IS (for beginners):
//   This answers travellers without calling any outside AI service. It is FREE,
//   instant, and can never fail with a "no credits" error — so it is both the
//   everyday brain for common questions and the safety net whenever the Claude
//   layer (lib/domnerAI.ts) is switched off or unreachable.
//
//   It used to match raw keywords, which is why "What can I carry on a flight?"
//   was answered with flight tracking — the word "flight" matched, the meaning
//   did not. The understanding now comes from lib/domnerSearch.ts, which matches
//   IDEAS instead of words, so questions find the right answer even when they
//   use wording nobody wrote down in advance.
//
//   For each message it:
//     1. detects the language (Khmer or English),
//     2. spots any country or airport that was named,
//     3. answers exact price questions straight from the live catalogue,
//     4. otherwise asks the concept search for the best-matching answer,
//     5. and if nothing is a confident match, says so honestly rather than
//        guessing.
//
//   It still cannot REASON — it finds prepared answers, it does not invent new
//   ones. That is what Claude is for. But it now finds the right one far more
//   often, and it does it for free.
//
// HOW TO TEACH IT:
//   New wording, or a whole new topic → lib/domnerSearch.ts.
//   New countries, prices, scams, customs rules, airports → the files in data/;
//   both this engine and Claude pick those up automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { destinations } from '@/data/destinations';
import { esimPlans } from '@/data/esimPlans';
import { airportGuides } from '@/data/airportGuides';
import { DOMNER_FACTS, detectCountry } from '@/lib/domnerBrain';
import {
  findAnswer,
  detectLang,
  detectAirportCode,
  type Lang,
} from '@/lib/domnerSearch';

// ── Conversation shapes (must match app/api/chat/route.ts) ───────────────────
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface ChatContext {
  flightNumber?: string | null;
  flightSummary?: string | null;
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

// Words that mean "how much does it cost". Kept here (rather than in the concept
// search) because an explicit price question about a named country gets an exact
// generated price line, not a prepared answer.
const PRICE_KEYWORDS = [
  'price', 'cost', 'how much', 'how many gb', 'plan', 'buy esim', 'esim for',
  'តម្លៃ', 'ថ្លៃ', 'ប៉ុន្មាន', 'ទិញ',
];

function mentionsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => k.trim() && lower.includes(k.toLowerCase()));
}

// ── The fallback answer (when nothing is a confident match) ──────────────────
function fallback(lang: Lang): string {
  return lang === 'km'
    ? 'ខ្ញុំនៅទីនេះដើម្បីជួយអំពីការធ្វើដំណើរ និង Domner។ សូមសាកសួរអំពី៖ eSIM និងតម្លៃ, ការតាមដានជើងហោះហើរ, មគ្គុទេសក៍ព្រលានយន្តហោះ, អ្វីដែលអាចយកឡើងយន្តហោះ, ការចូលប្រទេស, ការប្រយ័ត្នការឆបោក, ការទូទាត់ ឬការទាក់ទងជំនួយ។ តើខ្ញុំអាចជួយអ្វី?'
    : "I'm here to help with your trip and Domner. Try asking about: eSIMs & prices, flight tracking, airport guides, what you can carry on a flight, entry rules, scams to avoid, payments, or contacting support. What do you need?";
}

// ── Main entry point ─────────────────────────────────────────────────────────
/**
 * generateReply — produce an answer for a conversation, with no external calls.
 *
 * Never throws and never touches the network, which is what makes it a safe
 * last resort when the Claude layer is unavailable.
 */
export function generateReply(turns: ChatTurn[], context?: ChatContext): string {
  const lastUser = [...turns].reverse().find((t) => t.role === 'user');
  const text = (lastUser?.content ?? '').trim();
  const lang = detectLang(text);

  if (!text) return fallback(lang);

  // Look at the last couple of traveller messages so a follow-up like "how much?"
  // still knows which country the conversation is about.
  const recentUserText = turns
    .filter((t) => t.role === 'user')
    .slice(-2)
    .map((t) => t.content)
    .join(' ');

  const airportCode = detectAirportCode(text);
  // Naming an airport or city implies its country: someone asking about Bangkok
  // is asking about Thailand, even if they never type the word.
  const airportCountry = airportCode
    ? (destinations.find((d) => {
        const guide = airportGuides.find((g) => g.code === airportCode);
        return guide ? d.name.toLowerCase() === guide.country.toLowerCase() : false;
      })?.slug ?? null)
    : null;

  const country =
    detectCountry(text) ?? airportCountry ?? detectCountry(recentUserText);
  const askedPrice = mentionsAny(text, PRICE_KEYWORDS);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const priceTail =
    lang === 'km'
      ? ' គ្រប់គម្រោងរួមបញ្ចូល hotspot, ការផ្ញើ QR ភ្លាមៗ និងជំនួយខ្មែរ ២៤/៧។ ទិញបាននៅ eSIM store ក្នុងកម្មវិធី។'
      : ' Every plan includes hotspot, instant QR delivery, and 24/7 Khmer support. Buy it in the eSIM store in the app.';

  // 1) Ask the concept search what this question is actually about. It decides
  //    the topic, so "how much cash can I bring to Japan" lands on entry rules
  //    rather than on eSIM prices just because it contains "how much".
  const hit = findAnswer(text, lang, { countrySlug: country, airportCode });

  // 2) If it IS a price question about a specific country, answer with an exact
  //    price line generated live from the catalogue, so it is never out of date.
  if (country && (hit?.id.startsWith('price-') || (askedPrice && !hit))) {
    const line = countryPriceLine(country, lang);
    if (line) return line + priceTail;
  }

  // 3) Otherwise use the best answer the search found.
  if (hit) {
    let reply = hit.text;
    // If they asked about flights and we know which flight they're viewing,
    // add it — that context comes from our own live tracker.
    if (hit.id === 'flight_status' && context?.flightSummary) {
      reply +=
        lang === 'km'
          ? `\n\nជើងហោះហើរបច្ចុប្បន្នរបស់អ្នក៖ ${context.flightSummary}`
          : `\n\nYour current flight: ${context.flightSummary}`;
    }
    return reply;
  }

  // 4) They named a country and little else → show that country's live prices.
  if (country && wordCount <= 3) {
    const line = countryPriceLine(country, lang);
    if (line) return line + priceTail;
  }

  // 5) General price question with no country → popular starting prices.
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

  // 6) Nothing confident → say so, and point at what we do know.
  return fallback(lang);
}
