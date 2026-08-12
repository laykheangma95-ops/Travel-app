// Admin affiliates API — list applications and approve/reject them.
//
// Previously the affiliates page rendered a hardcoded array and the approval
// buttons changed only local React state, so an approval never reached the
// database and a referral code was never actually activated.

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/serverAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function db() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Affiliate storage is unavailable.');
  }
  return supabase;
}

export const GET = route(
  async (request) => {
    await requirePermission(request, 'affiliates.manage');

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = db()
      .from('affiliates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (status && ['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      log.error('admin.affiliates_list_failed', { error });
      throw new ApiError('INTERNAL', 'Could not load affiliates.');
    }

    return ok({ affiliates: data ?? [] });
  },
  { name: 'admin.affiliates.list' }
);

const decisionSchema = z.object({
  id: z.string().uuid('Unknown affiliate.'),
  status: z.enum(['approved', 'rejected', 'suspended', 'pending']),
  commissionRate: z.number().min(0).max(0.9).optional(),
});

export const PATCH = route(
  async (request) => {
    const { user: admin } = await requirePermission(request, 'affiliates.manage');
    const parsed = decisionSchema.safeParse(await readJson<unknown>(request));

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError('BAD_REQUEST', issue?.message ?? 'Invalid request.');
    }

    const patch: Record<string, unknown> = { status: parsed.data.status };
    if (parsed.data.commissionRate !== undefined) {
      patch.commission_rate = parsed.data.commissionRate;
    }

    const { data, error } = await db()
      .from('affiliates')
      .update(patch)
      .eq('id', parsed.data.id)
      .select('*')
      .maybeSingle();

    if (error) {
      log.error('admin.affiliate_update_failed', { id: parsed.data.id, error });
      throw new ApiError('INTERNAL', 'Could not update the affiliate.');
    }
    if (!data) {
      throw new ApiError('NOT_FOUND', 'That affiliate no longer exists.');
    }

    log.info('admin.affiliate_updated', {
      id: parsed.data.id,
      status: parsed.data.status,
      by: admin.email,
    });

    return ok({ affiliate: data });
  },
  { name: 'admin.affiliates.decide' }
);
