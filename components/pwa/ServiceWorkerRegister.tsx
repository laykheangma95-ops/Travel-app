'use client';

import { useEffect, useRef, useState } from 'react';

// Registers the progressive-enhancement layer without making a deployment
// interrupt a checkout, itinerary edit, or other in-progress task. A new
// worker waits until the traveler explicitly accepts the update below.
export function ServiceWorkerRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const refreshAfterUpdate = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    let registration: ServiceWorkerRegistration | null = null;

    const onControllerChange = () => {
      if (refreshAfterUpdate.current) window.location.reload();
    };

    const watchInstallingWorker = () => {
      const installing = registration?.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          setWaitingWorker(registration?.waiting ?? installing);
        }
      });
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((nextRegistration) => {
        registration = nextRegistration;
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener('updatefound', watchInstallingWorker);
      })
      .catch(() => {
        // The web app stays fully usable when storage or service workers are
        // unavailable (for example, a restrictive browser privacy setting).
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      registration?.removeEventListener('updatefound', watchInstallingWorker);
    };
  }, []);

  const update = () => {
    if (!waitingWorker) return;
    refreshAfterUpdate.current = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    setWaitingWorker(null);
  };

  if (!waitingWorker) return null;

  return (
    <aside className="pwa-update-notice" aria-label="Application update" role="status">
      <p>A new version of Domner is ready.</p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => setWaitingWorker(null)} className="pwa-update-dismiss">
          Later
        </button>
        <button type="button" onClick={update} className="pwa-update-action">
          Update
        </button>
      </div>
    </aside>
  );
}
