// ─────────────────────────────────────────────────────────────────────────────
// Web Push (VAPID) delivery.
//
// The standard Push API path, used by the service worker in public/sw.js. This
// is separate from lib/firebase.ts on purpose: FCM already carries the legacy
// flight-alert tokens, and ripping it out would break a working integration.
// New subscriptions use the open standard, which needs no Google project and no
// SDK on the client.
//
// Follows the repo convention (CLAUDE.md §11): with no VAPID keys configured
// this degrades to a logged no-op, so the app still runs with an empty .env.
//
// SERVER ONLY.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { log } from '@/lib/logger';

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface WebPushPayload {
  notificationId?: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
  level?: number;
}

export interface WebPushResult {
  ok: boolean;
  /** True when the push service says this subscription no longer exists (404/410). */
  gone?: boolean;
  error?: string;
}

function vapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  // The subject identifies us to the push service so it has someone to contact
  // about a misbehaving sender. A mailto: or https: URL, per RFC 8292.
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@domnerapp.com';
  return { publicKey, privateKey, subject };
}

export function webPushConfigured(): boolean {
  return vapidKeys() !== null;
}

/** The key the browser needs to create a subscription. Safe to expose. */
export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

/**
 * Encrypt and deliver one notification to one device.
 *
 * `web-push` is imported lazily so a deploy with no VAPID keys never pulls the
 * crypto path into the bundle, and so this module stays importable from an edge
 * context that only wants webPushConfigured().
 */
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: WebPushPayload
): Promise<WebPushResult> {
  const keys = vapidKeys();
  if (!keys) {
    log.info('webpush.demo', { title: payload.title, url: payload.url });
    return { ok: false, error: 'vapid_not_configured' };
  }

  try {
    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        notificationId: payload.notificationId,
        // Level 1 asks the OS to interrupt. Anything quieter should not vibrate
        // a phone that is already in someone's pocket at the gate.
        requireInteraction: payload.level === 1,
      }),
      {
        // A boarding call is worthless in ten minutes; a deal can wait.
        TTL: payload.level === 1 ? 900 : 3600 * 6,
        urgency: payload.level === 1 ? 'high' : 'normal',
      }
    );

    return { ok: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    // 404 Not Found / 410 Gone: the subscription is dead. The caller
    // deactivates it so we stop retrying forever.
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, gone: true, error: `subscription_gone_${statusCode}` };
    }
    log.warn('webpush.send_failed', { statusCode, error: (error as Error).message });
    return { ok: false, error: `push_failed_${statusCode ?? 'unknown'}` };
  }
}
