import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// POST /api/copilot — Domer Trip Copilot, a Khmer-first travel assistant.
// Runs on Claude (claude-opus-4-8). Without ANTHROPIC_API_KEY configured it
// falls back to a friendly bilingual canned reply, matching the demo-mode
// pattern used throughout the app (flights, eSIM checkout, etc).

const SYSTEM_PROMPT = `You are the Domer Trip Copilot, a warm and concise travel assistant built into the Domer app for Cambodian travelers heading abroad (and visitors arriving in Cambodia).

Respond primarily in Khmer (ភាសាខ្មែរ), the way a knowledgeable local friend would — but reply in English if the traveler writes in English. Keep answers short and practical (2-4 sentences): airport procedures, eSIM/data setup, packing checklists, emergency phrases, currency, and general flight questions.

If flight context is provided below, you may reference it. Never invent specific gate numbers, delay minutes, or flight statuses that were not given to you in that context — instead tell the traveler to check the live flight tracker in the app. You cannot book, cancel, or modify tickets or eSIM orders.`;

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
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
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
