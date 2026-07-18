'use client';

/**
 * TripBoard — a signature asymmetric "bento" section for the home page.
 *
 * Where the feature/destination grids are uniform columns, this is a true
 * bento: one large route tile anchoring a mix of 2×1 / 1×2 / 1×1 cells, each
 * a small live micro-experience rather than a static card:
 *
 *   • Route map (2×2) — an animated arc drawing itself Phnom Penh → destination
 *   • Flight strip     — a boarding-pass row with a status pill
 *   • eSIM meter (1×2) — a data allowance that fills on view / retarget
 *   • Local time (1×1) — a live ticking clock in the destination's timezone
 *   • Khmer phrase (1×1) — phrase of the moment, tap-to-hear (speech synthesis)
 *
 * The whole board is retargetable: tapping a destination chip re-points the
 * arc, the timezone, the eSIM country, and the price — so the section reads as
 * "your trip", live, not a promo panel.
 *
 * Self-contained: no network calls, no globe/routing dependencies. Dark
 * Temple-Night surface (reuses .stars, .glass-panel, .liquid-touch, .arc-line
 * from globals.css). Honors prefers-reduced-motion throughout.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Plane, Signal, Clock3, Volume2, ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/* ───────────────────────── Board data ─────────────────────────
   A curated set of hub destinations. `angle` places the arc's far node on the
   mini-globe (degrees, 0 = due east / 3 o'clock, growing counter-clockwise);
   `tz` drives the live clock; price mirrors data/destinations.ts. */
type Dest = {
  slug: string;
  city: string;
  cityKm: string;
  iata: string;
  flag: string;
  tz: string;
  angle: number;
  dataGb: number;
  usedGb: number;
  priceUsd: number;
};

const HOME = { city: 'Phnom Penh', iata: 'PNH', tz: 'Asia/Phnom_Penh' };

const DESTS: Dest[] = [
  { slug: 'japan',       city: 'Tokyo',     cityKm: 'តូក្យូ',   iata: 'NRT', flag: '🇯🇵', tz: 'Asia/Tokyo',     angle: 58, dataGb: 5, usedGb: 2.4, priceUsd: 6.99 },
  { slug: 'thailand',    city: 'Bangkok',   cityKm: 'បាងកក',    iata: 'BKK', flag: '🇹🇭', tz: 'Asia/Bangkok',   angle: 20, dataGb: 3, usedGb: 0.8, priceUsd: 4.99 },
  { slug: 'singapore',   city: 'Singapore', cityKm: 'សិង្ហបូរី', iata: 'SIN', flag: '🇸🇬', tz: 'Asia/Singapore', angle: 34, dataGb: 5, usedGb: 3.1, priceUsd: 5.49 },
  { slug: 'south-korea', city: 'Seoul',     cityKm: 'សេអ៊ូល',   iata: 'ICN', flag: '🇰🇷', tz: 'Asia/Seoul',     angle: 66, dataGb: 5, usedGb: 1.6, priceUsd: 5.99 },
];

/* Phrase of the moment — cycles with the selected destination for a sense of
   "the board knows where you're going". Khmer script + romanization + meaning. */
const PHRASES = [
  { km: 'សួស្តី',        rom: 'Suostei',        en: 'Hello' },
  { km: 'អរគុណ',        rom: 'Arkoun',         en: 'Thank you' },
  { km: 'តើនេះថ្លៃប៉ុន្មាន?', rom: 'Tae nih thlai ponman?', en: 'How much is this?' },
  { km: 'ជួយផង',        rom: 'Chuoy phong',    en: 'Help, please' },
];

const bilingual = (lang: 'en' | 'km', en: string, km: string) => (lang === 'km' ? km : en);

/* ───────────────────────── Component ───────────────────────── */

