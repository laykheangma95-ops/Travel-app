// ─────────────────────────────────────────────────────────────────────────────
// Domner AI Chatbot API — POST /api/chat
//
// WHAT THIS IS:
//   The single chatbot endpoint powering the floating "✦" Trip Copilot in the
//   app. It answers using Domner's OWN in-app assistant engine
//   (lib/domnerEngine.ts) — grounded in our real business data (eSIM prices,
//   countries, flight/airport help, policies).
//
// HOW IT ANSWERS (important):
//   The engine runs ENTIRELY on our own server. It does NOT call any outside AI
//   provider (no OpenAI / OpenRouter) and needs NO API key or paid credits.
//   That means it can never fail with a "no credits" / 402 billing error, it
//   always responds instantly, and it can't invent facts outside our catalogue.
//
// SETUP:
//   None. There is nothing to configure and no environment variable to set —
//   it just works, on every deployment, for free.
//
// TRY IT (with the dev server running):
//   curl -s -X POST http://localhost:3000/api/chat \
//     -H 'Content-Type: application/json' \
//     -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { generateReply, type ChatTurn, type ChatContext } from '@/lib/domnerEngine';

// Run on Vercel's Node runtime, and disable caching so every message gets a
// fresh answer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // ── Step 2: Answer with our own engine — no external call, never fails ────
  try {
    const reply = generateReply(turns, body?.context ?? undefined);
    return NextResponse.json({ reply });
  } catch (error) {
    // The engine is designed never to throw, but we guard anyway so the widget
    // always gets a usable, friendly reply instead of a hard error.
    console.error('[chat] engine error:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      reply:
        'ខ្ញុំនៅទីនេះដើម្បីជួយអំពី eSIM, ជើងហោះហើរ និងការធ្វើដំណើររបស់អ្នក។ សូមសាកសួរម្តងទៀត។ ' +
        "(I'm here to help with eSIMs, flights, and your trip — please ask again.)",
    });
  }
}
