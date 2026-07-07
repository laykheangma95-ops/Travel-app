'use client';

import { useEffect } from 'react';

// Registers the service worker so the app can be installed to the home
// screen and receive push notifications.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration is best-effort; the site works fully without it.
      });
    }
  }, []);

  return null;
}
