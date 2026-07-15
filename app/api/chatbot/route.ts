// ─────────────────────────────────────────────────────────────────────────────
// Domner Chatbot API — POST /api/chatbot   (DROP-IN, SELF-CONTAINED)
//
// WHAT THIS IS:
//   A single, self-contained AI chatbot endpoint you can drop into ANY Vercel
//   project. Unlike app/api/chat/route.ts (which imports the "brain" from
//   lib/domnerBrain.ts), everything this endpoint needs — the full business
//   knowledge, the demo fallback, the AI call — lives in THIS ONE FILE. Copy it
//   to `app/api/chatbot/route.ts` in any Next.js App-Router project on Vercel
//   and it works. The only dependency is the Anthropic SDK.
//
// DEPLOY ON VERCEL (2 minutes):
//   1. Make sure `@anthropic-ai/sdk` is installed:  npm i @anthropic-ai/sdk
//   2. Vercel → Project → Settings → Environment Variables → add
//        ANTHROPIC_API_KEY = sk-ant-...           (get it at console.anthropic.com)
//      Tip: set a monthly spend cap on the key first.
//   3. Redeploy. Without the key it still runs in a friendly "demo mode".
//
// TRY IT:
//   curl -s -X POST https://YOUR-APP.vercel.app/api/chatbot \
//     -H 'Content-Type: application/json' \
//     -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
//
// RESPONSE:  { "reply": "...", "demo": true|false }
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Run on Vercel's Edge-free Node runtime. `dynamic` disables caching so every
// message gets a fresh answer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fast + cheap model, ideal for a high-volume support chatbot. Swap to
// 'claude-opus-4-8' for higher-quality (pricier) answers — that's the only
// line you need to change.
const MODEL = 'claude-haiku-4-5';

// ── The business "brain" ─────────────────────────────────────────────────────
// Everything the AI needs to know about the business, embedded so this file is
// truly self-contained. Edit the plain-English text below to teach the bot new
// facts — no AI knowledge required. Keep the STRICT RULES section strong; it is
// what stops the AI from inventing prices or flight details.
const SYSTEM_PROMPT = `
ABOUT DOMNER
- Domner is Cambodia's first Khmer-language travel super app — a premium, trusted
  "personal travel agent" for the Cambodian traveller (and for visitors arriving
  in Cambodia). Tagline: "Travel Confidently. Stay Connected."
- Positioning: NOT a cheap marketplace. Domner wins on trust and convenience — it
  travels WITH the customer from booking to landing, and it just works.
- Everything is available in Khmer, with 24/7 Khmer support.

WHAT DOMNER OFFERS
1. eSIM store — instant mobile data for 20+ countries.
2. Flight Guardian — live flight tracking with real-time alerts for gate changes,
   delays, boarding, and landing.
3. Airport Companion — step-by-step airport guides (check-in to boarding) in Khmer,
   plus official digital terminal maps for major airports.
4. "Am I Ready?" checklist — a personalised pre-trip checklist per destination.
5. Emergency phrases — tap-to-copy travel phrases that work offline.
6. Trip tools — trip planner, arrival experience, and trip memories.

eSIM SETUP & USAGE (state these exactly)
- After purchase, the eSIM QR code is emailed, normally within 15 minutes. If it
  hasn't arrived, tell the traveller to check spam, then contact support.
- INSTALL the eSIM BEFORE flying (installing needs Wi-Fi/internet), but only TURN
  IT ON after landing at the destination — so no data is wasted.
- Install steps: Settings → Mobile/Cellular → Add eSIM / Add data plan → scan the
  QR code from the Domner email.
- eSIM needs an eSIM-capable phone: iPhone XS and newer, Google Pixel 3 and newer,
  and recent Samsung Galaxy S/Note/Z. Older phones may not support it.
- Every plan includes hotspot/tethering, instant QR delivery, and 24/7 Khmer
  support. The China eSIM needs NO VPN — Google, WhatsApp, etc. work normally.
- Plans come in 3 tiers: Basic (3 days, 1GB/day), Standard (7 days, 2GB/day — most
  popular), Premium (15 days, 3GB/day). All prices are in USD.

PAYMENTS & SUPPORT
- Payment methods: international cards (via Stripe) and KHQR / ABA PayWay for local
  Cambodian payment. All prices are shown in USD.
- Support is 24/7 in Khmer. Travellers can reply to their order confirmation email
  or message Domner on Telegram (t.me/domnerapp).

GENERAL TRAVEL GUIDANCE
- Arrive at the airport at least 2 hours before a domestic flight, or 3 hours
  before an international flight.
- Keep your passport, boarding pass, and eSIM QR saved offline before you fly.

HOW TO RESPOND
- You are the "Domner Trip Copilot" — warm, concise, and practical, like a
  knowledgeable Cambodian friend who travels a lot.
- Reply PRIMARILY in Khmer (ភាសាខ្មែរ). If the traveller writes in English, reply
  in English. Match the traveller's language.
- Keep answers short and useful — usually 2 to 4 sentences. No walls of text.
- Be encouraging and reassuring; travelling abroad can be stressful.

STRICT RULES (never break these)
- NEVER invent specific gate numbers, delay times, or flight statuses. If asked,
  tell the traveller to check the live flight tracker in the app.
- NEVER make up eSIM prices or country details. Quote the tier structure above; for
  exact per-country prices, tell them to check the eSIM store in the app.
- You CANNOT book, cancel, modify, or refund tickets or eSIM orders. For those,
  direct the traveller to Domner support (order email reply or Telegram).
- Only answer travel and Domner-related questions. Politely redirect anything
  off-topic back to how you can help with their trip.
- Never ask for or store passwords, card numbers, or full passport numbers.
`.trim();

