'use client';

/**
 * GlobeChapters — the scroll-narrative spine that follows the Cambodia
 * showcase inside .dgh-stage.
 *
 * Three full-viewport chapters tell the journey — connect before you fly,
 * follow the flight live, land in Cambodia ready. Each chapter declares how
 * the shared planet (rendered by GlobeHero's sticky canvas) should pose while
 * it is on screen, via data attributes on its [data-dgc] element:
 *
 *   data-x / data-y   globe centre as a fraction of the viewport
 *   data-scale        multiplier on the base globe size
 *   data-lat/data-lon destination the globe rotates to face
 *   data-arc          arc-activity boost (1 = normal)
 *
 * GlobeHero reads these when building its scroll keyframes, so chapters can be
 * added, removed or reordered here without touching the 3D code. Styles are
 * scoped under the `dgc-` prefix.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { useLang } from '@/lib/i18n';

interface Chapter {
  no: string;
  href: string;
  side: 'left' | 'right' | 'center';
  /** show the live aircraft counter (fed by GlobeHero's sky layer) */
  live?: boolean;
  globe: { x: number; y: number; scale: number; lat: number; lon: number; arc: number; sky: number };
  eyebrow: string;
  eyebrowKm: string;
  title: string;
  titleKm: string;
  body: string;
  bodyKm: string;
  cta: string;
  ctaKm: string;
}

const CHAPTERS: Chapter[] = [
  {
    no: '01',
    href: '/esim',
    side: 'left',
    // Globe glides right and shrinks; South-East Asia faces the camera.
    globe: { x: 0.7, y: 0.5, scale: 0.62, lat: 8, lon: 103, arc: 1.15, sky: 0 },
    eyebrow: 'Before you fly',
    eyebrowKm: 'មុនពេលហោះហើរ',
    title: 'One eSIM. Two hundred horizons.',
    titleKm: 'អ៊ីស៊ីមមួយ សម្រាប់គោលដៅ ២០០។',
    body:
      'Install your travel eSIM before you board and land with data already working — no airport SIM hunt, no roaming shock.',
    bodyKm:
      'ដំឡើងអ៊ីស៊ីមធ្វើដំណើររបស់អ្នកមុនឡើងយន្តហោះ ហើយមានអ៊ីនធឺណិតភ្លាមៗពេលចុះដល់ — មិនចាំបាច់រកស៊ីមកាតនៅព្រលានយន្តហោះ ឬបារម្ភពីថ្លៃរ៉ូមីងទេ។',
    cta: 'Browse eSIM plans',
    ctaKm: 'មើលគម្រោងអ៊ីស៊ីម',
  },
  {
    no: '02',
    href: '/flights',
    side: 'right',
    live: true,
    // Globe crosses to the left; the Pacific route lanes light up hard.
    globe: { x: 0.3, y: 0.5, scale: 0.56, lat: 24, lon: 145, arc: 2.1, sky: 1 },
    eyebrow: 'In the air',
    eyebrowKm: 'ពេលកំពុងហោះហើរ',
    title: 'Every flight, followed live.',
    titleKm: 'តាមដានគ្រប់ជើងហោះហើរ ដោយផ្ទាល់។',
    body:
      'Gate changes, delays, arrival times — Domner follows the aircraft in real time, so the news reaches you before the airport screens do.',
    bodyKm:
      'ការផ្លាស់ប្តូរច្រកចេញ ការពន្យារពេល និងម៉ោងមកដល់ — Domner តាមដានយន្តហោះក្នុងពេលជាក់ស្តែង ដូច្នេះព័ត៌មានមកដល់អ្នកមុនអេក្រង់ព្រលានយន្តហោះ។',
    cta: 'Track a flight',
    ctaKm: 'តាមដានជើងហោះហើរ',
  },
  {
    no: '03',
    href: '/airport-guide',
    side: 'center',
    // Finale: the planet returns to centre and zooms in on Cambodia.
    globe: { x: 0.5, y: 0.62, scale: 0.95, lat: 11.56, lon: 104.92, arc: 1.3, sky: 0 },
    eyebrow: 'Touchdown',
    eyebrowKm: 'ពេលចុះដល់',
    title: 'Land in Cambodia, ready.',
    titleKm: 'ចុះដល់កម្ពុជា ដោយត្រៀមរួចជាស្រេច។',
    body:
      'A step-by-step airport guide, an arrival checklist and emergency info — in Khmer and English, every step of the way.',
    bodyKm:
      'មគ្គុទ្ទេសក៍ព្រលានយន្តហោះជាជំហានៗ បញ្ជីត្រៀមពេលមកដល់ និងព័ត៌មានបន្ទាន់ — ជាភាសាខ្មែរ និងអង់គ្លេស គ្រប់ជំហាន។',
    cta: 'Open the airport guide',
    ctaKm: 'បើកមគ្គុទ្ទេសក៍ព្រលានយន្តហោះ',
  },
];

