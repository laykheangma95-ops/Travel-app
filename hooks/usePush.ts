'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Web push subscription lifecycle, in one hook.
//
// The browser side of notifications is a sequence of things that can each fail
// independently — no service worker, no Push API, permission denied, a push
// service that refuses — and every one of them needs a different sentence in
// the UI. So this hook exposes a single `state` rather than a pile of booleans,
// and the components read it like a status.
//
// It deliberately does NOT request permission on mount. The permission prompt
// is triggered by an explicit user action, after we have explained what they
// get (§12 of the brief). A permission prompt fired on page load is how a site
// permanently loses the ability to ask.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';

export type PushState =
  /** Still working out what this browser can do. */
  | 'checking'
  /** No service worker or no Push API — iOS Safari in a browser tab, mostly. */
  | 'unsupported'
  /** Supported, but the server has no VAPID keys configured. */
  | 'unconfigured'
  /** Ready to ask. */
  | 'prompt'
  /** The traveler said no. Only they can undo this, in browser settings. */
  | 'denied'
  /** Subscribed and stored. */
  | 'subscribed';

interface UsePushResult {
  state: PushState;
  busy: boolean;
  /** Explains the last failure in plain language, for display. */
  error: string | null;
  /** Asks for permission and registers the subscription. Call from a click. */
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
}

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 *
 * Returns the ArrayBuffer rather than the view: `applicationServerKey` takes a
 * BufferSource, and a plain ArrayBuffer sidesteps the Uint8Array<ArrayBufferLike>
 * variance that TypeScript 5.7 rejects for a typed-array view.
 */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
}

export function usePush(): UsePushResult {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        typeof Notification === 'undefined'
      ) {
        if (!cancelled) setState('unsupported');
        return;
      }

      let available = false;
      let subscribedOnServer = false;
      try {
        const res = await fetch('/api/push/subscribe', { credentials: 'include' });
        if (res.ok) {
          const body = (await res.json()) as {
            available?: boolean;
            subscribed?: boolean;
            publicKey?: string | null;
          };
          available = body.available === true;
          subscribedOnServer = body.subscribed === true;
          if (!cancelled) setPublicKey(body.publicKey ?? null);
        }
      } catch {
        // Offline. Fall through to the permission state, which is still true.
      }

      if (cancelled) return;

      if (!available) {
        setState('unconfigured');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      if (Notification.permission === 'granted' && subscribedOnServer) {
        setState('subscribed');
        return;
      }
      setState('prompt');
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'prompt');
        return false;
      }

      // The service worker is registered by ServiceWorkerRegister on every
      // page; `ready` waits for it rather than racing it.
      const registration = await navigator.serviceWorker.ready;

      // An existing subscription is reused. Calling subscribe() twice with a
      // different applicationServerKey throws, and re-subscribing needlessly
      // invalidates the endpoint we already stored.
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          // Required by every browser: a push that cannot be shown is not
          // allowed to arrive silently.
          userVisibleOnly: true,
          applicationServerKey: publicKey ? urlBase64ToBuffer(publicKey) : undefined,
        }));

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        setError('This browser returned an incomplete subscription.');
        return false;
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent.slice(0, 400),
        }),
      });

      if (!res.ok) {
        // 401 is the common one: they granted permission while signed out.
        setError(
          res.status === 401
            ? 'Sign in to receive travel alerts on this device.'
            : 'Could not save your alert settings. Please try again.'
        );
        return false;
      }

      setState('subscribed');
      return true;
    } catch (cause) {
      setError((cause as Error).message || 'Could not turn on notifications.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Tell the server first: if unsubscribe() succeeds and the DELETE does
        // not, we would keep pushing to a dead endpoint forever.
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState('prompt');
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
}
