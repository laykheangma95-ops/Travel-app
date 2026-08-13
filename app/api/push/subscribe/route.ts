// ─────────────────────────────────────────────────────────────────────────────
// Web push subscription management.
//
//   GET    — is push available, and is this caller subscribed?
//   POST   — register (or refresh) this device's subscription
//   DELETE — unsubscribe this device
//
// WHY SIGN-IN IS REQUIRED HERE:
//   A subscription is a channel into someone's phone. Anonymous subscriptions
//   would give us a pile of devices we cannot attribute, cannot apply
//   preferences to, and cannot let anyone turn off from another device. This is
//   one of the places the brief calls for contextual authentication (§26): a
//   guest may browse and buy, but "notify me" needs an account to notify.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser } from '@/lib/serverAuth';
import { vapidPublicKey, webPushConfigured } from '@/lib/push/webPush';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  // The push service endpoint. Length-capped because it is stored and indexed.
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(256),
  }),
  lang: z.enum(['km', 'en']).optional(),
  userAgent: z.string().max(400).optional(),
});

export const GET = route(
  async (request) => {
    const available = webPushConfigured();
    const supabase = getSupabaseAdmin();

    let subscribed = false;
    if (available && supabase) {
      try {
        const user = await requireUser(request);
        const { count } = await supabase
          .from('push_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('provider', 'webpush')
          .eq('is_active', true);
        subscribed = (count ?? 0) > 0;
      } catch {
        // Signed out — "not subscribed" is the correct answer, not an error.
        subscribed = false;
      }
    }

    return ok({ available, subscribed, publicKey: vapidPublicKey() });
  },
  { rateLimit: 'session', name: 'push.status' }
);

export const POST = route(
  async (request) => {
    const user = await requireUser(request);

    const parsed = subscribeSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      throw new ApiError('BAD_REQUEST', 'That push subscription is not valid.');
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      // Demo mode: the browser subscription is real but there is nowhere to
      // keep it. Say so rather than reporting success.
      return ok({ ok: true, persisted: false });
    }

    const { endpoint, keys, lang, userAgent } = parsed.data;

    // onConflict on the endpoint keeps one row per device. Re-subscribing after
    // the browser rotated the endpoint creates a new row; the old one is
    // deactivated by the sender the first time it answers 410.
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        provider: 'webpush',
        endpoint,
        p256dh: keys.p256dh,
        auth_secret: keys.auth,
        device_type: 'web',
        user_agent: userAgent ?? null,
        lang: lang ?? null,
        is_active: true,
        failed_at: null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      log.warn('push.subscribe_failed', { error: error.message });
      throw new ApiError('INTERNAL', 'Could not save your notification settings.');
    }

    return ok({ ok: true, persisted: true });
  },
  { rateLimit: 'notifications', name: 'push.subscribe' }
);

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

export const DELETE = route(
  async (request) => {
    const user = await requireUser(request);

    const parsed = unsubscribeSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Missing subscription endpoint.');

    const supabase = getSupabaseAdmin();
    if (!supabase) return ok({ ok: true, persisted: false });

    // Scoped to the caller's own rows: an endpoint is guessable in principle,
    // and unsubscribing someone else's phone must not be possible.
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', parsed.data.endpoint);

    return ok({ ok: true, persisted: true });
  },
  { rateLimit: 'notifications', name: 'push.unsubscribe' }
);
