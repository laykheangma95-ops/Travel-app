'use client';

/**
 * CustomCursor — a gold reticle that replaces the native pointer on fine-pointer
 * devices. A dot tracks the cursor exactly; a ring follows with a soft lag and
 * blooms open over interactive targets (links, buttons, glass surfaces) so
 * "clickable" reads instantly.
 *
 * Progressive & safe:
 *  - Only activates on `(pointer: fine)` — touch/coarse devices keep native
 *    behaviour (the elements are hidden via a CSS media query too).
 *  - The native cursor is hidden only once this mounts (body class), so with no
 *    JS the normal cursor stays. Text inputs keep their caret (see globals.css).
 *  - prefers-reduced-motion drops the follow-lag to an exact 1:1 track.
 *  - Purely decorative: pointer-events:none, aria-hidden — never intercepts.
 */

import { useEffect, useRef } from 'react';

export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!ring || !dot) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    document.body.classList.add('has-custom-cursor');

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let rx = tx;
    let ry = ty;
    let raf = 0;
    let shown = false;

    const place = (el: HTMLElement, x: number, y: number) => {
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    };

    const loop = () => {
      const ease = reduce ? 1 : 0.2;
      rx += (tx - rx) * ease;
      ry += (ty - ry) * ease;
      place(ring, rx, ry);
      place(dot, tx, ty);
      raf = requestAnimationFrame(loop);
    };

    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        shown = true;
        root.classList.add('cursor-visible');
      }
      const el =
        e.target instanceof Element
          ? e.target.closest('a, button, [role="button"], [data-liquid], label, select, summary')
          : null;
      root.classList.toggle('cursor-interactive', !!el);
    };

    const hide = () => {
      shown = false;
      root.classList.remove('cursor-visible');
    };

    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', hide);
    window.addEventListener('blur', hide);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', hide);
      window.removeEventListener('blur', hide);
      document.body.classList.remove('has-custom-cursor');
      root.classList.remove('cursor-visible', 'cursor-interactive');
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" aria-hidden="true" />
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
