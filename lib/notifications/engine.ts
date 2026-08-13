// ─────────────────────────────────────────────────────────────────────────────
// The notification priority engine.
//
// Everything that wants to tell a traveler something goes through notify().
// It decides, in this order:
//
//   1. Is this kind known?          — unknown kinds are rejected, not guessed
//   2. Has the traveler asked for it? — the preference switch
//   3. Is it a duplicate?           — dedupe_key, enforced by a unique index
//   4. Should it push, or only sit in the inbox?
//   5. Is now a reasonable moment?  — quiet hours, and a per-level cooldown
//
// The inbox row is always written when steps 1–3 pass. Push is a delivery
// channel for it, not the notification itself: a traveler on iOS Safari without
// the app installed, or who denied permission, still sees their gate change.
//
// SERVER ONLY — it holds the service role client. Never import from a
// 'use client' component; import lib/notifications/catalog.ts instead.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { sendWebPush, webPushConfigured } from '@/lib/push/webPush';
import {
  deepLinkFor,
  isNotificationKind,
  specFor,
  type DeepLinkTarget,
  type NotificationKind,
  type NotificationLevel,
} from './catalog';
import { withDefaults, type NotificationPreferences } from './preferences';

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** Resolves the deep link. A notification with no target lands on a list page. */
  target?: DeepLinkTarget;
  metadata?: Record<string, unknown>;
  /**
   * Overrides the derived dedupe key. Include every value that makes the event
   * distinct: 'flight.gate_change:SQ123:2026-09-18:B12' fires once for gate B12
   * however many times the poller sees it.
   */
  dedupeKey?: string;
  /** Skips the push step. The card still lands in the inbox. */
  inboxOnly?: boolean;
}

export interface NotifyResult {
  ok: boolean;
  /** Why nothing was created or pushed. Useful in logs and in the dispatch response. */
  reason?: 'unconfigured' | 'unknown_kind' | 'muted' | 'duplicate' | 'write_failed';
  notificationId?: string;
  pushed: boolean;
  /** How many devices accepted the push. */
  devices?: number;
}

/**
 * How long to stay quiet after the last push, per level. A gate change never
 * waits. A weather note can.
 */
const COOLDOWN_MINUTES: Record<NotificationLevel, number> = {
  1: 0,
  2: 5,
  3: 90,
  4: Number.POSITIVE_INFINITY, // level 4 is never pushed at all
};

async function loadPreferences(userId: string): Promise<NotificationPreferences> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return withDefaults(null);

  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return withDefaults(data as Partial<NotificationPreferences> | null);
}

/**
 * True when local time is inside the traveler's quiet window. Handles the
 * overnight case (22 → 07) as well as the same-day one.
 *
 * The timezone is the traveler's own — a Cambodian in Tokyo has quiet hours in
 * Tokyo, because that is where they are asleep.
 */
function inQuietHours(prefs: NotificationPreferences, now = new Date()): boolean {
  const { quiet_hours_start: start, quiet_hours_end: end } = prefs;
  if (start === null || end === null || start === end) return false;

  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hour12: false,
        timeZone: prefs.timezone ?? 'Asia/Phnom_Penh',
      }).format(now)
    );
  } catch {
    // An invalid stored timezone must not silence a notification.
    return false;
  }

  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Has anything been pushed to this traveler recently enough to bundle against? */
async function pushedWithinMinutes(userId: string, minutes: number): Promise<boolean> {
  if (minutes <= 0) return false;
  if (!Number.isFinite(minutes)) return true;

  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('pushed_at', since);

  return (count ?? 0) > 0;
}

function preferenceAllows(prefs: NotificationPreferences, kind: NotificationKind): boolean {
  const { preference } = specFor(kind);
  // A kind with no preference key is account correspondence — a failed
  // fulfilment, a refund. Those are not marketing and cannot be switched off.
  if (preference === null) return true;
  return prefs[preference] === true;
}

