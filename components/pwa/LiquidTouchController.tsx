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

    const reset = (el: HTMLElement) => {
      el.style.setProperty('--gx', '50%');
      el.style.setProperty('--gy', '0%');
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
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--gx', `${event.clientX - rect.left}px`);
        el.style.setProperty('--gy', `${event.clientY - rect.top}px`);
      }
    };

    const release = () => {
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
    };
  }, []);

  return null;
}
