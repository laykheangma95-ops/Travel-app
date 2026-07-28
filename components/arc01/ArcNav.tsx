'use client';

import { useEffect, useState } from 'react';

const LINKS = [
  { id: 'material', n: '01', label: 'Material' },
  { id: 'precision', n: '02', label: 'Precision' },
  { id: 'macro', n: '03', label: 'Detail' },
  { id: 'specification', n: '04', label: 'Specification' },
  { id: 'provenance', n: '05', label: 'Provenance' },
];

export function ArcNav() {
  const [active, setActive] = useState<string | null>(null);
  const [onLight, setOnLight] = useState(false);

  // The bar crosses two ivory sections, so it has to flip colour. Measuring
  // the ivory blocks against the bar's own centre line is exact and cheap —
  // mix-blend-mode looks right but a fixed element blending against a
  // scrolling backdrop can latch onto a stale snapshot in Chromium.
  useEffect(() => {
    const inverted = Array.from(document.querySelectorAll<HTMLElement>('.arc-inv'));
    if (!inverted.length) return;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = 28; // vertical centre of the bar
      setOnLight(
        inverted.some((el) => {
          const r = el.getBoundingClientRect();
          return r.top <= line && r.bottom >= line;
        }),
      );
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!sections.length || !('IntersectionObserver' in window)) return;

    // A band across the upper third of the viewport: whichever section is
    // crossing it owns the nav. Simpler and steadier than measuring offsets
    // on every scroll frame.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-12% 0px -76% 0px', threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="arc-nav" data-on-light={onLight} aria-label="ARC-01 sections">
      <a className="arc-nav__mark" href="#top">
        ARC&thinsp;—&thinsp;01
      </a>

      <div className="arc-nav__links">
        {LINKS.map((l) => (
          <a
            key={l.id}
            className="arc-nav__link"
            href={`#${l.id}`}
            data-active={active === l.id}
            aria-current={active === l.id ? 'true' : undefined}
          >
            {l.n}&nbsp;&nbsp;{l.label}
          </a>
        ))}
      </div>

      <div className="arc-nav__right">
        <span className="arc-nav__price">USD 10,000</span>
        <a className="arc-nav__link" href="#acquire" data-active={active === 'acquire'}>
          Acquire
        </a>
      </div>
    </nav>
  );
}