export function GlobeChapters() {
  const { lang } = useLang();
  const km = lang === 'km';
  const wrapRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [skyCount, setSkyCount] = useState<number | null>(null);

  // GlobeHero broadcasts how many live aircraft its ADS-B sky layer is
  // drawing; chapter 02 shows the number as proof the sky is real.
  useEffect(() => {
    const onSky = (e: Event) => {
      const count = (e as CustomEvent<{ count?: number }>).detail?.count;
      if (typeof count === 'number' && count > 0) setSkyCount(count);
    };
    window.addEventListener('dgh-sky', onSky);
    return () => window.removeEventListener('dgh-sky', onSky);
  }, []);

  // Light up the rail number of whichever chapter crosses mid-viewport.
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-dgc]'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(els.indexOf(e.target as HTMLElement));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={wrapRef}
      className="dgc-wrap"
      aria-label={km ? 'របៀបដែល Domner ធ្វើដំណើរជាមួយអ្នក' : 'How Domner travels with you'}
    >
      <div className="dgc-rail" aria-hidden="true">
        {CHAPTERS.map((c, i) => (
          <span key={c.no} className={`dgc-rail-no${i === active ? ' dgc-rail-on' : ''}`}>
            {c.no}
          </span>
        ))}
      </div>

      {CHAPTERS.map((c) => (
        <div
          key={c.no}
          data-dgc
          data-x={c.globe.x}
          data-y={c.globe.y}
          data-scale={c.globe.scale}
          data-lat={c.globe.lat}
          data-lon={c.globe.lon}
          data-arc={c.globe.arc}
          data-sky={c.globe.sky}
          className={`dgc-chapter dgc-${c.side}`}
        >
          <Reveal className="dgc-card">
            <p className="dgc-eyebrow">
              <span className="dgc-no">{c.no}</span>
              {km ? c.eyebrowKm : c.eyebrow}
            </p>
            <h3 className="dgc-title font-display">{km ? c.titleKm : c.title}</h3>
            <p className="dgc-body">{km ? c.bodyKm : c.body}</p>
            {c.live && skyCount !== null && (
              <p className="dgc-live">
                <span className="dgc-live-dot" aria-hidden="true" />
                {km
                  ? `យន្តហោះ ${skyCount} គ្រឿង កំពុងហោះហើរលើអាស៊ីឥឡូវនេះ`
                  : `${skyCount} aircraft over Asia right now`}
              </p>
            )}
            <Link href={c.href} className="dgc-cta liquid-glass liquid-sheen">
              {km ? c.ctaKm : c.cta}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      ))}

      <style dangerouslySetInnerHTML={{ __html: CSS_TEXT }} />
    </section>
  );
}

/* ────────────────────────── Scoped styles ────────────────────────── */

const CSS_TEXT = `
.dgc-wrap {
  position: relative;
  z-index: 1;
  padding: 8vh 0 14vh;
}

/* Sticky chapter-number rail, pinned mid-viewport on the right edge. */
.dgc-rail {
  position: sticky;
  top: 50vh;
  z-index: 2;
  height: 0;
  width: 2.5rem;
  margin: 0 1.1rem 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.15rem;
  transform: translateY(-50%);
  pointer-events: none;
}
.dgc-rail-no {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.32);
  transition: color 0.4s ease, text-shadow 0.4s ease;
}
.dgc-rail-on {
  color: #F7EAC0;
  text-shadow: 0 0 14px rgba(230, 203, 139, 0.8);
}

.dgc-chapter {
  min-height: 92vh;
  max-width: 72rem;
  margin: 0 auto;
  padding: 6vh 1.25rem;
  display: flex;
  align-items: center;
}
.dgc-left { justify-content: flex-start; }
.dgc-right { justify-content: flex-end; }
/* Finale: copy sits high and centred, the planet fills the space below. */
.dgc-center {
  min-height: 100vh;
  align-items: flex-start;
  justify-content: center;
  text-align: center;
  padding-top: 11vh;
}

.dgc-card { max-width: 26rem; }
.dgc-center .dgc-card { max-width: 34rem; }

.dgc-eyebrow {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: #E6CB8B;
}
.dgc-center .dgc-eyebrow { justify-content: center; }
.dgc-no {
  padding-right: 0.75rem;
  border-right: 1px solid rgba(230, 203, 139, 0.4);
  opacity: 0.7;
}
.dgc-title {
  margin-top: 1.1rem;
  font-size: clamp(1.9rem, 3.6vw, 2.9rem);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.02em;
  color: #fff;
  text-wrap: balance;
}
.dgc-body {
  margin-top: 1rem;
  font-size: 1rem;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.68);
}
/* Live aircraft counter — proof the sky on the globe is real data. */
.dgc-live {
  margin-top: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9fe4ff;
}
.dgc-center .dgc-live { justify-content: center; }
.dgc-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #9fe4ff;
  box-shadow: 0 0 10px rgba(159, 228, 255, 0.9);
  animation: dgc-live-pulse 1.6s ease-in-out infinite;
}
@keyframes dgc-live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}
@media (prefers-reduced-motion: reduce) {
  .dgc-live-dot { animation: none; }
}

.dgc-cta {
  margin-top: 1.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 1.6rem;
  border-radius: 999px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  text-decoration: none;
  transition: transform 0.2s ease;
}
.dgc-cta:hover { transform: scale(1.05); }
.dgc-cta:active { transform: scale(0.97); }

@media (max-width: 1023px) {
  .dgc-rail { display: none; }
}

/* Mobile: the planet stays centred behind the copy, so the card gets a dark
   glass backing for legibility. */
@media (max-width: 767px) {
  .dgc-chapter,
  .dgc-left,
  .dgc-right {
    min-height: 88vh;
    justify-content: center;
    text-align: center;
  }
  .dgc-eyebrow { justify-content: center; }
  .dgc-card {
    max-width: 24rem;
    padding: 1.5rem 1.35rem;
    border-radius: 1.25rem;
    background: rgba(5, 11, 40, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
}
`;
