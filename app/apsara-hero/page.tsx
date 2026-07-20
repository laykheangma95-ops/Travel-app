'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight, Globe, Instagram, Twitter } from 'lucide-react';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4';

const FADE_MS = 500;
// Start fading out this many seconds before the video ends so the loop
// restart is hidden inside a black frame instead of a visible jump cut.
const FADE_OUT_LEAD_S = 0.55;

// Page-scoped styles: the Instrument Serif import plus the liquid-glass
// recipe. Scoped under .apsara-hero so it doesn't fight the site-wide
// .liquid-glass class defined in globals.css.
const apsaraStyles = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');

.apsara-hero .liquid-glass {
  background: rgba(255, 255, 255, 0.01);
  background-blend-mode: luminosity;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}

.apsara-hero .liquid-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.45) 0%,
    rgba(255, 255, 255, 0.15) 20%,
    rgba(255, 255, 255, 0) 40%,
    rgba(255, 255, 255, 0) 60%,
    rgba(255, 255, 255, 0.15) 80%,
    rgba(255, 255, 255, 0.45) 100%
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
`;

export default function ApsaraHeroPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // rAF-based fade so each new fade can cancel the previous one and
    // resume from the current opacity instead of snapping.
    const fadeTo = (target: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const from = parseFloat(video.style.opacity || '0');
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / FADE_MS, 1);
        video.style.opacity = String(from + (target - from) * t);
        rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      rafRef.current = requestAnimationFrame(step);
    };

    const onLoaded = () => {
      fadingOutRef.current = false;
      fadeTo(1);
    };

    const onTimeUpdate = () => {
      // timeupdate fires ~4x/second; the ref stops the fade-out from being
      // restarted on every event once it has begun.
      if (fadingOutRef.current) return;
      if (video.duration && video.duration - video.currentTime <= FADE_OUT_LEAD_S) {
        fadingOutRef.current = true;
        fadeTo(0);
      }
    };

    const onEnded = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      video.style.opacity = '0';
      window.setTimeout(() => {
        video.currentTime = 0;
        void video.play();
        fadingOutRef.current = false;
        fadeTo(1);
      }, 100);
    };

    video.style.opacity = '0';
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    // The video may already be decoded before the listeners attach.
    if (video.readyState >= 2) onLoaded();

    return () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="apsara-hero relative flex min-h-screen flex-col overflow-hidden bg-black">
      <style dangerouslySetInnerHTML={{ __html: apsaraStyles }} />

      {/* Looping background video — no `loop` attribute: the JS fade system
          needs the `ended` event to run the crossfade restart. */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full translate-y-[17%] object-cover"
      />

      {/* Navigation */}
      <nav className="relative z-20 pl-6 pr-6 py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between rounded-full px-6 py-3">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 text-white">
              <Globe size={24} />
              <span className="text-lg font-semibold">Asme</span>
            </div>
            <div className="hidden items-center gap-8 md:flex">
              {['Features', 'Pricing', 'About'].map((link) => (
                <a
                  key={link}
                  href="#"
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button type="button" className="text-white">
              Sign Up
            </button>
            <button type="button" className="liquid-glass rounded-full px-6 py-2 text-white">
              Login
            </button>
          </div>
        </div>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 flex flex-1 -translate-y-[20%] flex-col items-center justify-center px-6 py-12 text-center">
        <h1
          className="mb-8 whitespace-nowrap text-5xl tracking-tight text-white md:text-6xl lg:text-7xl"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Built for the curious
        </h1>

        <div className="w-full max-w-xl space-y-4">
          <form
            className="liquid-glass flex items-center gap-3 rounded-full py-2 pl-6 pr-2"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              type="email"
              placeholder="Enter your email"
              className="w-full flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/40"
            />
            <button
              type="submit"
              aria-label="Subscribe"
              className="rounded-full bg-white p-3 text-black"
            >
              <ArrowRight size={20} />
            </button>
          </form>

          <p className="px-4 text-sm leading-relaxed text-white">
            Stay updated with the latest news and insights. Subscribe to our newsletter today and
            never miss out on exciting updates.
          </p>

          <div className="flex justify-center">
            <button
              type="button"
              className="liquid-glass rounded-full px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
            >
              Manifesto
            </button>
          </div>
        </div>
      </div>

      {/* Social icons */}
      <div className="relative z-10 flex justify-center gap-4 pb-12">
        <button
          type="button"
          aria-label="Instagram"
          className="liquid-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white"
        >
          <Instagram size={20} />
        </button>
        <button
          type="button"
          aria-label="Twitter"
          className="liquid-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white"
        >
          <Twitter size={20} />
        </button>
        <button
          type="button"
          aria-label="Website"
          className="liquid-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white"
        >
          <Globe size={20} />
        </button>
      </div>
    </div>
  );
}