export function TripBoard() {
  const { lang } = useLang();
  const [active, setActive] = useState(0);
  const dest = DESTS[active];
  const phrase = PHRASES[active % PHRASES.length];

  const reduce = usePrefersReducedMotion();

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0E1B30_0%,#14263F_50%,#0E1B30_100%)] py-20">
      <div className="stars" aria-hidden="true" />
      {/* Soft gold aura behind the board */}
      <div
        className="pointer-events-none absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(198,151,73,0.45), transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mb-10 max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold-light">
              {bilingual(lang, 'Your trip, live', 'ដំណើររបស់អ្នក')}
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {bilingual(lang, 'One board, from gate to ground', 'មួយផ្ទាំង ពីទ្វារឡើងយន្តហោះ ដល់ដល់ទីកន្លែង')}
            </h2>
            <p className="mt-4 leading-relaxed text-white/60">
              {bilingual(
                lang,
                'Everything Domer watches while you travel — in one glance. Tap a city to re-point the whole board.',
                'អ្វីៗគ្រប់យ៉ាងដែល Domer តាមដានពេលអ្នកធ្វើដំណើរ — ក្នុងមួយក្រឡេក។ ចុចទីក្រុងដើម្បីប្តូរផ្ទាំងទាំងមូល។'
              )}
            </p>
          </div>
        </Reveal>

        {/* Destination selector */}
        <Reveal delay={80}>
          <div className="mb-6 flex flex-wrap gap-2">
            {DESTS.map((d, i) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                className={cn(
                  'liquid-touch liquid-press flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-300',
                  i === active
                    ? 'border-gold-light/60 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white/85'
                )}
              >
                <span className="text-base leading-none">{d.flag}</span>
                {bilingual(lang, d.city, d.cityKm)}
              </button>
            ))}
          </div>
        </Reveal>

        {/* ── The bento ── */}
        <Reveal delay={140}>
          <div className="grid auto-rows-[minmax(120px,auto)] grid-cols-2 gap-4 lg:grid-cols-4">
            <RouteTile dest={dest} lang={lang} reduce={reduce} />
            <FlightTile dest={dest} lang={lang} />
            <EsimTile dest={dest} lang={lang} reduce={reduce} />
            <ClockTile dest={dest} lang={lang} />
            <PhraseTile phrase={phrase} lang={lang} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── Tiles ───────────────────────── */

const tileBase =
  'glass-panel liquid-touch relative overflow-hidden rounded-card p-5 text-white transition-transform duration-500 ease-smooth hover:-translate-y-1';

