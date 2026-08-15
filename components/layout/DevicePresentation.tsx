'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * The one browser-aware decision point for device-specific presentation.
 *
 * Feature data, mutations, and route ownership stay shared. Components that
 * genuinely need a different mobile presentation can read this context, while
 * CSS remains the default for simple responsive layout changes.
 */
export type DevicePresentation = {
  device: 'mobile' | 'desktop';
  isStandalone: boolean;
  isReady: boolean;
};

const DevicePresentationContext = createContext<DevicePresentation>({
  device: 'desktop',
  isStandalone: false,
  isReady: false,
});

const MOBILE_QUERY = '(max-width: 1023px)';
const STANDALONE_QUERY = '(display-mode: standalone)';

function readStandalone(standaloneQuery: MediaQueryList): boolean {
  return (
    standaloneQuery.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function DevicePresentationProvider({ children }: { children: ReactNode }) {
  const [presentation, setPresentation] = useState<DevicePresentation>({
    device: 'desktop',
    isStandalone: false,
    isReady: false,
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia(MOBILE_QUERY);
    const standaloneQuery = window.matchMedia(STANDALONE_QUERY);

    const update = () => {
      const next: DevicePresentation = {
        device: mobileQuery.matches ? 'mobile' : 'desktop',
        isStandalone: readStandalone(standaloneQuery),
        isReady: true,
      };

      setPresentation(next);
      document.documentElement.dataset.domnerDevice = next.device;
      document.documentElement.dataset.domnerDisplayMode = next.isStandalone
        ? 'standalone'
        : 'browser';
    };

    update();
    mobileQuery.addEventListener('change', update);
    standaloneQuery.addEventListener('change', update);

    return () => {
      mobileQuery.removeEventListener('change', update);
      standaloneQuery.removeEventListener('change', update);
      delete document.documentElement.dataset.domnerDevice;
      delete document.documentElement.dataset.domnerDisplayMode;
    };
  }, []);

  return (
    <DevicePresentationContext.Provider value={presentation}>
      {children}
    </DevicePresentationContext.Provider>
  );
}

export function useDevicePresentation(): DevicePresentation {
  return useContext(DevicePresentationContext);
}
