// ─────────────────────────────────────────────────────────────────────────────
// Domner Trip Copilot — the intelligent layer (Claude).
//
// WHAT THIS IS (for beginners):
//   This is the part that actually THINKS. `lib/domnerEngine.ts` next door is a
//   keyword matcher: it recognises phrases it was told about and replies with a
//   pre-written answer. It cannot reason, cannot combine two facts, and cannot
//   answer anything nobody wrote an answer for. That is why editing it never
//   made the Copilot feel smarter — there was no mind to teach.
//
//   This file sends the traveller's question to Claude, a real AI model, along
//   with Domner's own knowledge (lib/domnerBrain.ts). The result is a Copilot
//   that can genuinely reason — "I fly PNH→Bangkok Tuesday with my grandmother,
//   what do I need?" — while every price, rule, and warning it states comes
//   from our data files rather than from its imagination.
//
// IT NEVER BREAKS THE APP:
//   If ANTHROPIC_API_KEY is missing, the key runs out, or the request fails,
//   every function here returns null and `app/api/chat/route.ts` quietly falls
//   back to the free offline engine. The traveller always gets an answer.
//
// SETUP:
//   Add ANTHROPIC_API_KEY to your environment (see .env.example). Get one at
//   https://console.anthropic.com. Without it, nothing changes and the app
//   keeps running on the offline engine exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { DOMNER_SYSTEM_PROMPT, buildTripBriefing } from '@/lib/domnerBrain';
import type { ChatTurn, ChatContext } from '@/lib/domnerEngine';

// The model that powers the Copilot. Claude Opus 5 is Anthropic's flagship —
// strong multilingual reasoning, which matters because most of our travellers
// write in Khmer.
const MODEL = 'claude-opus-5';

// Room for the answer. Replies are meant to be 2-4 sentences, but the model
// also does some private reasoning that counts against this budget, so we leave
// comfortable headroom rather than risking a reply cut off mid-sentence.
const MAX_TOKENS = 2048;

// Don't let a slow AI request hang the chat bubble. If Claude hasn't answered in
// this many milliseconds we give up and use the instant offline engine instead.
const TIMEOUT_MS = 20_000;

/** True when an Anthropic API key is configured, i.e. the smart Copilot is on. */
export function isAIEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

// Built once and reused, so we don't create a new HTTP client per message.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: TIMEOUT_MS,
      maxRetries: 1, // one quick retry; after that the offline engine takes over
    });
  }
  return client;
}

/**
 * Claude requires the conversation to start with the traveller, so we drop any
 * leading assistant turns (which can happen if the widget's history is odd) and
 * keep only the most recent exchanges — older context adds cost without adding
 * much accuracy for a support chat.
 */
function toMessages(turns: ChatTurn[]): Anthropic.MessageParam[] {
  const recent = turns.slice(-12);
  const firstUser = recent.findIndex((t) => t.role === 'user');
  if (firstUser === -1) return [];
  return recent.slice(firstUser).map((t) => ({ role: t.role, content: t.content }));
}

/**
 * Live facts about the traveller's situation right now — currently the flight
 * they are looking at. This is real data from our flight tracker, so the Copilot
 * may quote it; anything it does NOT have here, it must not guess.
 */
function buildLiveContext(context?: ChatContext): string | null {
  if (!context?.flightSummary) return null;
  return [
    'LIVE CONTEXT — the traveller is currently viewing this flight in the app.',
    'These figures come from our live tracker, so you may state them directly.',
    `Flight: ${context.flightSummary}`,
    'Do not invent any other flight detail (gate, delay, times) beyond this line.',
  ].join('\n');
}

/**
 * generateAIReply — ask Claude for an answer, grounded in Domner's own data.
 *
 * Returns the reply text, or null if the AI is switched off or anything at all
 * goes wrong. A null means "use the offline engine instead" — never an error
 * shown to the traveller.
 */
export async function generateAIReply(
  turns: ChatTurn[],
  context?: ChatContext,
): Promise<string | null> {
  if (!isAIEnabled()) return null;

  const messages = toMessages(turns);
  if (messages.length === 0) return null;

  // Everything the traveller has said, used to work out which countries and
  // airports to look up. Assistant turns are excluded so the Copilot's own
  // earlier mentions don't drag in briefings nobody asked for.
  const conversationText = turns
    .filter((t) => t.role === 'user')
    .map((t) => t.content)
    .join('\n');

  // The system prompt is built in two blocks. The first is byte-for-byte
  // identical on every request, so we mark it `cache_control` and Anthropic
  // charges us roughly a tenth of the price to re-read it. The second block
  // changes per conversation, and sits AFTER the cached one so it never
  // invalidates the cache.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: DOMNER_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];

  const dynamic = [buildTripBriefing(conversationText), buildLiveContext(context)]
    .filter(Boolean)
    .join('\n\n');
  if (dynamic) system.push({ type: 'text', text: dynamic });

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      // Let Claude decide how much to think per question, but keep the effort
      // low: this is a chat bubble, and travellers want a fast answer.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
    });

    // Claude declined to answer (very unlikely for travel questions). Fall back
    // rather than showing the traveller a refusal.
    if (response.stop_reason === 'refusal') {
      console.warn('[copilot] Claude declined the request; using offline engine');
      return null;
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    return text || null;
  } catch (error) {
    // Bad key, no credit, rate limit, network blip — all handled the same way:
    // log it for us, and let the offline engine answer the traveller.
    console.error(
      '[copilot] Claude request failed, falling back to offline engine:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
