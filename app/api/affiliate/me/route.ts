// GET /api/affiliate/me — the caller's own affiliate row, or nothing.
//
// This is what makes /affiliate real. That page used to render a fixed
// `demoStats` object — referral code SOKHA30, 184 clicks, 23 orders, $96.60
// earned — to every visitor, including people who had never applied. Anyone who
// tapped "copy your link" got someone else's code, so any referral they drove
// credited another account.
//
// Scope is deliberately one row: the caller's. Matched by user_id, and by the
// email the application was filed under, so someone who applied while signed out
// still finds their row after creating an account with that address — the same
// rule `listOrdersForUser` already uses for guest orders.
//
// There is no list, no search and no lookup-by-code here, and there must not be:
// the affiliate table holds names, emails, phone numbers and Telegram handles.
// Admin access to the whole table already exists behind /api/admin/affiliates.

import { ok, route } from '@/lib/http';
import { requireUser } from '@/lib/serverAuth';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabase';
import { logSupabaseError } from '@/lib/supabaseError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface AffiliateSelf {
  referralCode: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  clicks: number;
  orders: number;
  earnedUsd: number;
  commissionRate: number;
}

export const GET = route(
  async (request) => {
    if (!getSupabase()) return ok({ affiliate: null, unconfigured: true });

    const user = await requireUser(request);

    // Service role because the match includes the email path, which RLS cannot
    // express — `affiliates_select_own` only knows about user_id. The filter
    // below is still confined to this caller: their id, or the address on their
    // verified session. Nothing else is reachable.
    const supabase = getSupabaseAdmin();
    if (!supabase) return ok({ affiliate: null, unconfigured: true });

    const email = user.email?.trim().toLowerCase() ?? null;
    const match = email
      ? `user_id.eq.${user.id},email.eq.${email}`
      : `user_id.eq.${user.id}`;

    const { data, error } = await supabase
      .from('affiliates')
      .select('referral_code, status, total_clicks, total_orders, total_earned_usd, commission_rate, user_id')
      .or(match)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      logSupabaseError('affiliate.self_lookup_failed', error);
      return ok({ affiliate: null });
    }

    if (!data) return ok({ affiliate: null });

    // First time this account has been recognised as the owner of a row it
    // applied for while signed out — claim it, so later reads go through
    // user_id and the email path stops mattering.
    if (!data.user_id) {
      const { error: claimError } = await supabase
        .from('affiliates')
        .update({ user_id: user.id })
        .eq('referral_code', data.referral_code)
        .is('user_id', null);
      if (claimError) logSupabaseError('affiliate.self_claim_failed', claimError);
    }

    const affiliate: AffiliateSelf = {
      referralCode: data.referral_code as string,
      status: data.status as AffiliateSelf['status'],
      clicks: Number(data.total_clicks ?? 0),
      orders: Number(data.total_orders ?? 0),
      earnedUsd: Number(data.total_earned_usd ?? 0),
      commissionRate: Number(data.commission_rate ?? 0.3),
    };

    return ok({ affiliate });
  },
  { rateLimit: 'session', name: 'affiliate.me' }
);
