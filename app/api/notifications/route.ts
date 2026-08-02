// ─────────────────────────────────────────────────────────────────────────────
// Flight alert registration and delivery.
//
//   POST /api/notifications — a traveler registers alerts for a flight
//   PUT  /api/notifications — the alert job sends a push (ADMIN OR SERVICE ONLY)
//
// The PUT handler used to be completely open: anyone could POST an arbitrary
// FCM token and an arbitrary event and we would deliver a push notification
// carrying the Domner brand. It now requires an admin session or the
// DOMNER_SERVICE_TOKEN that the scheduled job holds.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendPushNotification, notificationTemplates } from '@/lib/firebase';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { getUser, requireAdminOrService } from '@/lib/serverAuth';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  flightNumber: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[A-Za-z0-9\s]+$/, 'That does not look like a flight number.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.'),
  preferences: z
    .object({
      gateChange: z.boolean().optional(),
      delay: z.boolean().optional(),
      boarding: z.boolean().optional(),
      landing: z.boolean().optional(),
      contact: z.string().max(120).optional(),
      language: z.enum(['km', 'en']).optional(),
    })
    .optional(),
  fcmToken: z.string().trim().max(512).optional(),
});

export const POST = route(
  async (request) => {
    const parsed = registerSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError('BAD_REQUEST', issue?.message ?? 'Invalid alert registration.');
    }

    const input = parsed.data;
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return ok({ ok: true, persisted: false });
    }

    // Attach the alert to the signed-in traveler when there is one, so it shows
    // up in their dashboard and is covered by RLS. Guests are still allowed —
    // this is the pre-flight anxiety moment, not the place to force a signup.
    const user = await getUser(request);

    const { error } = await supabase.from('saved_flights').upsert(
      {
        user_id: user?.id ?? null,
        guest_email: user ? null : (input.preferences?.contact ?? null),
        flight_number: input.flightNumber.replace(/\s+/g, '').toUpperCase(),
        flight_date: input.date,
        notify_gate_change: input.preferences?.gateChange ?? true,
        notify_delay: input.preferences?.delay ?? true,
        notify_boarding: input.preferences?.boarding ?? true,
        notify_landing: input.preferences?.landing ?? true,
      },
      { onConflict: 'user_id,flight_number,flight_date', ignoreDuplicates: false }
    );

    if (error) {
      log.warn('notifications.register_failed', { error });
      throw new ApiError('INTERNAL', 'Could not register the alert. Please try again.');
    }

    if (input.fcmToken) {
      // onConflict on the token keeps one row per device instead of a new row
      // on every page load.
      await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: user?.id ?? null, fcm_token: input.fcmToken, device_type: 'web' },
          { onConflict: 'fcm_token' }
        );
    }

    return ok({ ok: true, persisted: true });
  },
  { rateLimit: 'notifications', name: 'notifications.register' }
);

const sendSchema = z.object({
  event: z.enum(['gateChange', 'delay', 'boarding', 'landed']),
  flight: z.string().trim().min(2).max(10),
  fcmToken: z.string().trim().min(8).max(512),
  language: z.enum(['km', 'en']).default('km'),
  params: z.record(z.union([z.string(), z.number()])).default({}),
});

export const PUT = route(
  async (request) => {
    // Admin session or the scheduled job's service token. Nothing else.
    await requireAdminOrService(request);

    const parsed = sendSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError('BAD_REQUEST', issue?.message ?? 'Invalid notification payload.');
    }

    const { event, flight, fcmToken, language, params } = parsed.data;

    const message = (() => {
      switch (event) {
        case 'gateChange':
          return notificationTemplates.gateChange(
            flight,
            String(params.oldGate ?? '?'),
            String(params.newGate ?? '?')
          )[language];
        case 'delay':
          return notificationTemplates.delay(
            flight,
            Number(params.minutes ?? 0),
            String(params.newTime ?? '?')
          )[language];
        case 'boarding':
          return notificationTemplates.boarding(flight, String(params.gate ?? '?'))[language];
        case 'landed':
          return notificationTemplates.landed(flight, String(params.city ?? ''))[language];
      }
    })();

    const sent = await sendPushNotification(fcmToken, {
      ...message,
      url: `/flights/${flight.replace(/\s+/g, '')}`,
    });

    log.info('notifications.sent', { event, flight, sent });
    return ok({ ok: true, sent });
  },
  { rateLimit: 'notifications', name: 'notifications.send' }
);
