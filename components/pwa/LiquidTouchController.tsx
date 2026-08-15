'use client';

import { useEffect } from 'react';

// Progressive enhancement for the iOS "Liquid Glass" touch feel.
//
// A single delegated pointer listener tracks the finger/cursor over any element
// tagged `data-liquid` and writes its local position into --gx/--gy, which the
// `.liquid-touch` CSS reads to place a specular highlight under the touch point.
// Because it's global and delegated, individual components (Button, the Copilot
// button, cards) stay plain server components — they just add the class + attr.
//
// No JS = graceful fallback: the highlight simply centres via the CSS defaults.
export function LiquidTouchController() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;

    const reset = (el: HTMLElement) => {
      el.style.setProperty('--gx', '50%');
      el.style.setProperty('--gy', '0%');
    };

    const paint = () => {
      frame = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      pending = null;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--gx', `${x - rect.left}px`);
      el.style.setProperty('--gy', `${y - rect.top}px`);
    };

    const track = (event: PointerEvent) => {
      const target = event.target;
      const el =
        target instanceof Element
          ? (target.closest('[data-liquid]') as HTMLElement | null)
          : null;

      if (el !== current && current) reset(current);
      current = el;

      if (el) {
        pending = { el, x: event.clientX, y: event.clientY };
        // Pointer move can fire far faster than the screen can paint. One
        // measurement per frame keeps the highlight silky without forcing
        // layout work for every raw touch event.
        if (!frame) frame = window.requestAnimationFrame(paint);
      }
    };

    const release = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      if (current) reset(current);
      current = null;
    };

    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerdown', track, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });

    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerdown', track);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };
    const preventMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };

    document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
    document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
    document.addEventListener('gestureend', preventGestureZoom, { passive: false });
    document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', preventGestureZoom);
      document.removeEventListener('gesturechange', preventGestureZoom);
      document.removeEventListener('gestureend', preventGestureZoom);
      document.removeEventListener('touchmove', preventMultiTouchZoom);
    };
  }, []);

  return null;
}
