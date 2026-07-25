// ─────────────────────────────────────────────────────────────────────────────
// Domner AI "Brain" — everything the chatbot knows about the business.
//
// WHAT THIS FILE IS (for beginners):
//   An AI chatbot is just a large language model (Claude) that predicts helpful
//   text. On its own it knows general world facts but NOTHING about *your*
//   business. The "brain" below is a big, well-organized block of text we send
//   to Claude on every message (called the "system prompt"). It teaches Claude
//   to answer as Domner's own travel agent — grounded in real products, prices,
//   and policies — instead of guessing.
//
//   Think of it like the training manual you'd give a new human support agent
//   on their first day. The better the manual, the better the answers.
//
// HOW IT'S USED:
//   `lib/domnerAI.ts` (behind the floating "✦" Trip Copilot) sends this to
//   Claude in two layers on every message:
//     1. DOMNER_SYSTEM_PROMPT — the always-on manual. Identical every time, so
//        Claude caches it and we are billed a fraction of the price to re-read
//        it. This is why the manual can afford to be long.
//     2. buildTripBriefing() — the "look it up" layer. It reads the
//        conversation, spots which countries and airports it is actually about,
//        and attaches only those customs rules, scam warnings, phrase lists,
//        and airport walkthroughs. Deep knowledge, without paying to send the
//        whole library every time.
//
// HOW TO EDIT:
//   Just edit the plain-English text in the sections below. No AI knowledge
//   needed. The eSIM catalogue section is generated automatically from
//   data/destinations.ts + data/esimPlans.ts, so prices/countries stay correct
//   without you touching this file.
// ─────────────────────────────────────────────────────────────────────────────

import { destinations } from '@/data/destinations';
import { esimPlans } from '@/data/esimPlans';
import { customsRules } from '@/data/customsRules';
import { scamAlerts } from '@/data/scamAlerts';
import { airportGuides } from '@/data/airportGuides';
import { phraseLanguages } from '@/data/emergencyPhrases';

// ── 1. Who Domner is ─────────────────────────────────────────────────────────
// The identity and mission. Keep this short and true — it sets the AI's "self".
const IDENTITY = `
ABOUT DOMNER
- Domner is Cambodia's first Khmer-language travel super app — a premium, trusted
  "personal travel agent" for the Cambodian traveller (and for visitors arriving
  in Cambodia). Tagline: "Travel Confidently. Stay Connected."
- Positioning: NOT a cheap marketplace. Domner wins on trust and convenience —
  it travels WITH the customer from booking to landing, and it just works.
- Everything is available in Khmer, with 24/7 Khmer support.
`.trim();

// ── 2. What Domner sells / does ──────────────────────────────────────────────
// The product surface. Written as facts the AI may state confidently.
const PRODUCTS = `
WHAT DOMNER OFFERS
1. eSIM store — instant mobile data for 20+ countries (full catalogue below).
2. Flight Guardian — live flight tracking with real-time alerts for gate
   changes, delays, boarding, and landing.
3. Airport Companion — step-by-step airport guides (check-in to boarding) in Khmer.
4. "Am I Ready?" checklist — a personalised pre-trip checklist per destination.
5. Emergency phrases — tap-to-copy travel phrases that work offline.
6. Trip tools — trip planner, arrival experience, and trip memories.
`.trim();

// ── 3. eSIM setup rules the AI must get right ────────────────────────────────
const ESIM_HOWTO = `
eSIM SETUP & USAGE (state these exactly)
- After purchase, the eSIM QR code is emailed, normally within 15 minutes.
  If it hasn't arrived, tell the traveller to check spam, then contact support.
- INSTALL the eSIM BEFORE flying (installing needs Wi-Fi/internet), but only
  TURN IT ON after landing at the destination — so no data is wasted.
- Install steps: Settings → Mobile/Cellular → Add eSIM / Add data plan →
  scan the QR code from the Domner email.
- eSIM needs an eSIM-capable phone: iPhone XS and newer, Google Pixel 3 and
  newer, and recent Samsung Galaxy S/Note/Z. Older phones may not support it.
- Every plan includes hotspot/tethering, instant QR delivery, and 24/7 Khmer
  support. The China eSIM needs NO VPN — Google, WhatsApp, etc. work normally.
`.trim();

// ── 4. Payments & support policies ───────────────────────────────────────────
const POLICIES = `
PAYMENTS & SUPPORT
- Payment methods: international cards (via Stripe) and KHQR / ABA PayWay for
  local Cambodian payment. All prices are shown in USD.
- Support is 24/7 in Khmer. Travellers can reply to their order confirmation
  email or message Domner on Telegram (t.me/domnerapp).
`.trim();

