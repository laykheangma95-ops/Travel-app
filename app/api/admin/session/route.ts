// GET /api/admin/session — is the caller an admin?
//
// The browser uses this to decide what to render. It is NOT the security
// boundary: every admin endpoint independently calls requireAdmin(), so forcing
// this response to `true` in devtools reveals an empty panel and nothing else.

import { ok, route } from '@/lib/http';
import { getUser, isAdminEmail } from '@/lib/auth';
import { adminConfigured } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const user = await getUser(request);
    const admin = isAdminEmail(user?.email);

    return ok({
      admin,
      signedIn: user !== null,
      // Surfaced so the panel can tell an operator "no allowlist configured"
      // instead of silently refusing them.
      allowlistConfigured: adminConfigured(),
    });
  },
  { rateLimit: 'auth', name: 'admin.session' }
);