/**
 * Record the notification and, when it earns it, push it.
 *
 * Never throws. A notification that cannot be delivered must not take down the
 * checkout, the webhook or the poller that triggered it.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    log.info('notify.unconfigured', { kind: input.kind, title: input.title });
    return { ok: false, reason: 'unconfigured', pushed: false };
  }

  if (!isNotificationKind(input.kind)) {
    return { ok: false, reason: 'unknown_kind', pushed: false };
  }

  const spec = specFor(input.kind);
  const prefs = await loadPreferences(input.userId);

  if (!preferenceAllows(prefs, input.kind)) {
    return { ok: false, reason: 'muted', pushed: false };
  }

  const deepLink = deepLinkFor(input.kind, input.target);
  const dedupeKey =
    input.dedupeKey ??
    [
      input.kind,
      input.target?.flightNumber ?? '',
      input.target?.tripId ?? '',
      input.target?.orderNumber ?? '',
      input.target?.destinationSlug ?? '',
    ]
      .filter(Boolean)
      .join(':');

  const expiresAt =
    spec.ttlMinutes === null ? null : new Date(Date.now() + spec.ttlMinutes * 60_000).toISOString();

  const { data: row, error } = await supabase
    .from('notifications')
    .insert({
      user_id: input.userId,
      category: spec.category,
      kind: input.kind,
      level: spec.level,
      title: input.title,
      body: input.body ?? null,
      deep_link: deepLink,
      entity_type: input.target?.flightNumber
        ? 'flight'
        : input.target?.tripId
          ? 'trip'
          : input.target?.orderNumber
            ? 'order'
            : input.target?.destinationSlug
              ? 'destination'
              : null,
      entity_id:
        input.target?.flightNumber ??
        input.target?.tripId ??
        input.target?.orderNumber ??
        input.target?.destinationSlug ??
        null,
      metadata: input.metadata ?? {},
      dedupe_key: dedupeKey || null,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) {
    // 23505 is the unique violation on (user_id, dedupe_key) — the same event
    // seen twice. That is the engine working, not a failure.
    if (error.code === '23505') {
      return { ok: true, reason: 'duplicate', pushed: false };
    }
    log.warn('notify.insert_failed', { kind: input.kind, error: error.message });
    return { ok: false, reason: 'write_failed', pushed: false };
  }

  const notificationId = row.id as string;

  // ── Should it push? ────────────────────────────────────────────────────────

  if (input.inboxOnly || spec.level === 4 || !prefs.push_enabled) {
    return { ok: true, notificationId, pushed: false };
  }

  // Level 1 ignores quiet hours by design: being asleep in a transit hotel is
  // exactly when a gate change matters most.
  if (spec.level > 1 && inQuietHours(prefs)) {
    return { ok: true, notificationId, pushed: false };
  }

  if (await pushedWithinMinutes(input.userId, COOLDOWN_MINUTES[spec.level])) {
    return { ok: true, notificationId, pushed: false };
  }

  const delivered = await pushToDevices(input.userId, {
    notificationId,
    title: input.title,
    body: input.body ?? '',
    url: deepLink,
    tag: `${spec.category}:${input.target?.flightNumber ?? input.target?.tripId ?? input.kind}`,
    level: spec.level,
  });

  await supabase
    .from('notifications')
    .update({
      pushed_at: delivered.sent > 0 ? new Date().toISOString() : null,
      push_attempts: delivered.attempted,
      push_error: delivered.sent > 0 ? null : (delivered.error ?? null),
    })
    .eq('id', notificationId);

  return { ok: true, notificationId, pushed: delivered.sent > 0, devices: delivered.sent };
}

interface PushBody {
  notificationId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  level: NotificationLevel;
}

/**
 * Fan the payload out to every active web-push device the traveler registered.
 *
 * A push service that answers 404 or 410 is telling us the subscription is dead
 * (browser data cleared, app uninstalled). We deactivate the row rather than
 * deleting it, so the next send skips it without losing the history.
 */
async function pushToDevices(
  userId: string,
  payload: PushBody
): Promise<{ attempted: number; sent: number; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { attempted: 0, sent: 0, error: 'unconfigured' };
  if (!webPushConfigured()) return { attempted: 0, sent: 0, error: 'vapid_not_configured' };

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret')
    .eq('user_id', userId)
    .eq('provider', 'webpush')
    .eq('is_active', true);

  if (!subs || subs.length === 0) return { attempted: 0, sent: 0, error: 'no_devices' };

  let sent = 0;
  let lastError: string | undefined;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendWebPush(
        {
          endpoint: sub.endpoint as string,
          keys: { p256dh: sub.p256dh as string, auth: sub.auth_secret as string },
        },
        payload
      );
      if (result.ok) {
        sent += 1;
        return;
      }
      lastError = result.error;
      if (result.gone) dead.push(sub.id as string);
    })
  );

  if (dead.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false, failed_at: new Date().toISOString() })
      .in('id', dead);
  }

  return { attempted: subs.length, sent, error: lastError };
}