// ── 5. General travel guidance the AI can offer ──────────────────────────────
const TRAVEL_TIPS = `
GENERAL TRAVEL GUIDANCE
- Arrive at the airport at least 2 hours before a domestic flight, or 3 hours
  before an international flight.
- Keep your passport, boarding pass, and eSIM QR saved offline before you fly.
`.trim();

// ── 5b. Airport security & baggage basics ────────────────────────────────────
// These are the questions travellers ask most before a first flight ("what can
// I carry on?"), so the answers live in the always-on brain rather than being
// looked up per country.
const AIRPORT_SECURITY = `
AIRPORT SECURITY & WHAT YOU CAN CARRY
- Carry-on liquids must be in containers of 100ml or less, all together in one
  clear resealable plastic bag. Bigger bottles go in checked baggage.
- At the security scanner, take out your laptop and tablet, and remove your
  belt, jacket, and (at many airports) your shoes.
- Power banks and spare lithium batteries must be in CARRY-ON only — never in
  checked baggage. Most airlines allow up to 100Wh (about 20,000mAh).
- Never carry: knives or blades, lighters with fuel, fireworks, or anything
  sharp in your carry-on. Put them in checked baggage or leave them behind.
- Medication is fine — keep it in its original labelled packaging, and carry a
  prescription or doctor's note for anything unusual.
- Duty-free liquids bought after security are allowed, in the sealed bag with
  the receipt visible. Don't open the bag until you reach your final stop.
- Baggage allowance is set by the AIRLINE, not by Domner, and differs per
  ticket — tell the traveller to check their booking confirmation.
`.trim();

// ── 6. Persona & tone ────────────────────────────────────────────────────────
// How the AI should sound. This shapes the *voice*, not the facts.
const PERSONA = `
HOW TO RESPOND
- You are the "Domner Trip Copilot" — warm, concise, and practical, like a
  knowledgeable Cambodian friend who travels a lot.
- Reply PRIMARILY in Khmer (ភាសាខ្មែរ). If the traveller writes in English,
  reply in English. Match the traveller's language.
- Keep answers short and useful — usually 2 to 4 sentences. No walls of text.
- Be encouraging and reassuring; travelling abroad can be stressful.
`.trim();

// ── 7. Guardrails (the "never do this" list) ─────────────────────────────────
// The most important section for TRUST. The AI must not invent facts or take
// actions it cannot actually perform.
const GUARDRAILS = `
STRICT RULES (never break these)
- NEVER invent specific gate numbers, delay times, or flight statuses. If asked,
  tell the traveller to check the live flight tracker in the app.
- NEVER make up eSIM prices or country details that aren't in the catalogue
  below — if unsure, tell them to check the eSIM store in the app.
- You CANNOT book, cancel, modify, or refund tickets or eSIM orders. For those,
  direct the traveller to Domner support (order email reply or Telegram).
- Only answer travel and Domner-related questions. Politely redirect anything
  off-topic back to how you can help with their trip.
- Never ask for or store passwords, card numbers, or full passport numbers.
`.trim();

/**
 * Builds the eSIM catalogue text straight from the app's real data files, so
 * the AI always quotes correct, up-to-date countries and prices. If you add a
 * country or change a price in data/destinations.ts, this updates automatically.
 */
function buildEsimCatalogue(): string {
  // Standard tier is the "most popular" plan — a good representative price.
  const priceFor = (slug: string, tier: 'basic' | 'standard') =>
    esimPlans.find((p) => p.countrySlug === slug && p.tier === tier)?.priceUsd;

  const lines = destinations.map((d) => {
    const basic = priceFor(d.slug, 'basic');
    const standard = priceFor(d.slug, 'standard');
    const priceNote =
      basic != null && standard != null
        ? `from $${basic.toFixed(2)} (Basic) / $${standard.toFixed(2)} (Standard, most popular)`
        : `from $${d.fromPriceUsd.toFixed(2)}`;
    return `- ${d.name} (${d.nameKm}) ${d.flag}: ${priceNote}, ${d.networkTech} on ${d.networks.join(' & ')}`;
  });

  return [
    'eSIM CATALOGUE (real prices — quote these, do not invent others)',
    'Every country has 3 tiers: Basic (3 days, 1GB/day), Standard (7 days,',
    '2GB/day — most popular), Premium (15 days, 3GB/day).',
    ...lines,
  ].join('\n');
}

/**
 * The core emergency phrases, in English + Khmer. These pairs are the same for
 * every destination language, so they belong in the always-on brain. The
 * destination-language translations are added per conversation instead (see
 * buildTripBriefing), which keeps the always-on part small and cheap.
 */
