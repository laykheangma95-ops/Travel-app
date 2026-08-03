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
  active,
  onReady,
  onPhase,
  onArrivalProgress,
  onPinSelect,
}: {
  tier: Exclude<Tier, 'static'>;
  /** False once we have landed: the globe is not just invisible, it stops. */
  active: boolean;
  /** A lit city was pressed. */
  onPinSelect?: (slug: string) => void;
  onReady?: (api: GlobeApi) => void;
  onPhase?: (phase: FlightPhase, slug: string | null) => void;
  onArrivalProgress?: (arrival: number, skyColor: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onPinSelect);
  const activeRef = useRef(active);

  useEffect(() => {
    selectRef.current = onPinSelect;
  }, [onPinSelect]);
  const syncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    activeRef.current = active;
    syncRef.current?.();
  }, [active]);

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
        idleFps: settings.idleFps,
        flightFps: settings.targetFps,
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

      // Run only while visible, only while the tab is in front, and only while
      // the globe is actually part of what the visitor is looking at. Fading it
      // out but leaving the render loop running was costing a frame budget for
      // the entire time somebody read a destination guide.
      let inView = true;
      let visible = !document.hidden;
      const sync = () =>
        inView && visible && activeRef.current ? created.start() : created.stop();
      syncRef.current = sync;
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

      /* ── The globe is pressable ────────────────────────────────────────────
         The canvas sits behind the page at z-index -1, so it cannot receive
         events itself. Instead we hit-test document-level pointer moves against
         the projected pins and ignore anything aimed at the copy block, which
         is the only interactive region that overlaps.                        */
      const label = labelRef.current;
      let hovered: string | null = null;

      const overCopy = (e: PointerEvent | MouseEvent) =>
        (e.target as HTMLElement | null)?.closest('.v3-first, header, nav, button, a, input') != null;

      const onMove = (e: PointerEvent) => {
        if (!activeRef.current || overCopy(e)) {
          if (hovered) {
            hovered = null;
            controller.setHover(null);
            label?.classList.remove('is-on');
            wrap.classList.remove('is-pointing');
          }
          return;
        }
        const hit = controller.hitTest(e.clientX, e.clientY, wrap.clientWidth, wrap.clientHeight);
        hovered = hit?.slug ?? null;
        controller.setHover(hovered);
        wrap.classList.toggle('is-pointing', Boolean(hit));
        if (hit && label) {
          const meta = idlePins.find((p) => p.slug === hit.slug);
          label.textContent = meta?.label ?? '';
          label.style.transform = `translate(${hit.x}px, ${hit.y}px) translate(-50%, -180%)`;
          label.classList.add('is-on');
        } else {
          label?.classList.remove('is-on');
        }
      };

      const onClick = (e: MouseEvent) => {
        if (!activeRef.current || overCopy(e)) return;
        const hit = controller.hitTest(e.clientX, e.clientY, wrap.clientWidth, wrap.clientHeight);
        if (hit) selectRef.current?.(hit.slug);
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('click', onClick);

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
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('click', onClick);
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
      <div ref={labelRef} className="v3-pin-label" />
    </div>
  );
}
