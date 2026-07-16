// ─────────────────────────────────────────────────────────────────────────────
// Domner AI Chatbot API — POST /api/chat
//
// WHAT THIS IS:
//   The single chatbot endpoint powering the floating "✦" Trip Copilot in the
//   app. It answers using the Domner "brain" (lib/domnerBrain.ts) — one shared
//   block of business knowledge that auto-syncs eSIM prices/countries from the
//   data files, so answers stay correct without editing this route.
//
// HOW IT ANSWERS:
//   It calls Claude through OpenRouter (openrouter.ai) using the brain as the
//   system prompt. There is NO demo/canned mode — if the AI can't be reached the
//   endpoint returns a clear error so the problem is visible, never hidden.
//
// SETUP ON VERCEL (required for the chatbot to answer):
//   Project → Settings → Environment Variables → add OPENROUTER_API_KEY
//   (sk-or-v1-...) for the Production environment → Redeploy.
//
// TRY IT (with the dev server running):
//   curl -s -X POST http://localhost:3000/api/chat \
//     -H 'Content-Type: application/json' \
//     -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { DOMNER_SYSTEM_PROMPT } from '@/lib/domnerBrain';

// Run on Vercel's Node runtime, and disable caching so every message gets a
// fresh answer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The model to use. Haiku is Anthropic's fastest + cheapest model, which suits a
// high-volume support chatbot (this matches Domner's cost strategy). Browse
// other names at openrouter.ai/models — they all work with the same key.
const OPENROUTER_MODEL = 'anthropic/claude-haiku-4.5';

// One "turn" in the conversation: who spoke ('user' = the traveller,
// 'assistant' = the AI) and what they said.
interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Optional live context about the flight the traveller is currently viewing, so
// the AI can reference it. The app fills this in on flight-detail pages.
interface ChatContext {
  flightNumber?: string | null;
  flightSummary?: string | null;
}

// Ask Claude through OpenRouter (OpenAI-compatible chat/completions endpoint).
// Throws on any failure so the caller can surface a clear error.
async function askOpenRouter(
  apiKey: string,
  system: string,
  turns: ChatTurn[],
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Optional OpenRouter attribution headers — show up in their dashboard.
      'HTTP-Referer': 'https://domnerapp.com',
      'X-Title': 'Domner Trip Copilot',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 1024, // a chat reply is short; this caps the length
      messages: [
        { role: 'system', content: system },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!reply) throw new Error('OpenRouter returned an empty reply.');
  return reply;
}

export async function POST(request: Request) {
  // ── Step 1: Read and validate the incoming conversation ──────────────────
  // We defend against bad input so the endpoint never crashes.
  const body = (await request.json().catch(() => null)) as {
    messages?: ChatTurn[];
    context?: ChatContext;
  } | null;
  const turns = (body?.messages ?? [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && m?.content?.trim())
    .slice(-20); // cap history so a runaway client can't blow up the token bill

  if (turns.length === 0) {
    return NextResponse.json({ error: 'Please send at least one message.' }, { status: 400 });
  }

  // ── Step 2: The AI key must be configured — no demo fallback ─────────────
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.error('[chat] OPENROUTER_API_KEY is not set on this deployment.');
    return NextResponse.json(
      { error: 'The assistant is not configured yet: OPENROUTER_API_KEY is missing on the server.' },
      { status: 503 },
    );
  }

  // If the traveller is viewing a flight, hand that live context to the AI. We
  // tell it to trust this and never invent details beyond what's given.
  const contextNote = body?.context?.flightSummary
    ? `\n\nCurrent flight context (trust this, don't invent beyond it): ${body.context.flightSummary}`
    : '';
  const system = DOMNER_SYSTEM_PROMPT + contextNote; // <-- the "brain"

  // ── Step 3: Ask Claude (via OpenRouter) for a real answer ────────────────
  try {
    const reply = await askOpenRouter(openRouterKey, system, turns);
    return NextResponse.json({ reply });
  } catch (error) {
    // Surface the real reason (bad key, no credits, wrong model, network blip)
    // instead of hiding it — so it can actually be diagnosed and fixed.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[chat] AI call failed:', message);
    return NextResponse.json({ error: `AI request failed — ${message}` }, { status: 502 });
  }
}
