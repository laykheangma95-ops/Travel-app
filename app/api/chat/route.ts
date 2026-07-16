// ─────────────────────────────────────────────────────────────────────────────
// Domner AI Chatbot API — POST /api/chat
//
// WHAT THIS IS:
//   The single chatbot endpoint powering the floating "✦" Trip Copilot in the
//   app. It answers using the Domner "brain" (lib/domnerBrain.ts) — one shared
//   block of business knowledge that auto-syncs eSIM prices/countries from the
//   data files, so answers stay correct without editing this route.
//
// WHICH AI PROVIDER IT USES (checked in this order):
//   1. OPENROUTER_API_KEY set  → OpenRouter (openrouter.ai), which routes to
//      Claude. One key, works with many models, simple billing.
//   2. ANTHROPIC_API_KEY set   → Anthropic directly (console.anthropic.com).
//   3. Neither                 → friendly "demo mode" canned answer, so the
//      chatbot always works while you're building.
//
// SETUP ON VERCEL:
//   Project → Settings → Environment Variables → add OPENROUTER_API_KEY
//   (sk-or-v1-...) → Redeploy. That's it.
//
// TRY IT (with the dev server running):
//   curl -s -X POST http://localhost:3000/api/chat \
//     -H 'Content-Type: application/json' \
//     -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DOMNER_SYSTEM_PROMPT } from '@/lib/domnerBrain';

// Run on Vercel's Node runtime (the Anthropic SDK needs it), and disable caching
// so every message gets a fresh answer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The models to use. Haiku is Anthropic's fastest + cheapest model, which suits
// a high-volume support chatbot (this matches Domner's cost strategy). Note the
// two spellings: OpenRouter writes versions with a dot, Anthropic with a dash.
const OPENROUTER_MODEL = 'anthropic/claude-haiku-4.5';
const ANTHROPIC_MODEL = 'claude-haiku-4-5';

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

// A canned reply used when no API key is configured (demo mode) OR when the AI
// call fails for any reason — so the chatbot always answers something helpful.
function demoReply(turns: ChatTurn[], context?: ChatContext): string {
  const lastMessage = turns[turns.length - 1]?.content ?? '';
  const wroteInKhmer = /[ក-៿]/.test(lastMessage); // any Khmer character?
  const flightNote = context?.flightSummary ? ` (${context.flightSummary})` : '';

  if (wroteInKhmer) {
    return `សួស្តី! ខ្ញុំជាជំនួយការ Domner។ ដើម្បីទទួលបានចម្លើយ AI ពិតប្រាកដ សូមបញ្ចូល API key។${flightNote} ជាទូទៅ៖ ដំឡើង eSIM មុនពេលហោះហើរ ហើយបើកវានៅពេលចុះចតដល់គោលដៅ។`;
  }
  return `Hi! I'm the Domner assistant. Add an OPENROUTER_API_KEY to unlock live AI answers.${flightNote} In the meantime: install your eSIM before you fly, and switch it on only after you land at your destination.`;
}

// Ask Claude through OpenRouter (OpenAI-compatible chat/completions endpoint).
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
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// Ask Claude through Anthropic directly (kept as a fallback provider).
async function askAnthropic(
  apiKey: string,
  system: string,
  turns: ChatTurn[],
): Promise<string> {
  const claude = new Anthropic({ apiKey });
  const message = await claude.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system,
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  });

  // Claude's answer comes back as a list of "content blocks". For a plain
  // chat reply we just want the text blocks, joined together.
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
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

  // ── Step 2: If there's no API key at all, answer in demo mode ────────────
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!openRouterKey && !anthropicKey) {
    return NextResponse.json({ reply: demoReply(turns, body?.context), demo: true });
  }

  // If the traveller is viewing a flight, hand that live context to the AI. We
  // tell it to trust this and never invent details beyond what's given.
  const contextNote = body?.context?.flightSummary
    ? `\n\nCurrent flight context (trust this, don't invent beyond it): ${body.context.flightSummary}`
    : '';
  const system = DOMNER_SYSTEM_PROMPT + contextNote; // <-- the "brain"

  // ── Step 3: Ask Claude for a real answer ─────────────────────────────────
  try {
    const reply = openRouterKey
      ? await askOpenRouter(openRouterKey, system, turns)
      : await askAnthropic(anthropicKey!, system, turns);

    // ── Step 4: Send the reply back ──────────────────────────────────────────
    return NextResponse.json({ reply: reply || demoReply(turns, body?.context), demo: false });
  } catch (error) {
    // If anything goes wrong (bad key, no credits, network blip), we log it for
    // ourselves and still return a helpful demo answer instead of an error —
    // so the traveller is never left staring at a broken chatbot.
    console.error('[chat] AI call failed, serving demo reply:', error instanceof Error ? error.message : error);
    return NextResponse.json({ reply: demoReply(turns, body?.context), demo: true });
  }
}
