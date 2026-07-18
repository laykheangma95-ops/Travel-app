'use client';

// Domer premium loader — faithful port of design_handoff_domer_brand/loader.html.
// Gold metallic Wayfinder Star spinning in 3D (slow→fast easing), stardust ring,
// pulsing glow, "Preparing your journey" label. Keyframes live in globals.css.

import { useEffect, useRef, useState } from 'react';
import { WAYFINDER_PATH } from './DomerMark';

const DUST = [
  { top: '4%', left: '50%', size: 4, delay: '0s' },
  { top: '18%', left: '84%', size: 3, delay: '.3s' },
  { top: '50%', left: '96%', size: 2, delay: '.6s' },
  { top: '82%', left: '84%', size: 4, delay: '.2s' },
  { top: '96%', left: '50%', size: 3, delay: '.8s' },
  { top: '82%', left: '16%', size: 2, delay: '.5s' },
  { top: '50%', left: '4%', size: 4, delay: '1s' },
  { top: '18%', left: '16%', size: 3, delay: '.4s' },
];

export function DomerLoader({ size = 260, label = 'Preparing your journey' }: { size?: number; label?: string }) {
  const starSize = Math.round(size * (120 / 260));
  return (
    <div className="flex flex-col items-center gap-7">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size, perspective: '800px' }}
        role="status"
        aria-label={label}
      >
        <div className="domer-glow" aria-hidden="true" />
        <div className="domer-dust" aria-hidden="true">
          {DUST.map((d, i) => (
            <i
              key={i}
              style={{
                top: d.top,
                left: d.left,
                width: d.size,
                height: d.size,
                animationDelay: d.delay,
              }}
            />
          ))}
        </div>
        <div className="domer-star" style={{ width: starSize, height: starSize }}>
          <svg
            viewBox="0 0 100 100"
            width={starSize}
            height={starSize}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: 'drop-shadow(0 6px 16px rgba(198,151,73,.4))' }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="domer-metal" x1="18" y1="8" x2="82" y2="92" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#8A6820" />
                <stop offset=".32" stopColor="#E6CB8B" />
                <stop offset=".5" stopColor="#F7EAC0" />
                <stop offset=".68" stopColor="#C69749" />
                <stop offset="1" stopColor="#7A5A1E" />
              </linearGradient>
              <linearGradient id="domer-sheen" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset=".5" stopColor="#FFFDF4" stopOpacity=".9" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={WAYFINDER_PATH} fill="url(#domer-metal)" />
            <path className="domer-sheen-path" d={WAYFINDER_PATH} fill="url(#domer-sheen)" />
            <circle cx="50" cy="50" r="11" fill="#14263F" />
            <circle cx="50" cy="50" r="4.2" fill="#E6CB8B" />
          </svg>
        </div>
      </div>
      <div className="domer-label">
        <b>{label}</b>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    </div>
  );
}

// Full-screen splash: shown once per session on first load, dismissed after
// the page has hydrated (min 900ms so the animation reads, max 4s safety).
//
// Dismissal is a loader → hero handoff rather than a hard cut: the navy veil
// lifts to reveal the already-living page while the Wayfinder Star flies into
// the navbar mark (.domer-nav-mark) and cross-fades into it. The splash
// broadcasts the moment the veil starts lifting (window 'domer-splash-handoff'
// + the __domerSplashPending flag), so the home hero can hold its entrance
// reveal and rise exactly as the page is unveiled. Reduced motion — or a page
// without the navbar mark — falls back to the simple cross-fade.

const SPLASH_KEY = 'domer-splash-shown';

// Read the session flag once per page load, at module scope. The effect below
// must NOT re-read it: under React StrictMode the effect runs twice, and an
// in-effect check would see the flag set by its own first run, early-return,
// and leave the splash stuck with no dismiss timers armed.
const shownBeforeLoad =
  typeof window !== 'undefined' &&
  (() => {
    try {
      return sessionStorage.getItem(SPLASH_KEY) === '1';
    } catch {
      return true; // storage unavailable — never risk a stuck splash
    }
  })();

if (typeof window !== 'undefined' && !shownBeforeLoad) {
  (window as unknown as { __domerSplashPending?: boolean }).__domerSplashPending = true;
}

export function DomerSplash() {
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(false); // simple cross-fade path
  const [handoff, setHandoff] = useState(false); // star-flight path
  const rootRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shownBeforeLoad) return;
    try {
      sessionStorage.setItem(SPLASH_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(true);

    // Unblock anyone waiting on the splash (the hero's entrance reveal).
    const announce = () => {
      (window as unknown as { __domerSplashPending?: boolean }).__domerSplashPending = false;
      window.dispatchEvent(new Event('domer-splash-handoff'));
    };

    const start = Date.now();
    let dismissed = false;
    let dismissTimer: ReturnType<typeof setTimeout>;
    let unmountTimer: ReturnType<typeof setTimeout>;
    const dismiss = () => {
      const wait = Math.max(0, 900 - (Date.now() - start));
      dismissTimer = setTimeout(() => {
        if (dismissed) return;
        dismissed = true;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const flight = flightRef.current;
        const star = rootRef.current?.querySelector<HTMLElement>('.domer-star');
        const mark = document.querySelector<SVGSVGElement>('.domer-nav-mark');
        if (reduced || !flight || !star || !mark) {
          announce();
          setHidden(true);
          unmountTimer = setTimeout(() => setVisible(false), 550);
          return;
        }
        // Fly the star's centre onto the navbar mark's centre, scaling to its
        // size. The star spins in 3D, so its projected rect width oscillates —
        // offsetWidth gives the stable layout size for the scale.
        const s = star.getBoundingClientRect();
        const t = mark.getBoundingClientRect();
        const f = flight.getBoundingClientRect();
        const sx = s.left + s.width / 2;
        const sy = s.top + s.height / 2;
        flight.style.transformOrigin = `${sx - f.left}px ${sy - f.top}px`;
        flight.style.transform =
          `translate(${t.left + t.width / 2 - sx}px, ${t.top + t.height / 2 - sy}px) ` +
          `scale(${t.width / (star.offsetWidth || s.width)})`;
        flight.style.opacity = '0';
        setHandoff(true);
        announce();
        unmountTimer = setTimeout(() => setVisible(false), 1150);
      }, wait);
    };

    if (document.readyState === 'complete') dismiss();
    else window.addEventListener('load', dismiss, { once: true });
    const safety = setTimeout(dismiss, 4000);

    return () => {
      window.removeEventListener('load', dismiss);
      clearTimeout(safety);
      clearTimeout(dismissTimer);
      clearTimeout(unmountTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      className={`domer-splash ${hidden ? 'is-hidden' : ''} ${handoff ? 'is-handoff' : ''}`}
      aria-hidden={hidden || handoff}
    >
      <div className="domer-splash-veil" aria-hidden="true" />
      <div ref={flightRef} className="domer-splash-flight">
        <DomerLoader />
      </div>
    </div>
  );
}
