'use client';

// Domer premium loader — faithful port of design_handoff_domer_brand/loader.html.
// Gold metallic Wayfinder Star spinning in 3D (slow→fast easing), stardust ring,
// pulsing glow, "Preparing your journey" label. Keyframes live in globals.css.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { WAYFINDER_PATH } from './DomerMark';
import { useLang } from '@/lib/i18n';

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

export function DomerLoader({ size = 260, label }: { size?: number; label?: string }) {
  const { t } = useLang();
  // An explicit label still wins; the default now follows the language.
  const text = label ?? t('brand.loading');
  const starSize = Math.round(size * (120 / 260));
  return (
    <div className="flex flex-col items-center gap-7">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size, perspective: '800px' }}
        role="status"
        aria-label={text}
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
        <b>{text}</b>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </div>
    </div>
  );
}

// Full-screen splash: shown once per session on first load, fades out after
// the page has hydrated (min 900ms so the animation reads, max 4s safety).
export function DomerSplash() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(false);

  // The journey pages choreograph their own reveal: the search field is already
  // on screen in static HTML and the globe eases in behind it. A splash there
  // would cover the LCP element for up to a second after `load` — measured at
  // ~2.9s LCP with it, ~1.1s without — for a curtain nobody asked to see.
  const skip = pathname === '/' || pathname.startsWith('/destination/');

  useEffect(() => {
    if (skip) return;
    if (sessionStorage.getItem('domer-splash-shown')) return;
    sessionStorage.setItem('domer-splash-shown', '1');
    setVisible(true);

    const start = Date.now();
    let dismissTimer: ReturnType<typeof setTimeout>;
    const dismiss = () => {
      const wait = Math.max(0, 900 - (Date.now() - start));
      dismissTimer = setTimeout(() => {
        setHidden(true);
        setTimeout(() => setVisible(false), 550);
      }, wait);
    };

    if (document.readyState === 'complete') dismiss();
    else window.addEventListener('load', dismiss, { once: true });
    const safety = setTimeout(dismiss, 4000);

    return () => {
      window.removeEventListener('load', dismiss);
      clearTimeout(safety);
      clearTimeout(dismissTimer);
    };
  }, [skip]);

  if (!visible) return null;

  return (
    <div className={`domer-splash ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden}>
      <DomerLoader />
    </div>
  );
}