/** Big 2×2 — animated route arc on a stylized mini-globe. */
function RouteTile({ dest, lang, reduce }: { dest: Dest; lang: 'en' | 'km'; reduce: boolean }) {
  // Mini-globe geometry (viewBox 0..400 x 0..300). Home node is fixed
  // lower-left; the far node swings by the destination's `angle`.
  const cx = 150;
  const cy = 210;
  const r = 150;
  const rad = (dest.angle * Math.PI) / 180;
  // Round to 2dp so the server- and client-rendered path strings are byte-for-
  // byte identical — full float precision differs across JS engines and trips
  // React's hydration mismatch warning.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const fx = round2(cx + Math.cos(rad) * r);
  const fy = round2(cy - Math.sin(rad) * r);
  // Control point lifted above the chord for a satellite-like arc.
  const mx = round2((cx + fx) / 2);
  const my = round2((cy + fy) / 2 - 90);
  const path = `M ${cx} ${cy} Q ${mx} ${my} ${fx} ${fy}`;

  return (
    <div className={cn(tileBase, 'col-span-2 row-span-2 min-h-[260px]')}>
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-gold-light/80">
          {bilingual(lang, 'Live route', 'ផ្លូវ​ធ្វើដំណើរ')}
        </span>
        <span className="font-mono text-xs text-white/50">{HOME.iata} → {dest.iata}</span>
      </div>

      <svg viewBox="0 0 400 300" className="absolute inset-x-0 bottom-0 h-[85%] w-full" aria-hidden="true">
        {/* faint globe body */}
        <defs>
          <radialGradient id="tb-globe" cx="34%" cy="26%" r="80%">
            <stop offset="0%" stopColor="#23406a" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#14263f" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0b1526" stopOpacity="0.15" />
          </radialGradient>
          <linearGradient id="tb-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#C69749" />
            <stop offset="100%" stopColor="#F7EAC0" />
          </linearGradient>
        </defs>
        <circle cx="150" cy="230" r="150" fill="url(#tb-globe)" />
        {/* longitude hints */}
        {[0.35, 0.6, 0.85].map((k) => (
          <ellipse key={k} cx="150" cy="230" rx={150 * k} ry="150" fill="none" stroke="rgba(230,203,139,0.10)" strokeWidth="1" />
        ))}

        {/* base + flowing route line (reuses .arc-line dash-flow) */}
        <path d={path} fill="none" stroke="rgba(230,203,139,0.25)" strokeWidth="2" />
        <path id="tb-route" d={path} fill="none" stroke="url(#tb-arc)" strokeWidth="2.5" className={reduce ? '' : 'arc-line'} />

        {/* nodes */}
        <circle cx={cx} cy={cy} r="5" fill="#F7EAC0" className="arc-node" />
        <circle cx={fx} cy={fy} r="5" fill="#F7EAC0" className="arc-node" />

        {/* travelling plane */}
        <g className="hero-jet">
          <circle r="3.5" fill="#fff">
            {!reduce && (
              <animateMotion dur="4.5s" repeatCount="indefinite" rotate="auto">
                <mpath href="#tb-route" />
              </animateMotion>
            )}
          </circle>
        </g>
      </svg>

      <div className="absolute bottom-5 left-5 z-10">
        <p className="font-mono text-[11px] uppercase tracking-wider text-white/45">{bilingual(lang, 'Departing', 'ចេញដំណើរ')}</p>
        <p className="font-display text-lg font-bold text-white">{HOME.city}</p>
      </div>
      <div className="absolute bottom-5 right-5 z-10 text-right">
        <p className="font-mono text-[11px] uppercase tracking-wider text-white/45">{bilingual(lang, 'Arriving', 'មកដល់')}</p>
        <p className="font-display text-lg font-bold text-gold-bright">{dest.flag} {bilingual(lang, dest.city, dest.cityKm)}</p>
      </div>
    </div>
  );
}

/** Wide — boarding-pass style flight strip with a status pill. */
function FlightTile({ dest, lang }: { dest: Dest; lang: 'en' | 'km' }) {
  const flightNo = `K6 ${100 + dest.angle}`;
  return (
    <div className={cn(tileBase, 'col-span-2 flex flex-col justify-between')}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold-light/80">
          <Plane size={14} /> {bilingual(lang, 'Flight', 'ជើងហោះហើរ')}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-success" />
          {bilingual(lang, 'On time', 'ទាន់ពេល')}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-2xl font-bold tracking-tight text-white">{HOME.iata}</p>
          <p className="font-mono text-[11px] text-white/45">08:40</p>
        </div>
        <div className="flex-1 px-4">
          <div className="relative h-px bg-white/15">
            <Plane size={14} className="absolute -top-2 left-1/2 -translate-x-1/2 text-gold-light" />
          </div>
          <p className="mt-1 text-center font-mono text-[11px] text-white/40">{flightNo}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold tracking-tight text-white">{dest.iata}</p>
          <p className="font-mono text-[11px] text-white/45">{bilingual(lang, `Gate 12`, `ទ្វារ 12`)}</p>
        </div>
      </div>
    </div>
  );
}

