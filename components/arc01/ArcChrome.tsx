'use client';

import { useEffect } from 'react';

/**
 * The motion runtime for the ARC-01 page.
 *
 * One component owns every scroll-driven effect on the site so the sections
 * themselves can stay static server-rendered markup: they only declare intent
 * with `data-reveal` and `data-count`, and this wires it up.
 *
 *  · paints the document black (the app is otherwise ivory-on-white)
 *  · drives the hairline scroll-progress rule
 *  · reveals anything marked `data-reveal` once, on first intersection
 *  · counts up anything marked `data-count` when it is revealed
 *
 * All of it is progressive enhancement — without JS the content is present and
 * a <noscript> rule makes it visible.
 */
export function ArcChrome() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('arc-html');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bar = document.getElementById('arc-progress');
    const root = document.querySelector<HTMLElement>('.arc');

    // ---- scroll progress ---------------------------------------------------
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!bar) return;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
        bar.style.transform = `scaleX(${p})`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ---- counters ----------------------------------------------------------
    const NUMERIC = /-?[\d][\d,]*(?:\.\d+)?/;

    const runCounter = (el: HTMLElement) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      const decimals = Number(el.dataset.dec ?? 0);
      const original = el.textContent ?? '';
      const match = original.match(NUMERIC);
      if (!match || match.index === undefined) return;

      const prefix = original.slice(0, match.index);
      const suffix = original.slice(match.index + match[0].length);
      const format = (v: number) =>
        v.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });

      const duration = 1500;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        // Quint ease-out — fast arrival, long settle. Reads as a machine
        // coming to rest rather than a number spinning.
        const eased = 1 - Math.pow(1 - t, 5);
        el.textContent = prefix + format(target * eased) + suffix;
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = original;
      };
      requestAnimationFrame(step);
    };

    // ---- reveal ------------------------------------------------------------
    if (!('IntersectionObserver' in window)) {
      root?.classList.add('no-motion');
      return () => {
        window.removeEventListener('scroll', onScroll);
        html.classList.remove('arc-html');
      };
    }

    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.add('is-in');
          observer.unobserve(el);

          const counters = el.matches('[data-count]')
            ? [el]
            : Array.from(el.querySelectorAll<HTMLElement>('[data-count]'));
          if (!reduced) counters.forEach(runCounter);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );
    targets.forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      html.classList.remove('arc-html');
    };
  }, []);

  return <div className="arc-progress" id="arc-progress" aria-hidden="true" />;
}
