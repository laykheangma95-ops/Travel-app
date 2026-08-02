'use client';

/**
 * JourneyCompanion — a persistent mini-globe that rides the night sky.
 *
 * As you scroll past the cinematic hero, this gold-rimmed companion fades in at
 * the bottom-left and follows you down the page: a progress ring tracks how far
 * through the homepage you are, a gold comet orbits the globe, and a small label
 * names the section you're currently in. Clicking it flies you back up to the
 * full 3D globe. It docks (fades out) once you reach the end.
 *
 * Deliberately lightweight — pure CSS/SVG, no WebGL, no extra libraries — so it
 * never touches the delicate Three.js hero scene. Honours prefers-reduced-motion
 * (the orbit/spin stop; the ring still tracks progress) and is pointer-inert
 * until visible so it can never block page content.
 */

import { useEffect, useRef } from 'react';

const RADIUS = 29; // matches the SVG viewBox below (cx=cy=32)
const CIRC = 2 * Math.PI * RADIUS;

export function JourneyCompanion() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const prog = progRef.current;
    const label = labelRef.current;
    if (!root || !prog || !label) return;

    prog.style.strokeDasharray = String(CIRC);

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        prog.style.strokeDashoffset = String(CIRC * (1 - progress));
        // Visible once we're past the hero, hidden again at the very bottom.
        const show = window.scrollY > window.innerHeight * 0.85 && progress < 0.985;
        root.classList.toggle('jc-visible', show);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // Name the section the reader is currently in.
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-journey-section]'),
    );
    const ratios = new Map<Element, number>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
        let best: HTMLElement | null = null;
        let bestR = 0;
        for (let i = 0; i < sections.length; i++) {
          const r = ratios.get(sections[i]) ?? 0;
          if (r > bestR) {
            bestR = r;
            best = sections[i];
          }
        }
        if (best) {
          const next = best.getAttribute('data-journey-label') ?? '';
          if (next && label.textContent !== next) label.textContent = next;
        }
      },
      { threshold: [0.15, 0.4, 0.75] },
    );
    sections.forEach((s) => io.observe(s));

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      io.disconnect();
    };
  }, []);

  const flyToTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div ref={rootRef} className="jc" aria-hidden="true">
      <span ref={labelRef} className="jc-label" />
      <button type="button" className="jc-orb-wrap" onClick={flyToTop} aria-label="Back to top">
        <svg className="jc-ring" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="jcGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f7eac0" />
              <stop offset="55%" stopColor="#e6cb8b" />
              <stop offset="100%" stopColor="#c69749" />
            </linearGradient>
          </defs>
          <circle className="jc-ring-track" cx="32" cy="32" r={RADIUS} />
          <circle ref={progRef} className="jc-ring-prog" cx="32" cy="32" r={RADIUS} />
        </svg>
        <span className="jc-orb">
          <span className="jc-sheen" />
        </span>
        <span className="jc-orbit">
          <span className="jc-comet" />
        </span>
      </button>
    </div>
  );
}
