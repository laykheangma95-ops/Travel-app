// ─────────────────────────────────────────────────────────────────────────────
// Staff management. Requires 'staff.manage', which only `admin` holds.
//
//   GET   /api/admin/staff   — list staff and their roles
//   POST  /api/admin/staff   — invite someone by email, with a role
//   PATCH /api/admin/staff   — change a role, or activate/deactivate
//
// POST does two things, and the second one used to be missing: it records the
// authority AND provisions the account that authority attaches to. Writing the
// row alone left the invited person with an address that could not sign in —
// see lib/staffInvite.ts for the full account of that failure.
//
// Two guards worth naming, because both are ways an admin panel quietly loses
// its last administrator:
//
//   1. You cannot change your own role or deactivate yourself. Demoting
//      yourself by mistake is a support ticket you cannot file from inside the
//      product.
//   2. You cannot remove the last active admin. The check runs on the server
//      immediately before the write, not in the UI.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requirePermission } from '@/lib/serverAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { STAFF_ROLES, recordStaffEvent, type StaffRecord, type StaffRole } from '@/lib/staff';
import { provisionStaffAccount } from '@/lib/staffInvite';
import { log } from '@/lib/logger';
import { logSupabaseError } from '@/lib/supabaseError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function db() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Staff storage is unavailable.');
  }
  return supabase;
}

interface StaffRow {
  id: string;
  email: string;
  full_name: string | null;
  role: StaffRole;
  is_active: boolean;
  mfa_enrolled: boolean;
  user_id: string | null;
  invited_by: string | null;
  last_seen_at: string | null;
  created_at: string;
}

function toRecord(row: StaffRow): StaffRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    mfaEnrolled: row.mfa_enrolled,
    hasSignedUp: row.user_id !== null,
    invitedBy: row.invited_by,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };
}

async function activeAdminCount(excludeEmail?: string): Promise<number> {
  const supabase = db();
  const { data, error } = await supabase
    .from('staff_users')
    .select('email')
    .eq('role', 'admin')
    .eq('is_active', true);

  // This count guards the last-admin lockout. A failed read used to return 0,
  // which still refused the change — safe, but it told the owner "this is the
  // last active admin" when the truth was "we could not ask the database".
  if (error) {
    logSupabaseError('staff.admin_count_failed', error);
    throw new ApiError(
      'SERVICE_UNAVAILABLE',
      'We could not verify how many admins remain, so this change was not applied. Please try again.'
    );
  }

  const admins = ((data ?? []) as Array<{ email: string }>).map((row) => row.email);
  return admins.filter((email) => email !== excludeEmail?.toLowerCase()).length;
}

export const GET = route(
  async (request) => {
    await requirePermission(request, 'staff.manage');

    const { data, error } = await db()
      .from('staff_users')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      logSupabaseError('staff.list_failed', error);
      throw new ApiError('INTERNAL', 'Could not load the staff list.');
    }

    return ok({ staff: ((data ?? []) as StaffRow[]).map(toRecord) });
  },
  { name: 'admin.staff.list' }
);

const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(255),
  fullName: z.string().trim().max(120).optional(),
  role: z.enum(STAFF_ROLES),
});

