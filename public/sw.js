// ─────────────────────────────────────────────────────────────────────────────
// Domner App service worker.
//
//   1. Push notifications for flight alerts
//   2. Offline caching
//
// WHY THE CACHE EXISTS:
//   The app promises that Emergency Phrases "works offline". It did not — there
//   was no fetch handler at all, so a traveler with no data in a foreign airport
//   got the browser's offline page. That is the exact moment the feature is
//   supposed to earn its place.
//
// STRATEGY:
//   • Navigations      → network-first, falling back to the cached page, then
//                        to a friendly offline page. Never serve a stale price.
//   • Static assets    → stale-while-revalidate (fast, self-healing)
//   • Offline-critical → cached on install and served cache-first
//   • API calls        → never cached. Flight status and prices must be live or
//                        absent; a stale gate number is worse than no gate.
// ─────────────────────────────────────────────────────────────────────────────

const VERSION = 'v4';
const STATIC_CACHE = `domner-static-${VERSION}`;
const PAGES_CACHE = `domner-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';

// Pages a traveler may genuinely need with no connectivity.
const OFFLINE_CRITICAL = ['/emergency', '/airport-guide', '/checklist'];

const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // addAll is atomic — one 404 would discard the whole precache — so each
      // entry is fetched independently and a failure is tolerated.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));

      const pages = await caches.open(PAGES_CACHE);
      await Promise.allSettled(OFFLINE_CRITICAL.map((url) => pages.add(url)));

    })()
  );
});

// A new worker waits by default so a deployment cannot replace JavaScript while
// someone is completing checkout or editing a trip. The client only sends this
// message after the traveler chooses “Update”.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions so a deploy cannot leave stale pricing
      // or stale copy on a returning device.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('domner-') && !key.endsWith(VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

function isOfflineCriticalPath(pathname) {
  return OFFLINE_CRITICAL.includes(pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle our own origin. Third-party requests (ADS-B tiles, fonts) are
  // left entirely to the browser.
  if (url.origin !== self.location.origin) return;

  // Never cache API responses. Flight status, order state and prices must come
  // from the network or not at all.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Only cache pages that are safe to show offline later.
          if (fresh.ok && isOfflineCriticalPath(url.pathname)) {
            const cache = await caches.open(PAGES_CACHE);
            await cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          const pages = await caches.open(PAGES_CACHE);
          const cached = isOfflineCriticalPath(url.pathname)
            ? await pages.match(url.pathname, { ignoreSearch: true })
            : undefined;
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })()
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);

        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);

        // Stale-while-revalidate: instant from cache, refreshed in background.
        return cached ?? network;
      })()
    );
  }
});

// ── Push notifications ───────────────────────────────────────────────────────
//
// Two senders share this handler:
//   • Firebase Cloud Messaging, for the legacy flight-alert tokens
//   • the standard Web Push API (lib/push/webPush.ts), for everything new
//
// Both send the same JSON shape, so nothing here needs to know which arrived.

const FALLBACK_URL = '/updates';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A push service is allowed to deliver a bare string. Better a notification
    // with only a body than a swallowed one.
    data = { body: event.data ? event.data.text() : '' };
  }

  // Deep-linking is the whole point (§15): a gate change opens THAT flight. If
  // a sender ever omits the url we land on the inbox, never the homepage —
  // the inbox at least still contains the message.
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : FALLBACK_URL;

  event.waitUntil(
    self.registration.showNotification(data.title || 'Domner', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // The tag collapses repeats about the same subject: a second gate update
      // for one flight replaces the first rather than stacking.
      tag: data.tag || 'domner',
      renotify: true,
      // Only level 1 asks the OS to hold the notification until it is dealt
      // with. Anything quieter must not sit on someone's lock screen.
      requireInteraction: data.requireInteraction === true,
      data: { url, notificationId: data.notificationId ?? null },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || FALLBACK_URL;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Prefer a tab already showing the destination — focusing it beats
      // re-navigating and losing whatever state it had.
      for (const win of windows) {
        try {
          if (new URL(win.url).pathname === new URL(target, self.location.origin).pathname) {
            return win.focus();
          }
        } catch {
          /* an unparseable client URL is not worth failing the click over */
        }
      }

      for (const win of windows) {
        if ('focus' in win) {
          // navigate() is not implemented everywhere; falling through to
          // openWindow is better than throwing inside the handler.
          if (typeof win.navigate === 'function') {
            try {
              await win.navigate(target);
              return win.focus();
            } catch {
              /* fall through to focus */
            }
          }
          return win.focus();
        }
      }

      return self.clients.openWindow(target);
    })()
  );
});
