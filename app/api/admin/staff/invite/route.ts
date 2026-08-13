// POST /api/admin/staff/invite — re-send (or repair) a staff member's invitation.
//
// Adding someone already sends the mail. This exists for when that first send
// did not land: the mail bounced, went to spam, SMTP was misconfigured at the
// time, or the person was invited before the panel provisioned accounts at all
// — which is every staff row created before lib/staffInvite.ts existed. Those
// rows carry a role and no account, and the only visible symptom is the person
// telling you sign-in does not work.
//
// It also repairs the quieter version of the same problem: a staff member who
// already had an account but whose row was never linked to it. They sign in
// fine and hold no authority, because resolveStaff() matches on user_id.
// Running this links them, with no email sent and no password disturbed.
//
// Requires 'staff.manage', like everything else under /api/admin/staff.

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/serverAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { provisionStaffAccount } from '@/lib/staffInvite';
import { recordStaffEvent } from '@/lib/staff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(255),
});

export const POST = route(
  async (request) => {
    const { staff: actor } = await requirePermission(request, 'staff.manage');
    const parsed = schema.safeParse(await readJson<unknown>(request));

    if (!parsed.success) {
      throw new ApiError(
        'BAD_REQUEST',
        parsed.error.issues[0]?.message ?? 'Invalid email address.'
      );
    }

    const email = parsed.data.email.toLowerCase();

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Staff storage is unavailable.');
    }

    // Only re-invite someone who is actually on the team. Without this the
    // endpoint is an open "mail anybody a link to our site" button.
    const { data: existing } = await supabase
      .from('staff_users')
      .select('user_id, is_active')
      .eq('email', email)
      .maybeSingle();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'No staff member with that email address.');
    }

    const row = existing as { user_id: string | null; is_active: boolean };

    if (!row.is_active) {
      throw new ApiError(
        'BAD_REQUEST',
        'That account is deactivated. Reactivate it first, then send the invitation.'
      );
    }

    const invite = await provisionStaffAccount(email, {
      alreadyLinked: row.user_id !== null,
    });

    await recordStaffEvent({
      staffEmail: email,
      eventType: 'staff.invite_resent',
      actor: actor.email,
      detail: { invite: invite.status },
    });

    return ok({ invite });
  },
  { rateLimit: 'auth', name: 'admin.staff.invite_resend' }
);
