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

import { generateReply, type ChatTurn, type ChatContext } from '@/lib/domnerEngine';
import { ApiError, ok, route } from '@/lib/http';
import { log } from '@/lib/logger';

// Run on Vercel's Node runtime, and disable caching so every message gets a
// fresh answer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Longest single message we will consider. Beyond this it is not a question. */
const MAX_MESSAGE_CHARS = 2000;

export const POST = route(
  async (request) => {
    // ── Step 1: Read and validate the incoming conversation ────────────────
    const body = (await request.json().catch(() => null)) as {
      messages?: ChatTurn[];
      context?: ChatContext;
    } | null;

    const turns: ChatTurn[] = (body?.messages ?? [])
      .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && m?.content?.trim())
      // Cap each message as well as the history: 20 turns of unbounded text is
      // still unbounded memory.
      .map((m) => ({ ...m, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
      .slice(-20);

    if (turns.length === 0) {
      throw new ApiError('BAD_REQUEST', 'Please send at least one message.');
    }

    // ── Step 2: Answer with our own engine — no external call, never fails ──
    try {
      const reply = generateReply(turns, body?.context ?? undefined);
      return ok({ reply });
    } catch (error) {
      // The engine is designed never to throw, but we guard anyway so the
      // widget always gets a usable, friendly reply instead of a hard error.
      log.error('chat.engine_error', { error });
      return ok({
        reply:
          'ខ្ញុំនៅទីនេះដើម្បីជួយអំពី eSIM, ជើងហោះហើរ និងការធ្វើដំណើររបស់អ្នក។ សូមសាកសួរម្តងទៀត។ ' +
          "(I'm here to help with eSIMs, flights, and your trip — please ask again.)",
      });
    }
  },
  { rateLimit: 'chat', name: 'chat' }
);
