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

    // Liquid ripple: on press, a gold bloom expands from the touch point and
    // settles — the glass surface reacts like liquid. The span is appended at
    // z-index:-1 (behind the label, above the tint) and self-removes when its
    // animation ends. Buttons already provide `position: relative; overflow:
    // hidden` via the liquid-glass recipe, so the ripple clips to their shape.
    const ripple = (event: PointerEvent) => {
      const target = event.target;
      const el =
        target instanceof Element
          ? (target.closest('[data-liquid]') as HTMLElement | null)
          : null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.1;
      const span = document.createElement('span');
      span.className = 'liquid-ripple-ink';
      span.style.width = `${size}px`;
      span.style.height = `${size}px`;
      span.style.left = `${event.clientX - rect.left}px`;
      span.style.top = `${event.clientY - rect.top}px`;
      span.addEventListener('animationend', () => span.remove(), { once: true });
      el.appendChild(span);
    };

    const onDown = (event: PointerEvent) => {
      track(event);
      ripple(event);
    };

    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });

    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  return null;
}
