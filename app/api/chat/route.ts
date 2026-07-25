// ─────────────────────────────────────────────────────────────────────────────
// Domner AI Chatbot API — POST /api/chat
//
// WHAT THIS IS:
//   The single chatbot endpoint powering the floating "✦" Trip Copilot in the
//   app. It answers in two ways, and always tries the smarter one first:
//
//     1. CLAUDE (lib/domnerAI.ts) — a real AI model that can reason about the
//        traveller's actual situation, in Khmer or English. It is grounded in
//        Domner's own data (lib/domnerBrain.ts): real eSIM prices, customs
//        rules, scam warnings, airport walkthroughs, emergency phrases. Active
//        whenever ANTHROPIC_API_KEY is set.
//
//     2. THE OFFLINE ENGINE (lib/domnerEngine.ts) — our own keyword matcher,
//        running on our server with no API key and no cost. It handles the
//        common questions with pre-written, always-correct answers.
//
//   Claude is tried first. If no key is configured, or the request fails, or
//   credit runs out, we silently fall back to the offline engine. That means
//   this endpoint can never return a "no credits" error and never leaves the
//   traveller without an answer — it just gets less clever for a moment.
//
// SETUP:
//   Optional. Set ANTHROPIC_API_KEY (see .env.example) to switch the smart
//   Copilot on. With no key, the app behaves exactly as it did before.
//
// TRY IT (with the dev server running):
//   curl -s -X POST http://localhost:3000/api/chat \
//     -H 'Content-Type: application/json' \
//     -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { generateReply, type ChatTurn, type ChatContext } from '@/lib/domnerEngine';
import { generateAIReply } from '@/lib/domnerAI';

// Run on Vercel's Node runtime, and disable caching so every message gets a
// fresh answer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Claude may think before answering, so give the request room to finish before
// Vercel cuts the function off. The AI client gives up well before this.
export const maxDuration = 30;

export async function POST(request: Request) {
  // ── Step 1: Read and validate the incoming conversation ──────────────────
  // We defend against bad input so the endpoint never crashes.
  const body = (await request.json().catch(() => null)) as {
    messages?: ChatTurn[];
    context?: ChatContext;
  } | null;

  const turns: ChatTurn[] = (body?.messages ?? [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && m?.content?.trim())
    .slice(-20); // cap history so a runaway client can't blow up memory

  if (turns.length === 0) {
    return NextResponse.json({ error: 'Please send at least one message.' }, { status: 400 });
  }

  const context = body?.context ?? undefined;

  // ── Step 2: Ask Claude first — the reasoning answer ───────────────────────
  // Returns null (never throws) if the AI is off or unavailable.
  const aiReply = await generateAIReply(turns, context);
  if (aiReply) {
    return NextResponse.json({ reply: aiReply, engine: 'claude' });
  }

  // ── Step 3: Fall back to our own engine — instant, free, never fails ──────
  try {
    const reply = generateReply(turns, context);
    return NextResponse.json({ reply, engine: 'offline' });
  } catch (error) {
    // The engine is designed never to throw, but we guard anyway so the widget
    // always gets a usable, friendly reply instead of a hard error.
    console.error('[chat] engine error:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      reply:
        'ខ្ញុំនៅទីនេះដើម្បីជួយអំពី eSIM, ជើងហោះហើរ និងការធ្វើដំណើររបស់អ្នក។ សូមសាកសួរម្តងទៀត។ ' +
        "(I'm here to help with eSIMs, flights, and your trip — please ask again.)",
      engine: 'offline',
    });
  }
}
