// ─────────────────────────────────────────────────────────────────────────────
// Beginner AI Chatbot API — POST /api/chat
//
// WHAT THIS IS:
//   A small, heavily-commented example of how to build an AI chatbot endpoint.
//   It's deliberately simpler than the production Copilot (app/api/copilot) so
//   you can read it top-to-bottom and understand every line. Use it to learn,
//   to test the "brain", or as the starting point for a new chat feature.
//
// THE WHOLE IDEA IN 4 STEPS:
//   1. Read the conversation the user sent (a list of messages).
//   2. Load the Domner "brain" (lib/domnerBrain.ts) — what the AI knows.
//   3. Ask Claude for a reply, giving it the brain + the conversation.
//   4. Send the reply back as JSON.
//
// If there's no ANTHROPIC_API_KEY set, we skip step 3 and return a friendly
// "demo mode" answer, so the endpoint always works while you're building.
//
// TRY IT (with the dev server running):
//   curl -s -X POST http://localhost:3000/api/chat \
//     -H 'Content-Type: application/json' \
//     -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DOMNER_SYSTEM_PROMPT } from '@/lib/domnerBrain';

// The AI model to use. Haiku is Anthropic's fastest + cheapest model, which
// suits a high-volume support chatbot (this matches Domner's cost strategy).
// To get higher-quality answers, change this to 'claude-opus-4-8' — it costs
// more per message but reasons better. That's the only line you need to change.
const MODEL = 'claude-haiku-4-5';

// One "turn" in the conversation: who spoke ('user' = the traveller,
// 'assistant' = the AI) and what they said.
interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// A canned reply used when no API key is configured (demo mode) OR when the AI
// call fails for any reason — so the chatbot always answers something helpful.
function demoReply(turns: ChatTurn[]): string {
  const lastMessage = turns[turns.length - 1]?.content ?? '';
  const wroteInKhmer = /[ក-៿]/.test(lastMessage); // any Khmer character?

  if (wroteInKhmer) {
    return 'សួស្តី! ខ្ញុំជាជំនួយការ Domner។ ដើម្បីទទួលបានចម្លើយ AI ពិតប្រាកដ សូមបញ្ចូល ANTHROPIC_API_KEY។ ជាទូទៅ៖ ដំឡើង eSIM មុនពេលហោះហើរ ហើយបើកវានៅពេលចុះចតដល់គោលដៅ។';
  }
  return "Hi! I'm the Domner assistant. Add an ANTHROPIC_API_KEY to unlock live AI answers. In the meantime: install your eSIM before you fly, and switch it on only after you land at your destination.";
}

export async function POST(request: Request) {
  // ── Step 1: Read and validate the incoming conversation ──────────────────
  // We defend against bad input so the endpoint never crashes.
  const body = (await request.json().catch(() => null)) as { messages?: ChatTurn[] } | null;
  const turns = (body?.messages ?? []).filter((m) => m?.content?.trim());

  if (turns.length === 0) {
    return NextResponse.json({ error: 'Please send at least one message.' }, { status: 400 });
  }

  // ── Step 2: If there's no API key, answer in demo mode ───────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: demoReply(turns), demo: true });
  }

  // ── Step 3: Ask Claude for a real answer ─────────────────────────────────
  try {
    const claude = new Anthropic({ apiKey });

    const message = await claude.messages.create({
      model: MODEL,
      max_tokens: 1024, // a chat reply is short; this caps the length
      system: DOMNER_SYSTEM_PROMPT, // <-- the "brain" teaches Claude about Domner
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    });

    // Claude's answer comes back as a list of "content blocks". For a plain
    // chat reply we just want the text blocks, joined together.
    const reply = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    // ── Step 4: Send the reply back ──────────────────────────────────────────
    return NextResponse.json({ reply: reply || demoReply(turns), demo: false });
  } catch (error) {
    // If anything goes wrong (bad key, no credits, network blip), we log it for
    // ourselves and still return a helpful demo answer instead of an error —
    // so the traveller is never left staring at a broken chatbot.
    console.error('[chat] AI call failed, serving demo reply:', error instanceof Error ? error.message : error);
    return NextResponse.json({ reply: demoReply(turns), demo: true });
  }
}
