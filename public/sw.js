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

const VERSION = 'v2';
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

      await self.skipWaiting();
    })()
  );
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
          if (fresh.ok && OFFLINE_CRITICAL.some((path) => url.pathname.startsWith(path))) {
            const cache = await caches.open(PAGES_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await caches.match(request);
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

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '✈️ Domner App', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'domner-flight',
      renotify: true,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const win of windows) {
        if ('focus' in win) {
          // navigate() is not implemented everywhere; falling through to
          // openWindow is better than throwing inside the handler.
          if (typeof win.navigate === 'function') {
            try {
              await win.navigate(target);
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
