// GET /api/admin/session — who is the caller, and what may they do?
//
// The browser uses this to decide what to render. It is NOT the security
// boundary: every admin endpoint independently calls requirePermission(), so
// forcing this response in devtools reveals a panel whose every button 403s.
//
// Returning the permission list rather than the role keeps the UI honest — it
// hides a tab because the caller lacks the capability, not because a component
// hardcoded which roles "look like" admins.

import { ok, route } from '@/lib/http';
import { getUser } from '@/lib/serverAuth';
import { adminConfigured } from '@/lib/env';
import { mfaRequired, resolveStaff } from '@/lib/staff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const user = await getUser(request);
    const staff = user ? await resolveStaff(user.id, user.email) : null;

    // Deactivated, or MFA required but not enrolled: signed in as staff, but
    // holding nothing. The UI needs to say which, so it can tell them what to
    // do rather than showing a blank panel.
    const blockedReason = !staff
      ? null
      : !staff.isActive
        ? 'deactivated'
        : mfaRequired() && !staff.mfaEnrolled
          ? 'mfa_required'
          : null;

    const effective = staff && blockedReason === null ? staff : null;

    return ok({
      signedIn: user !== null,
      // Retained for the existing gate: true when the caller holds any staff
      // authority at all.
      admin: effective !== null,
      role: effective?.role ?? null,
      permissions: effective?.permissions ?? [],
      viaBootstrap: effective?.viaBootstrap ?? false,
      blockedReason,
      allowlistConfigured: adminConfigured(),
    });
  },
  { rateLimit: 'auth', name: 'admin.session' }
);