// One turn in the conversation: who spoke and what they said.
interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// A canned reply used when no API key is set (demo mode) or when the AI call
// fails — so the chatbot always answers something helpful.
function demoReply(turns: ChatTurn[]): string {
  const last = turns[turns.length - 1]?.content ?? '';
  const wroteInKhmer = /[ក-៿]/.test(last); // any Khmer character?
  if (wroteInKhmer) {
    return 'សួស្តី! ខ្ញុំជាជំនួយការ Domner។ ដើម្បីទទួលបានចម្លើយ AI ពិតប្រាកដ សូមបញ្ចូល ANTHROPIC_API_KEY។ ជាទូទៅ៖ ដំឡើង eSIM មុនពេលហោះហើរ ហើយបើកវានៅពេលចុះចតដល់គោលដៅ។';
  }
  return "Hi! I'm the Domner assistant. Add an ANTHROPIC_API_KEY to unlock live AI answers. In the meantime: install your eSIM before you fly, and switch it on only after you land at your destination.";
}

export async function POST(request: Request) {
  // ── Step 1: read + validate the incoming conversation ──────────────────────
  const body = (await request.json().catch(() => null)) as { messages?: ChatTurn[] } | null;
  const turns = (body?.messages ?? [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && m?.content?.trim())
    .slice(-20); // cap history so a runaway client can't blow up the token bill

  if (turns.length === 0) {
    return NextResponse.json({ error: 'Please send at least one message.' }, { status: 400 });
  }

  // ── Step 2: no API key → demo mode ─────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: demoReply(turns), demo: true });
  }

  // ── Step 3: ask Claude for a real answer ───────────────────────────────────
  try {
    const claude = new Anthropic({ apiKey });
    const message = await claude.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    });

    const reply = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    // ── Step 4: send it back ─────────────────────────────────────────────────
    return NextResponse.json({ reply: reply || demoReply(turns), demo: false });
  } catch (error) {
    // Bad key, no credits, network blip — log it for us, still answer the user.
    console.error('[chatbot] AI call failed, serving demo reply:', error instanceof Error ? error.message : error);
    return NextResponse.json({ reply: demoReply(turns), demo: true });
  }
}
