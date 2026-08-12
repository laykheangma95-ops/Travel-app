// ─────────────────────────────────────────────────────────────────────────────
// Staff management. Requires 'staff.manage', which only `admin` holds.
//
//   GET   /api/admin/staff   — list staff and their roles
//   POST  /api/admin/staff   — invite someone by email, with a role
//   PATCH /api/admin/staff   — change a role, or activate/deactivate
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
import { log } from '@/lib/logger';

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
  const { data } = await supabase
    .from('staff_users')
    .select('email')
    .eq('role', 'admin')
    .eq('is_active', true);

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
      log.error('staff.list_failed', { error });
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
      log.error('staff.invite_failed', { error });
      throw new ApiError('INTERNAL', 'Could not add that staff member.');
    }

    await recordStaffEvent({
      staffEmail: email,
      eventType: 'staff.invited',
      toRole: parsed.data.role,
      actor: actor.email,
    });

    return ok({ staff: toRecord(data as StaffRow) });
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

    const { data: existing } = await db()
      .from('staff_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

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
      log.error('staff.update_failed', { error });
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
