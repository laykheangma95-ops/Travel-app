// ─────────────────────────────────────────────────────────────────────────────
// POST /api/imports/reap — fail every import job stuck in `processing`.
//
// ADMIN SESSION OR SERVICE TOKEN ONLY, exactly like
// app/api/notifications/dispatch/route.ts — the pattern docs/SOCIAL-SAVE.md
// §1.14 already documents as how a scheduled job runs here: "there is no
// worker to run a job on... any job must be... polled by an authenticated
// endpoint an external scheduler calls." See lib/serverAuth.ts's
// DOMNER_SERVICE_TOKEN.
//
// NOTHING CALLS THIS ON A SCHEDULE TODAY. There is no flight-alert cron to
// compare it to either — vercel.json has never had a `crons` block, and
// nothing in this codebase has ever invoked a scheduled endpoint in
// production. This route is built, tested (tests/importReaper.test.ts) and
// safe to call any number of times from any number of callers at once, but
// until an operator points an external, authenticated POST at it on an
// interval, an import abandoned mid-flight stays 'processing' forever. See
// docs/PLACE-IMPORT.md, "Scheduling the reaper" for the exact production
// configuration this requires and why Vercel Cron is not it here.
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
