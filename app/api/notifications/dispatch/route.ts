// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications/dispatch — the only way into the priority engine.
//
// ADMIN SESSION OR SERVICE TOKEN ONLY. This endpoint writes a card into
// someone's inbox and can buzz their phone under the Domner name, so it is
// gated exactly like the existing PUT /api/notifications send path: a staff
// session, or the DOMNER_SERVICE_TOKEN that the scheduled jobs hold.
//
// The kind must exist in lib/notifications/catalog.ts. The engine decides the
// level, the deep link, whether the traveler asked for it, and whether now is a
// reasonable moment — the caller cannot override any of that, which is what
// stops a marketing job from marking itself critical.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireAdminOrService } from '@/lib/serverAuth';
import { isNotificationKind } from '@/lib/notifications/catalog';
import { notify } from '@/lib/notifications/engine';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dispatchSchema = z.object({
  userId: z.string().uuid(),
  kind: z.string().min(3).max(64),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().max(300).optional(),
  target: z
    .object({
      flightNumber: z.string().trim().max(10).optional(),
      tripId: z.string().uuid().optional(),
      orderNumber: z.string().trim().max(40).optional(),
      destinationSlug: z.string().trim().max(60).optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  dedupeKey: z.string().trim().max(200).optional(),
  inboxOnly: z.boolean().optional(),
});

export const POST = route(
  async (request) => {
    await requireAdminOrService(request);

    const parsed = dispatchSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError('BAD_REQUEST', issue?.message ?? 'Invalid notification.');
    }

    const input = parsed.data;
    if (!isNotificationKind(input.kind)) {
      // Deliberately not "guess a sensible level" — an unknown kind has no
      // preference switch behind it, so sending it would be sending something
      // the traveler has no way to turn off.
      throw new ApiError('BAD_REQUEST', `Unknown notification kind: ${input.kind}`);
    }

    const result = await notify({ ...input, kind: input.kind });
    log.info('notifications.dispatch', {
      kind: input.kind,
      pushed: result.pushed,
      reason: result.reason,
    });

    return ok(result);
  },
  { rateLimit: 'notifications', name: 'notifications.dispatch' }
);
