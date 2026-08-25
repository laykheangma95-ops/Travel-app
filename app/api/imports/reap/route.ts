// ─────────────────────────────────────────────────────────────────────────────
// POST /api/imports/reap — fail every import job stuck in `processing`.
//
// ADMIN SESSION OR SERVICE TOKEN ONLY, exactly like
// app/api/notifications/dispatch/route.ts — the pattern docs/SOCIAL-SAVE.md
// §1.14 already documents as how a scheduled job runs here: "there is no
// worker to run a job on... any job must be... polled by an authenticated
// endpoint an external scheduler calls." The owner's cron hits this on the
// same footing as the flight-alert cron; see lib/serverAuth.ts's
// DOMNER_SERVICE_TOKEN.
//
// See lib/travel/importReaper.ts for what "stuck" means and why one UPDATE
// statement is the whole safety argument.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, route } from '@/lib/http';
import { requireAdminOrService } from '@/lib/serverAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { reapStuckImports } from '@/lib/travel/importReaper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    await requireAdminOrService(request);

    const admin = getSupabaseAdmin();
    if (!admin) return ok({ failed: 0, configured: false });

    const result = await reapStuckImports(admin);
    return ok({ failed: result.failed, configured: true });
  },
  { name: 'travel.imports.reap' }
);
