import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { KNOWLEDGE_BASE, matchFaq } from '@/lib/copilotKnowledge';

// POST /api/copilot — Domer Trip Copilot, a Khmer-first travel assistant.
//
// Cost-conscious hybrid ("smart hybrid"):
//   1. Free FAQ layer — common questions (refunds, eSIM setup, payment, etc.)
//      are answered instantly from canned bilingual replies and never touch the
//      paid model. See lib/copilotKnowledge.ts.
//   2. Cheap AI fallback — anything the FAQ doesn't cover goes to Claude Haiku
//      (claude-haiku-4-5), a fraction of the cost of Opus, grounded in Domer's
//      product & policy knowledge base so it answers as our agent.
//   3. Demo mode — without ANTHROPIC_API_KEY, a friendly bilingual canned reply,
//      matching the demo-mode pattern used throughout the app.
//
// Model note: Haiku is deliberate — set a monthly spend cap in the Anthropic
// console. Bump to a larger model only once Copilot proves it drives revenue.
const COPILOT_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are the Domer Trip Copilot, a warm and concise travel assistant built into the Domer app for Cambodian travelers heading abroad (and visitors arriving in Cambodia).

Respond primarily in Khmer (ភាសាខ្មែរ), the way a knowledgeable local friend would — but reply in English if the traveler writes in English. Keep answers short and practical (2-4 sentences): airport procedures, eSIM/data setup, packing checklists, emergency phrases, currency, and general flight questions.

If flight context is provided below, you may reference it. Never invent specific gate numbers, delay minutes, or flight statuses that were not given to you in that context — instead tell the traveler to check the live flight tracker in the app. You cannot book, cancel, or modify tickets or eSIM orders.

${KNOWLEDGE_BASE}`;

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface CopilotContext {
  flightNumber?: string | null;
  flightSummary?: string | null;
}

function demoReply(turns: ChatTurn[], context?: CopilotContext): string {
  const lastUser = turns[turns.length - 1]?.content ?? '';
  const isKhmer = /[ក-៿]/.test(lastUser);
  const flightNote = context?.flightSummary ? ` (${context.flightSummary})` : '';

  if (isKhmer) {
    return `សួស្តី! ខ្ញុំកំពុងដំណើរការក្នុងទម្រង់សាកល្បង (ត្រូវការ ANTHROPIC_API_KEY ដើម្បីទទួលបានចម្លើយ AI ពិតប្រាកដ)។${flightNote} ជាទូទៅ៖ មកដល់អាកាសយានដ្ឋានយ៉ាងហោចណាស់ ២ម៉ោងមុនជើងហោះហើរក្នុងស្រុក ឬ ៣ម៉ោងសម្រាប់ជើងហោះហើរអន្តរជាតិ ដំឡើង eSIM មុនហោះហើរ ហើយបើកនៅពេលចុះចតតែប៉ុណ្ណោះ។`;
  }
  return `Hi! I'm running in demo mode right now (add an ANTHROPIC_API_KEY to unlock live AI answers).${flightNote} General tip: arrive at least 2 hours before a domestic flight or 3 hours for international, install your eSIM before you fly, and switch it on only after landing.`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    messages?: ChatTurn[];
    context?: CopilotContext;
  } | null;

  const turns = body?.messages?.filter((m) => m.content?.trim()) ?? [];
  if (turns.length === 0) {
    return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
  }

  // 1. Free FAQ layer — deflect common questions before spending a token.
  // Only applies when the traveler just asked something (last turn is theirs)
  // and there's no live flight context to weave in.
  const lastTurn = turns[turns.length - 1];
  if (lastTurn?.role === 'user' && !body?.context?.flightSummary) {
    const canned = matchFaq(lastTurn.content);
    if (canned) {
      return NextResponse.json({ reply: canned, demo: false, source: 'faq' });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: demoReply(turns, body?.context), demo: true });
  }

  const contextNote = body?.context?.flightSummary
    ? `\n\nCurrent flight context (trust this, don't invent beyond it): ${body.context.flightSummary}`
    : '';

  try {
    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
      model: COPILOT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT + contextNote,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    });
    const message = await stream.finalMessage();

    const reply = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return NextResponse.json({ reply: reply || demoReply(turns, body?.context), demo: false });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: typeof error.status === 'number' ? error.status : 500 }
      );
    }
    return NextResponse.json({ error: 'Copilot is temporarily unavailable' }, { status: 500 });
  }
}