/** Tall 1×2 — eSIM data meter that animates its fill on view / retarget. */
function EsimTile({ dest, lang, reduce }: { dest: Dest; lang: 'en' | 'km'; reduce: boolean }) {
  const pct = Math.round((dest.usedGb / dest.dataGb) * 100);
  const [fill, setFill] = useState(reduce ? pct : 0);

  useEffect(() => {
    if (reduce) {
      setFill(pct);
      return;
    }
    setFill(0);
    const id = requestAnimationFrame(() => setFill(pct));
    return () => cancelAnimationFrame(id);
  }, [pct, reduce]);

  return (
    <div className={cn(tileBase, 'row-span-2 flex flex-col justify-between')}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold-light/80">
        <Signal size={14} /> {bilingual(lang, 'eSIM data', 'ទិន្នន័យ eSIM')}
      </div>

      <div className="flex flex-col items-center py-4">
        {/* vertical meter */}
        <div className="relative h-32 w-8 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
          <div
            className="absolute inset-x-0 bottom-0 rounded-full bg-[linear-gradient(0deg,#C69749,#F7EAC0)] transition-[height] duration-1000 ease-smooth"
            style={{ height: `${fill}%`, boxShadow: '0 0 18px rgba(230,203,139,0.5)' }}
          />
        </div>
        <p className="mt-4 font-mono text-lg font-bold text-white">
          {dest.usedGb}
          <span className="text-white/40"> / {dest.dataGb} GB</span>
        </p>
        <p className="text-[11px] text-white/45">{bilingual(lang, `${dest.dataGb - dest.usedGb} GB left`, `នៅសល់ ${dest.dataGb - dest.usedGb} GB`)}</p>
      </div>

      <Link
        href={`/esim/${dest.slug}`}
        className="liquid-press inline-flex items-center justify-center gap-1.5 rounded-btn border border-gold-light/40 bg-white/5 px-3 py-2 text-sm font-semibold text-gold-bright transition-colors hover:bg-white/10"
      >
        {bilingual(lang, `Top up · from $${dest.priceUsd.toFixed(2)}`, `បញ្ចូល · ចាប់ពី $${dest.priceUsd.toFixed(2)}`)}
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

/** Small 1×1 — live clock in the destination's timezone. */
function ClockTile({ dest, lang }: { dest: Dest; lang: 'en' | 'km' }) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: dest.tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);
    } catch {
      return '--:--';
    }
  }, [now, dest.tz]);

  const offset = useMemo(() => tzOffsetHours(dest.tz) - tzOffsetHours(HOME.tz), [dest.tz]);
  const offsetLabel = offset === 0 ? bilingual(lang, 'same as home', 'ដូចផ្ទះ') : `${offset > 0 ? '+' : ''}${offset}h ${bilingual(lang, 'vs home', 'ពីផ្ទះ')}`;

  return (
    <div className={cn(tileBase, 'flex flex-col justify-between')}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold-light/80">
        <Clock3 size={14} /> {bilingual(lang, 'Local time', 'ម៉ោង​ក្នុងស្រុក')}
      </div>
      <div>
        <p className="font-mono text-3xl font-bold tracking-tight text-white tabular-nums">{time}</p>
        <p className="text-[11px] text-white/45">{bilingual(lang, dest.city, dest.cityKm)} · {offsetLabel}</p>
      </div>
    </div>
  );
}

/** Small 1×1 — Khmer phrase of the moment, tap-to-hear. */
function PhraseTile({ phrase, lang }: { phrase: (typeof PHRASES)[number]; lang: 'en' | 'km' }) {
  const speak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(phrase.km);
    u.lang = 'km-KH';
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <div className={cn(tileBase, 'flex flex-col justify-between')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-gold-light/80">
          {bilingual(lang, 'Say it in Khmer', 'និយាយជាភាសាខ្មែរ')}
        </span>
        <button
          type="button"
          onClick={speak}
          aria-label={bilingual(lang, 'Listen', 'ស្តាប់')}
          className="liquid-press flex h-8 w-8 items-center justify-center rounded-full border border-gold-light/40 bg-white/5 text-gold-bright transition-colors hover:bg-white/10"
        >
          <Volume2 size={15} />
        </button>
      </div>
      <div>
        <p className="font-khmer text-2xl font-bold text-white">{phrase.km}</p>
        <p className="text-[11px] text-white/50">{phrase.rom} · {phrase.en}</p>
      </div>
    </div>
  );
}

/* ───────────────────────── Helpers ───────────────────────── */

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

/** Current UTC offset (hours) for an IANA timezone, DST-aware. */
function tzOffsetHours(tz: string): number {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
    const m = name.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    return parseInt(m[1], 10) + (m[2] ? Math.sign(parseInt(m[1], 10)) * (parseInt(m[2], 10) / 60) : 0);
  } catch {
    return 0;
  }
}
