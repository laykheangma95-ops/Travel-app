// ─────────────────────────────────────────────────────────────────────────────
// Lightweight internal app events.
//
//   affiliate.click  — a visitor landed with ?ref=CODE
//   affiliate.apply  — a new affiliate application was submitted
//
// (Payment provider webhooks live under /api/payments/*.)
//
// WHAT WAS WRONG:
//   Both events were unauthenticated and unlimited. Click counting did a
//   read-then-write on total_clicks, so concurrent hits silently lost counts,
//   and a loop could inflate an affiliate's stats — or their commission — at
//   will. Applications could be created in bulk with no validation, and the
//   generated referral code came from `Math.random()` with 90 possible values,
//   so collisions were near-certain.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { clientKey } from '@/lib/rateLimit';
import { log, redactEmail } from '@/lib/logger';
import { logSupabaseError } from '@/lib/supabaseError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clickSchema = z.object({
  type: z.literal('affiliate.click'),
  referralCode: z.string().trim().min(2).max(32),
});

const applySchema = z.object({
  type: z.literal('affiliate.apply'),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(32).optional(),
  telegram: z.string().trim().max(64).optional(),
});

const eventSchema = z.discriminatedUnion('type', [clickSchema, applySchema]);

/** One-way hash: enough to deduplicate clicks, never enough to re-identify. */
function hashIp(request: Request): string {
  const salt = process.env.DOMNER_IP_SALT ?? 'domner-default-salt';
  return crypto.createHash('sha256').update(`${salt}:${clientKey(request)}`).digest('hex').slice(0, 32);
}

/** Collision-resistant referral code: name prefix + 6 random base32 chars. */
function generateReferralCode(name: string): string {
  const prefix = name.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'DOMNER';
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `${prefix}${suffix}`;
}

export const POST = route(
  async (request) => {
    const parsed = eventSchema.safeParse(await readJson<unknown>(request));

    if (!parsed.success) {
      // Unknown event types are ignored rather than 400'd, so adding a new
      // client-side event never breaks against an older deployment.
      return ok({ ok: true, ignored: true });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return ok({ ok: true, persisted: false });

    const event = parsed.data;

    if (event.type === 'affiliate.click') {
      const { data: affiliate, error: affiliateError } = await supabase
        .from('affiliates')
        .select('id')
        .eq('referral_code', event.referralCode.toUpperCase())
        .eq('status', 'approved')
        .maybeSingle();

      // Stays silent to the caller either way — a 404 here would let anyone
      // enumerate which referral codes are live — but a failed lookup is now
      // distinguishable from an unknown code in the log, instead of both
      // vanishing as "no affiliate".
      if (affiliateError) logSupabaseError('affiliate.lookup_failed', affiliateError);
      if (!affiliate) return ok({ ok: true });

      const ipHash = hashIp(request);

      // One counted click per IP per code per day. Without this, a refresh loop
      // inflates the affiliate's stats and, downstream, their commission.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: dedupeError } = await supabase
        .from('affiliate_events')
        .select('id', { count: 'exact', head: true })
        .eq('affiliate_id', affiliate.id)
        .eq('event_type', 'click')
        .eq('ip_hash', ipHash)
        .gte('created_at', since);

      // A failed dedupe read reads as `count = 0`, i.e. "not seen today", which
      // would let a refresh loop inflate commission. Skip the increment instead.
      if (dedupeError) {
        logSupabaseError('affiliate.dedupe_failed', dedupeError);
        return ok({ ok: true, deduplicated: false, counted: false });
      }

      if ((count ?? 0) > 0) return ok({ ok: true, deduplicated: true });

      const { error: eventError } = await supabase.from('affiliate_events').insert({
        affiliate_id: affiliate.id,
        event_type: 'click',
        ip_hash: ipHash,
      });
      if (eventError) logSupabaseError('affiliate.click_event_failed', eventError);

      // Atomic increment in the database. The previous read-then-write lost
      // counts whenever two clicks overlapped.
      const { error } = await supabase.rpc('increment_affiliate_clicks', {
        affiliate_id: affiliate.id,
      });
      if (error) logSupabaseError('affiliate.click_increment_failed', error);

      return ok({ ok: true });
    }

    // affiliate.apply
    const { data: existing, error: existingError } = await supabase
      .from('affiliates')
      .select('id')
      .eq('email', event.email)
      .maybeSingle();

    if (existingError) logSupabaseError('affiliate.apply_lookup_failed', existingError);

    if (existing) {
      // Idempotent: re-applying is not an error, and confirming the address is
      // already registered would leak who our affiliates are.
      return ok({ ok: true, alreadyApplied: true });
    }

    const { error } = await supabase.from('affiliates').insert({
      name: event.name,
      email: event.email,
      phone: event.phone ?? null,
      telegram: event.telegram ?? null,
      referral_code: generateReferralCode(event.name),
      status: 'pending',
    });

    if (error) {
      log.warn('affiliate.apply_failed', { email: redactEmail(event.email), error });
      throw new ApiError('INTERNAL', 'Could not submit your application. Please try again.');
    }

    log.info('affiliate.applied', { email: redactEmail(event.email) });
    return ok({ ok: true });
  },
  { rateLimit: 'publicWrite', name: 'webhooks.internal' }
);