export const POST = route(
  async (request) => {
    const { staff: actor } = await requirePermission(request, 'staff.manage');
    const parsed = inviteSchema.safeParse(await readJson<unknown>(request));

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError('BAD_REQUEST', issue?.message ?? 'Invalid staff details.', {
        field: issue?.path.join('.'),
      });
    }

    const email = parsed.data.email.toLowerCase();

    // Upsert on email so re-inviting someone who left restores them rather
    // than failing on the unique constraint.
    const { data, error } = await db()
      .from('staff_users')
      .upsert(
        {
          email,
          full_name: parsed.data.fullName ?? null,
          role: parsed.data.role,
          is_active: true,
          invited_by: actor.email,
        },
        { onConflict: 'email' }
      )
      .select('*')
      .single();

    if (error || !data) {
      logSupabaseError('staff.invite_failed', error);
      throw new ApiError('INTERNAL', 'Could not add that staff member.');
    }

    const row = data as StaffRow;

    // The row is safe now. Provisioning runs after it and never throws, so a
    // mail server having a bad day cannot cost us the authority record — it
    // just comes back as a warning the admin can act on.
    const invite = await provisionStaffAccount(email, {
      alreadyLinked: row.user_id !== null,
    });

    await recordStaffEvent({
      staffEmail: email,
      eventType: 'staff.invited',
      toRole: parsed.data.role,
      actor: actor.email,
      detail: { invite: invite.status },
    });

    // Re-read: provisioning may have attached a user_id, and the screen shows
    // "not signed up yet" off that field.
    const { data: fresh } = await db()
      .from('staff_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    return ok({ staff: toRecord((fresh ?? row) as StaffRow), invite });
  },
  { rateLimit: 'auth', name: 'admin.staff.invite' }
);

const updateSchema = z
  .object({
    email: z.string().trim().email().max(255),
    role: z.enum(STAFF_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.isActive !== undefined, {
    message: 'Provide a role or an active flag to change.',
  });

export const PATCH = route(
  async (request) => {
    const { staff: actor } = await requirePermission(request, 'staff.manage');
    const parsed = updateSchema.safeParse(await readJson<unknown>(request));

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError('BAD_REQUEST', issue?.message ?? 'Invalid change.', {
        field: issue?.path.join('.'),
      });
    }

    const { email: rawEmail, role, isActive } = parsed.data;
    const email = rawEmail.toLowerCase();

    if (email === actor.email.toLowerCase()) {
      throw new ApiError(
        'BAD_REQUEST',
        'You cannot change your own role or deactivate your own account. Ask another admin.'
      );
    }

    const { data: existing, error: existingError } = await db()
      .from('staff_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    // "The read failed" and "there is no such person" are different answers, and
    // reporting the first as 404 sends an admin hunting for a typo that is not
    // there.
    if (existingError) {
      logSupabaseError('staff.read_failed', existingError);
      throw new ApiError('SERVICE_UNAVAILABLE', 'We could not load that staff member. Please try again.');
    }

    if (!existing) {
      throw new ApiError('NOT_FOUND', 'No staff member with that email address.');
    }

    const current = existing as StaffRow;
    const losingAdmin =
      current.role === 'admin' &&
      current.is_active &&
      ((role !== undefined && role !== 'admin') || isActive === false);

    if (losingAdmin && (await activeAdminCount(email)) === 0) {
      throw new ApiError(
        'BAD_REQUEST',
        'This is the last active admin. Promote someone else first, or you will lock the panel.'
      );
    }

    const patch: Record<string, unknown> = {};
    if (role !== undefined) patch.role = role;
    if (isActive !== undefined) patch.is_active = isActive;

    const { data, error } = await db()
      .from('staff_users')
      .update(patch)
      .eq('email', email)
      .select('*')
      .single();

    if (error || !data) {
      logSupabaseError('staff.update_failed', error);
      throw new ApiError('INTERNAL', 'Could not update that staff member.');
    }

    await recordStaffEvent({
      staffEmail: email,
      eventType:
        isActive === false
          ? 'staff.deactivated'
          : isActive === true
            ? 'staff.reactivated'
            : 'staff.role_changed',
      fromRole: current.role,
      toRole: role ?? current.role,
      actor: actor.email,
      detail: { viaBootstrap: actor.viaBootstrap },
    });

    log.info('staff.updated', {
      staffEmail: email,
      from: current.role,
      to: role ?? current.role,
      isActive: isActive ?? current.is_active,
      actor: actor.email,
    });

    return ok({ staff: toRecord(data as StaffRow) });
  },
  { rateLimit: 'auth', name: 'admin.staff.update' }
);