function buildCorePhrases(): string {
  const reference = phraseLanguages[0];
  if (!reference) return '';

  const lines = reference.categories.map((cat) => {
    const phrases = cat.phrases.map((p) => `    • ${p.en} — ${p.km}`).join('\n');
    return `  ${cat.title} (${cat.titleKm}):\n${phrases}`;
  });

  return [
    'EMERGENCY PHRASES (English — Khmer). The app translates these into the',
    `language of the destination. Languages available: ${phraseLanguages
      .map((l) => l.name)
      .join(', ')}.`,
    ...lines,
  ].join('\n');
}

/**
 * A one-line index of the airport guides we have. The AI needs to know WHICH
 * airports it can speak about; the step-by-step detail for a specific airport
 * is attached per conversation, only when that airport comes up.
 */
function buildAirportIndex(): string {
  const list = airportGuides
    .map((g) => `${g.code} (${g.city}, ${g.country} ${g.flag})`)
    .join(', ');
  return [
    'AIRPORT GUIDES AVAILABLE (step-by-step, in the app under Airport Companion)',
    list,
    'If asked about an airport not in this list, give general advice and say the',
    'detailed guide is not in the app yet.',
  ].join('\n');
}

// ── Country detection (shared with the offline engine) ───────────────────────
// Common short names / nicknames travellers use → destination slug. This lets
// "korea", "uk", "dubai", etc. resolve to the right catalogue entry.
export const COUNTRY_ALIASES: Record<string, string> = {
  korea: 'south-korea',
  's korea': 'south-korea',
  uk: 'united-kingdom',
  england: 'united-kingdom',
  britain: 'united-kingdom',
  'great britain': 'united-kingdom',
  america: 'usa',
  'united states': 'usa',
  us: 'usa',
  dubai: 'uae',
  'abu dhabi': 'uae',
  emirates: 'uae',
  hongkong: 'hong-kong',
  aussie: 'australia',
  filipino: 'philippines',
};

/**
 * detectCountry — find which destination (if any) a message mentions, by
 * English name, Khmer name, slug, or a common nickname. Returns the slug or
 * null. Used by both the AI (to attach the right briefing) and the offline
 * engine (to quote the right prices).
 */
export function detectCountry(text: string): string | null {
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
  // Fall back to nickname matching, longest alias first so "s korea" beats "us".
  for (const alias of Object.keys(COUNTRY_ALIASES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) return COUNTRY_ALIASES[alias];
  }
  return null;
}

/** Every destination mentioned anywhere in the text, not just the first one. */
function detectCountries(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const d of destinations) {
    const slugWord = d.slug.replace(/-/g, ' ');
    if (
      lower.includes(d.name.toLowerCase()) ||
      lower.includes(slugWord) ||
      text.includes(d.nameKm)
    ) {
      found.add(d.slug);
    }
  }
  for (const [alias, slug] of Object.entries(COUNTRY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) found.add(slug);
  }
  return Array.from(found);
}

/** Airport guides whose code or city the traveller mentioned (e.g. "PNH", "Bangkok"). */
function detectAirports(text: string) {
  const lower = text.toLowerCase();
  return airportGuides.filter(
    (g) =>
      new RegExp(`\\b${g.code.toLowerCase()}\\b`).test(lower) ||
      lower.includes(g.city.toLowerCase()),
  );
}

function renderCountryBriefing(slug: string): string | null {
  const dest = destinations.find((d) => d.slug === slug);
  if (!dest) return null;

  const sections: string[] = [`### ${dest.name} (${dest.nameKm}) ${dest.flag}`];

  const plans = esimPlans.filter((p) => p.countrySlug === slug);
  if (plans.length) {
    sections.push(
      'eSIM plans: ' +
        plans
          .map(
            (p) =>
              `${p.name} $${p.priceUsd.toFixed(2)} (${p.durationDays} days, ${p.dataGbDaily}GB/day, ${p.network})`,
          )
          .join('; '),
    );
  }

  sections.push(
    `Money: local currency ${dest.currency}, about ${dest.usdRate} per 1 USD. ` +
      `Network quality ${dest.networkQuality} on ${dest.networks.join(' & ')}.`,
  );

  const customs = customsRules.find((c) => c.countrySlug === slug);
  if (customs) {
    sections.push(
      `Entry & customs: ${customs.visaInfo} Max stay ${customs.maxStayDays} days. ` +
        `Cash limit $${customs.maxCashUsd.toLocaleString()} USD. ` +
        customs.notes.map((n) => `${n}.`).join(' '),
    );
  }

  const scams = scamAlerts.filter((s) => s.countrySlug === slug);
  if (scams.length) {
    sections.push(
      'Known scams to warn about:\n' +
        scams.map((s) => `  • [${s.severity}] ${s.title} — ${s.description}`).join('\n'),
    );
  }

  // The destination's own language phrases, if the app carries that language.
  const language = phraseLanguages.find(
    (l) => l.name.toLowerCase() === dest.name.toLowerCase() || l.flag === dest.flag,
  );
  if (language) {
    const phrases = language.categories
      .flatMap((c) => c.phrases)
      .map((p) => `  • ${p.en} → ${p.translation}`)
      .join('\n');
    sections.push(`Useful ${language.name} phrases:\n${phrases}`);
  }

  return sections.join('\n');
}

