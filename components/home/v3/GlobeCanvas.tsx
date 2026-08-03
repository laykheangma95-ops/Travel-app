'use client';

// The WebGL layer. Dynamically imported and client-only, so three.js never
// touches the server bundle and never blocks the first paint — the greeting,
// the title and the search field are already on screen in static HTML before
// this file is even requested.
//
// It owns nothing about the page's meaning. It takes a target, flies there, and
// reports progress. Everything the visitor can actually read lives in the DOM.

import { useEffect, useRef } from 'react';
import { createGlobeEngine, type GlobeEngine } from '@/components/globe/globeEngine';
import {
  createFlightController,
  type FlightController,
  type FlightPhase,
  type FlightTarget,
} from '@/components/globe/flightController';
import { TIER_SETTINGS, createFrameWatchdog, type Tier } from '@/lib/tier';
import { idlePins } from '@/content/destinations';

export interface GlobeApi {
  flyTo(target: FlightTarget): void;
  returnToGlobe(): void;
}

export default function GlobeCanvas({
  tier,
  onReady,
  onPhase,
  onArrivalProgress,
}: {
  tier: Exclude<Tier, 'static'>;
  onReady?: (api: GlobeApi) => void;
  onPhase?: (phase: FlightPhase, slug: string | null) => void;
  onArrivalProgress?: (arrival: number, skyColor: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let disposed = false;
    let engine: GlobeEngine | null = null;
    let flight: FlightController | null = null;
    let cleanup: (() => void) | null = null;

    const settings = { ...TIER_SETTINGS[tier] };

    (async () => {
      const created = await createGlobeEngine(canvas, {
        isMobile: window.matchMedia('(pointer: coarse)').matches,
        dotCount: settings.dotCount,
        starCount: settings.starCount,
        maxDpr: settings.maxDpr,
        targetFps: settings.targetFps,
      });
      if (disposed) {
        created.dispose();
        return;
      }
      engine = created;

      const controller = createFlightController({
        engine: created,
        descend: settings.descend,
        durationMs: settings.flightMs,
        lodPatch: settings.lodPatch,
        terminator: settings.terminator,
        onPhase,
        onArrivalProgress,
      });
      flight = controller;
      controller.setPins(idlePins);

      const layout = () => {
        created.setViewport(wrap.clientWidth, wrap.clientHeight);
        // Framing depends on the aspect ratio, which is only known once the
        // viewport has been measured — so re-apply the pose after every resize.
        controller.refresh();
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(wrap);

      // If the device cannot hold the pace, drop the frame budget rather than
      // letting the whole page stutter. Measured, not guessed.
      if (tier === 'full') {
        const watchdog = createFrameWatchdog(() => {
          // Shed pixels first, then frames. Both are cheaper than a page that
          // stutters while someone is trying to read it.
          created.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
          created.setTargetFps(30);
          layout();
        });
        created.onFrame((dt) => watchdog(dt));
      }

      // Run only while visible and only while the tab is in front.
      let inView = true;
      let visible = !document.hidden;
      const sync = () => (inView && visible ? created.start() : created.stop());
      const io = new IntersectionObserver((entries) => {
        inView = entries.some((e) => e.isIntersecting);
        sync();
      });
      io.observe(wrap);
      const onVisibility = () => {
        visible = !document.hidden;
        sync();
      };
      document.addEventListener('visibilitychange', onVisibility);

      created.start();
      wrap.classList.add('v3-globe-on');
      onReady?.({
        flyTo: (t) => controller.flyTo(t),
        returnToGlobe: () => controller.returnToGlobe(),
      });

      cleanup = () => {
        ro.disconnect();
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
      };
    })().catch(() => {
      // WebGL or the dynamic import failed. The page is fully usable without
      // it — the static tier's poster is already behind this canvas.
      wrap.classList.add('v3-globe-failed');
    });

    return () => {
      disposed = true;
      cleanup?.();
      flight?.dispose();
      engine?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  return (
    <div ref={wrapRef} className="v3-globe-layer" aria-hidden="true">
      <canvas ref={canvasRef} className="v3-globe-canvas" />
    </div>
  );
}
