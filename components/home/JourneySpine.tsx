'use client';

/**
 * JourneySpine — the homepage's scroll-narrative spine.
 *
 * A single gold rail pinned to the left edge, with one node per journey chapter
 * (data/journeyChapters) placed at the exact scroll position where that section
 * centres in the viewport — so the rail is a true map of the page, not a
 * decorative progress bar. A small gold-rimmed planet (the "traveller") rides
 * the rail as you scroll, its world dial turning to each chapter's longitude,
 * and the active chapter's bilingual name sits beside it.
 *
 * This is the spine the 3D hero globe hangs off: while you are on the stage the
 * globe itself docks Cambodia toward the camera (see GlobeHero's dock scrub),
 * and from the night canvas down this rail carries the same narrative in
 * miniature.
 *
 * Desktop only (≥1024px) — on narrower screens the JourneyCompanion orb keeps
 * its bottom-left post instead, so exactly one traveller shows at any width.
 *
 * Pure DOM/SVG: no WebGL, no extra libraries, one rAF-throttled scroll handler.
 * Honours prefers-reduced-motion (the orbit stops, jumps are instant; the rail
 * still tracks position).
 */

import { useEffect, useRef } from 'react';
import { journeyChapters } from '@/data/journeyChapters';
import { useLang } from '@/lib/i18n';

export function JourneySpine() {
  const { t } = useLang();
  const rootRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const travellerRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const rail = railRef.current;
    const fill = fillRef.current;
    const traveller = travellerRef.current;
    const dial = dialRef.current;
    const label = labelRef.current;
    if (!root || !rail || !fill || !traveller || !dial || !label) return;

    const nodes = journeyChapters.map((c) =>
      root.querySelector<HTMLButtonElement>(`[data-spine-node="${c.id}"]`),
    );

    // Scroll fraction (0–1) at which each chapter's section reaches the middle
    // of the viewport — i.e. the moment the reader enters that chapter. Node
    // positions and the active chapter both come from this one number, so the
    // traveller passing a node is exactly when that chapter lights up.
    // Recomputed on resize: section heights move with the type.
    let stops: number[] = journeyChapters.map(() => 0);

    const measure = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      stops = journeyChapters.map((c) => {
        const el = document.querySelector<HTMLElement>(`[data-journey-id="${c.id}"]`);
        if (!el || scrollable <= 0) return 0;
        const top = el.getBoundingClientRect().top + window.scrollY;
        // ENTER_AT: a chapter starts when its top reaches this far down the
        // viewport. 0.3 rather than 0.5 because sections open with generous top
        // padding — waiting until the heading itself is comfortably in view
        // stops the rail from running a beat ahead of what the reader sees.
        return Math.min(1, Math.max(0, (top - window.innerHeight * 0.3) / scrollable));
      });
      const railH = rail.clientHeight;
      nodes.forEach((n, i) => {
        if (n) n.style.top = `${stops[i] * railH}px`;
      });
    };

    let active = -1;
    const setActive = (next: number) => {
      if (next === active || next < 0) return;
      active = next;
      nodes.forEach((n, i) => {
        if (!n) return;
        n.classList.toggle('spine-node-on', i === next);
        // aria-current marks the chapter the reader is actually in.
        if (i === next) n.setAttribute('aria-current', 'true');
        else n.removeAttribute('aria-current');
      });
      label.textContent = t(journeyChapters[next].labelKey);
      // Turn the traveller's world dial to this chapter's longitude, so moving
      // down the page reads as travelling around the planet.
      dial.style.transform = `rotate(${-journeyChapters[next].lon}deg)`;
    };

    let ticking = false;
    let nameTimer = 0;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const p = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        const railH = rail.clientHeight;
        fill.style.height = `${p * railH}px`;
        traveller.style.transform = `translate(-50%, -50%) translateY(${p * railH}px)`;
        // The last chapter the traveller has reached stays lit for the whole of
        // its section, so nothing flickers at the boundaries.
        let next = 0;
        for (let i = 0; i < stops.length; i++) {
          if (p >= stops[i]) next = i;
        }
        setActive(next);
        // In once past the hero copy, out again at the very end of the page.
        root.classList.toggle('spine-visible', window.scrollY > window.innerHeight * 0.6 && p < 0.985);

        // Name the chapter while the reader is moving, then get out of the way:
        // the label sits in the same gutter as the content's left edge on
        // narrower desktops, and a parked label would cover it.
        root.classList.add('spine-naming');
        window.clearTimeout(nameTimer);
        nameTimer = window.setTimeout(() => root.classList.remove('spine-naming'), 1300);
      });
    };

    measure();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    // Sections grow when fonts swap or cards reflow; re-measure when they do.
    const ro = new ResizeObserver(() => {
      measure();
      onScroll();
    });
    ro.observe(document.body);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      window.clearTimeout(nameTimer);
      ro.disconnect();
    };
  }, [t]);

  const jumpTo = (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-journey-id="${id}"]`);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  };

  return (
    <nav ref={rootRef} className="spine" aria-label={t('chapter.nav')}>
      <div ref={railRef} className="spine-rail">
        <span className="spine-rail-fill" ref={fillRef} aria-hidden="true" />

        <ol className="spine-list">
          {journeyChapters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="spine-node"
                data-spine-node={c.id}
                onClick={() => jumpTo(c.id)}
              >
                <span className="spine-dot" aria-hidden="true" />
                <span className="spine-node-label">{t(c.labelKey)}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* The traveller: a miniature of the hero planet, riding the rail. */}
        <div ref={travellerRef} className="spine-traveller" aria-hidden="true">
          <span className="spine-planet">
            <span ref={dialRef} className="spine-dial" />
          </span>
          <span className="spine-orbit">
            <span className="spine-comet" />
          </span>
          <span ref={labelRef} className="spine-label" />
        </div>
      </div>
    </nav>
  );
}