function renderAirportBriefing(code: string): string | null {
  const guide = airportGuides.find((g) => g.code === code);
  if (!guide) return null;

  const step = (s: { title: string; timing?: string; description: string; watchOut?: string }) =>
    `  ${s.title}${s.timing ? ` (${s.timing})` : ''}: ${s.description}` +
    (s.watchOut ? ` WATCH OUT: ${s.watchOut}` : '');

  return [
    `### ${guide.code} — ${guide.name}, ${guide.city} ${guide.flag}`,
    'Departure steps:',
    ...guide.departureSteps.map(step),
    'Arrival steps:',
    ...guide.arrivalSteps.map(step),
    guide.digitalMapUrl ? `Terminal map: ${guide.digitalMapUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * buildTripBriefing — the "look it up when it's asked about" layer.
 *
 * WHY THIS EXISTS (for beginners):
 *   We could send the AI every airport guide, every customs rule, and every
 *   phrase list on every single message — but that is a lot of text to send
 *   thousands of times a day, and we pay per word sent. Instead we read the
 *   conversation, notice which countries and airports it is actually about, and
 *   attach only those details. The traveller gets a deeply-informed answer; we
 *   only pay for the pages that were actually needed.
 *
 * Returns null when the conversation doesn't mention anything we have on file —
 * in that case the always-on brain above is enough.
 */
export function buildTripBriefing(conversationText: string): string | null {
  const airports = detectAirports(conversationText).slice(0, 2);

  // Naming an airport or city implies its country. Someone asking about Bangkok
  // still needs Thailand's scam warnings and entry rules, even if they never
  // typed the word "Thailand".
  const countrySlugs = new Set(detectCountries(conversationText));
  for (const airport of airports) {
    const dest = destinations.find(
      (d) => d.name.toLowerCase() === airport.country.toLowerCase(),
    );
    if (dest) countrySlugs.add(dest.slug);
  }

  const countries = Array.from(countrySlugs).slice(0, 3);
  if (countries.length === 0 && airports.length === 0) return null;

  const blocks = [
    ...countries.map(renderCountryBriefing),
    ...airports.map((a) => renderAirportBriefing(a.code)),
  ].filter((b): b is string => Boolean(b));

  if (blocks.length === 0) return null;

  return [
    'TRIP BRIEFING — verified Domner data for what this traveller is asking',
    'about. Prefer these exact figures over anything you remember.',
    '',
    ...blocks,
  ].join('\n');
}

/**
 * DOMNER_SYSTEM_PROMPT — the full "brain" as one text block.
 *
 * This is what you pass to Claude as the `system` field. It is assembled from
 * the sections above in a deliberate order: who we are → what we sell → how it
 * works → policies → tips → the live catalogue → persona → guardrails. The
 * guardrails come last so they are the freshest instruction in the AI's memory.
 */
export const DOMNER_SYSTEM_PROMPT = [
  IDENTITY,
  PRODUCTS,
  ESIM_HOWTO,
  POLICIES,
  TRAVEL_TIPS,
  AIRPORT_SECURITY,
  buildEsimCatalogue(),
  buildAirportIndex(),
  buildCorePhrases(),
  PERSONA,
  GUARDRAILS,
].join('\n\n');

/**
 * A small structured snapshot of the business, handy if you ever want to show
 * facts in the UI or feed them to other code (not just the AI). Kept in sync
 * with the same data files as the prompt above.
 */
export const DOMNER_FACTS = {
  brand: 'Domner',
  tagline: 'Travel Confidently. Stay Connected.',
  supportTelegram: 'https://t.me/domnerapp',
  countryCount: destinations.length,
  fromPriceUsd: Math.min(...destinations.map((d) => d.fromPriceUsd)),
  planTiers: ['Basic (3 days, 1GB/day)', 'Standard (7 days, 2GB/day)', 'Premium (15 days, 3GB/day)'],
  paymentMethods: ['International cards (Stripe)', 'KHQR / ABA PayWay'],
} as const;
