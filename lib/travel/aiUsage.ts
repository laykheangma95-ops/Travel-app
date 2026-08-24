// ─────────────────────────────────────────────────────────────────────────────
// What the model cost, written down.
//
// WHY:
//   The importer's model call was the only place in Domner that spends money
//   per request, and it was invisible. "Is the AI importer expensive?" had no
//   answer that did not involve logging into a vendor dashboard and guessing
//   which line was ours. A row per call answers it in SQL, per day, per feature
//   and per traveler.
//
// WHO MAY WRITE IT:
//   The service role, and nothing else. `ai_usage_log` has no RLS policy at
//   all, so an authenticated caller can neither read nor write it.
//
//   It briefly had an INSERT policy scoped to the caller's own user id, written
//   so the extract route could record usage on the session client it already
//   had. That policy constrained whose row could be written but not what was in
//   it: any signed-in account could insert arbitrary models, token counts and
//   costs into the numbers we would use to answer "what is this costing us".
//   A ledger anybody can write is not a ledger.
//
// WHAT THIS IS NOT:
//   Not the quota. The quota counts place_imports rows, which a traveler can
//   neither backdate, delete, nor mark as a replay (see migration 012). Cost
//   ENFORCEMENT lives there; this table is the record, not the control.
//
// WHAT THE NUMBER MEANS:
//   An ESTIMATE, from a price list in this file. The invoice is the vendor's,
//   not ours. It is stored in integer micro-dollars because money is never a
//   float here, and an estimate is still money.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

/**
 * USD per million tokens, as published. Kept small and explicit rather than
 * fetched: a price list that needs a network call to read is a price list that
 * is unavailable exactly when the bill is being investigated.
 *
 * An unknown model is recorded at zero cost with its name intact, so the row is
 * still there to be re-priced later. Guessing a price for a model we do not
 * know would be worse than admitting we do not know it.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/**
 * Micro-dollars for a call.
 *
 * A price quoted per million tokens is, conveniently, also the price in
 * micro-dollars per single token: $3 per 1M tokens is 3µ$ per token. So the
 * arithmetic is a multiply, with no floating-point division to round wrong.
 */
export function estimateCostMicros(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICES[model];
  if (!price) return 0;
  return Math.round(tokensIn * price.input + tokensOut * price.output);
}

export interface AiUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Write one line of the bill. Best-effort, like the rest of the ledger: a
 * traveler must never see an error because bookkeeping failed.
 *
 * `admin` is the SERVICE-ROLE client, and null is a normal state — a deployment
 * with no service key simply does not record cost. An absent line is honest; a
 * line a traveler could have written is not, which is why this no longer falls
 * back to the session client.
 */
export async function recordAiUsage(
  admin: SupabaseClient | null,
  userId: string,
  feature: string,
  usage: AiUsage
): Promise<void> {
  if (!admin) return;

  try {
    const { error } = await admin.from('ai_usage_log').insert({
      user_id: userId,
      feature,
      model: usage.model,
      tokens_in: Math.max(0, Math.round(usage.tokensIn)),
      tokens_out: Math.max(0, Math.round(usage.tokensOut)),
      cost_estimate_micros: estimateCostMicros(usage.model, usage.tokensIn, usage.tokensOut),
    });
    if (error) log.warn('ai_usage.write_failed', { reason: error.message.slice(0, 120) });
  } catch {
    // Deliberately silent. This is the least important write in the request.
  }
}
