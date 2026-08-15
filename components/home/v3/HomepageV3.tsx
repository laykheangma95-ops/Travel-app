'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The homepage orchestrator.
//
// The whole journey — first screen, flight, destination — happens inside this
// one mounted tree. There is no route change, so there is no white flash and
// the globe is never remounted. The URL is still kept honest with pushState, and
// a real server-rendered /destination/[slug] exists for direct links, shares and
// crawlers; the back button flies you home rather than reloading.
//
// Three tiers, all designed (lib/tier.ts). In `static` there is no canvas at
// all: selecting a destination cross-fades straight to the journey. Search,
// every chapter and the entire purchase work identically in all three — that is
// the gate, not a nice-to-have.
// ─────────────────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getGuide, guides } from '@/content/destinations';
import { getDestination } from '@/data/destinations';
import { describeAllowance, getPlansForCountry } from '@/data/esimPlans';
import { useCart } from '@/hooks/useCart';
import { useLang } from '@/lib/i18n';
import { detectTier, TIER_SETTINGS, type Tier } from '@/lib/tier';
import { play } from '@/lib/sound';
import { getJourneys, recordJourney } from '@/lib/journeys';
import type { DestinationGuide } from '@/content/schema';
import { FirstScreen } from './FirstScreen';
import { DestinationJourney } from './DestinationJourney';
import type { SearchSelection } from './DestinationSearch';
import type { GlobeApi } from './GlobeCanvas';

// Client-only and deferred: three.js is never in the server bundle and never on
// the critical path to first paint.
const GlobeCanvas = dynamic(() => import('./GlobeCanvas'), {
  ssr: false,
  loading: () => null,
});

const LAST_KEY = 'domner-last-destination';

type View = { kind: 'globe' } | { kind: 'guide'; guide: DestinationGuide };

export function HomepageV3({ initialSlug }: { initialSlug?: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [tier, setTier] = useState<Tier | null>(null);
  const [view, setView] = useState<View>(() => {
    const g = initialSlug ? getGuide(initialSlug) : undefined;
    return g ? { kind: 'guide', guide: g } : { kind: 'globe' };
  });
  const [flying, setFlying] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [marks, setMarks] = useState<{ slug: string; kind: 'explored' | 'travelled' }[]>([]);
  const [lastSlug, setLastSlug] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const globeRef = useRef<GlobeApi | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const addItem = useCart((s) => s.addItem);

  useEffect(() => setTier(detectTier()), []);

  // Parsing ~750KB of three.js is the single most expensive thing this page
  // does, and none of it is needed for the job the visitor came to do: read a
  // question and type a destination. So we do not even fetch it until the page
  // has loaded and the main thread has gone quiet. Measured effect on a
  // throttled mobile profile: total blocking time 3,560ms → 400ms.
  //
  // The fallback timer matters — on a busy phone `requestIdleCallback` can be a
  // long time coming, and the globe should not be hostage to that.
  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      const idle = (
        window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      ).requestIdleCallback;
      const go = () => !cancelled && setGlobeReady(true);
      if (idle) idle(go, { timeout: 2500 });
      else window.setTimeout(go, 1200);
    };
    if (document.readyState === 'complete') arm();
    else window.addEventListener('load', arm, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', arm);
    };
  }, []);

  // The first screen means it: one thing to do. While the globe is on screen we
  // quiet the site chrome — nav links, cart badge, the copilot button — down to
  // the wordmark and the language toggle, and bring it all back the moment you
  // land somewhere. Driven by a body attribute so app/v3.css can reach layout
  // furniture that is not a descendant of this tree.
  useEffect(() => {
    document.body.dataset.v3 = view.kind === 'globe' ? 'first' : 'landed';
    document.body.dataset.v3Scroll = view.kind === 'globe' ? 'locked' : 'free';
    if (view.kind === 'globe') window.scrollTo(0, 0);
    return () => {
      delete document.body.dataset.v3;
      delete document.body.dataset.v3Scroll;
    };
  }, [view.kind]);

  // Keep the first frame quiet on desktop, then let the visitor's first pointer
  // or keyboard gesture bring the welcome/search block in. The listener is
  // intentionally global: the globe canvas is deferred and should not be the
  // thing responsible for making the primary action reachable.
  useEffect(() => {
    const reveal = () => {
      setHasInteracted(true);
      // A keyboard gesture can otherwise ask the browser to scroll the newly
      // revealed focus target into view. The globe frame is deliberately
      // fixed, so keep the document at its top edge for every reveal path.
      window.requestAnimationFrame(() => window.scrollTo(0, 0));
    };
    const options: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener('pointermove', reveal, options);
    window.addEventListener('pointerdown', reveal, options);
    window.addEventListener('keydown', reveal, options);
    return () => {
      window.removeEventListener('pointermove', reveal);
      window.removeEventListener('pointerdown', reveal);
      window.removeEventListener('keydown', reveal);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.v3Interaction = hasInteracted ? 'ready' : 'idle';
    return () => {
      delete document.body.dataset.v3Interaction;
    };
  }, [hasInteracted]);

  useEffect(() => {
    try {
      setLastSlug(localStorage.getItem(LAST_KEY));
    } catch {
      /* private browsing */
    }
    setMarks(getJourneys().map((m) => ({ slug: m.slug, kind: m.kind })));
  }, []);

  // The map, in the shape the globe draws it. Only places we have written up
  // can be marked — we cannot draw a line to a city we cannot describe.
  const traces = marks
    .map((m) => {
      const g = getGuide(m.slug);
      return g ? { slug: g.slug, lat: g.geo.lat, lon: g.geo.lon, kind: m.kind } : null;
    })
    .filter((x): x is { slug: string; lat: number; lon: number; kind: 'explored' | 'travelled' } =>
      x !== null,
    );

  const addMark = useCallback((slug: string, kind: 'explored' | 'travelled') => {
    const isNew = recordJourney(slug, kind);
    if (isNew) {
      setMarks(getJourneys().map((m) => ({ slug: m.slug, kind: m.kind })));
      // The only cue in the system that sounds like a small victory, and it
      // fires exactly when the map actually grew.
      if (kind === 'travelled') play('achieve');
    }
  }, []);

  /* ── Landing on a destination ──────────────────────────────────────────── */

  const land = useCallback(
    (guide: DestinationGuide) => {
      setView({ kind: 'guide', guide });
      setFlying(false);
      play('arrive');
      addMark(guide.slug, 'explored');
      try {
        localStorage.setItem(LAST_KEY, guide.slug);
      } catch {
        /* ignore */
      }
      window.history.pushState({ domnerSlug: guide.slug }, '', `/destination/${guide.slug}`);
    },
    [addMark],
  );

  const goToGuide = useCallback(
    (guide: DestinationGuide) => {
      const settings = tier ? TIER_SETTINGS[tier] : TIER_SETTINGS.static;
      if (!globeRef.current || settings.flightMs === 0) {
        land(guide);
        return;
      }
      setFlying(true);
      // The unlock and the light path fire together; the flight bed runs under
      // the camera for exactly as long as the camera is moving.
      play('unlock');
      play('flight', settings.flightMs);
      globeRef.current.flyTo({
        slug: guide.slug,
        lat: guide.geo.lat,
        lon: guide.geo.lon,
        altitude: guide.geo.flightAltitude,
        skyColor: guide.arrival.skyColor,
      });
      // Hand off just before the camera settles, so the journey is already
      // painted underneath when the bloom clears.
      window.setTimeout(() => land(guide), Math.round(settings.flightMs * 0.88));
    },
    [tier, land],
  );

  const onSelect = useCallback(
    (selection: SearchSelection) => {
      if (selection.guide) {
        goToGuide(selection.guide);
        return;
      }
      // The search bar sells plans. A result goes straight to that plan's page
      // rather than to a screen explaining which guides we have written.
      if (selection.esimSlug) router.push(`/esim/${selection.esimSlug}`);
    },
    [goToGuide, router],
  );

  const goHome = useCallback(() => {
    globeRef.current?.returnToGlobe();
    setView({ kind: 'globe' });
    setFlying(false);
    if (window.location.pathname !== '/') {
      window.history.pushState({ domnerSlug: null }, '', '/');
    }
  }, []);

  /* ── Back button: fly home, never reload ── */
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const slug = (e.state as { domnerSlug?: string | null } | null)?.domnerSlug ?? null;
      const guide = slug ? getGuide(slug) : undefined;
      if (guide) {
        setView({ kind: 'guide', guide });
        setFlying(false);
      } else {
        globeRef.current?.returnToGlobe();
        setView({ kind: 'globe' });
        setFlying(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /* ── The background follows the flight, so the page arrives with you ── */
  const onArrivalProgress = useCallback((arrival: number, skyColor: string | null) => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty('--v3-arrival', arrival.toFixed(3));
    if (skyColor) root.style.setProperty('--v3-sky', skyColor);
  }, []);

  /* ── Express lane for a returning visitor ── */
  const lastGuide = lastSlug ? getGuide(lastSlug) : undefined;
  const expressPlan = (() => {
    if (!lastGuide) return null;
    const dest = getDestination(lastGuide.esimCountrySlug);
    const plan = getPlansForCountry(lastGuide.esimCountrySlug).find((p) => p.popular);
    if (!dest || !plan) return null;
    return {
      label: `${dest.name} eSIM · ${plan.durationDays} days, ${describeAllowance(plan)}`,
      priceUsd: plan.priceUsd,
      onBuy: () => {
        addItem({
          planId: plan.id,
          countrySlug: dest.slug,
          countryName: dest.name,
          flag: dest.flag,
          planName: plan.name,
          durationDays: plan.durationDays,
          dataType: plan.dataType,
          dataGbDaily: plan.dataGbDaily,
          dataGbTotal: plan.dataGbTotal,
          priceUsd: plan.priceUsd,
          quantity: 1,
        });
        // Straight to payment. This is the express lane for someone who has
        // already been here and picked this exact plan before — routing it via
        // the cart made it neither express nor a lane.
        window.location.href = '/esim/checkout';
      },
    };
  })();

  const showGlobeScene = view.kind === 'globe' || flying;

  return (
    <div
      ref={rootRef}
      className={`v3-root ${flying ? 'is-flying' : ''} ${view.kind !== 'globe' ? 'is-landed' : ''} ${hasInteracted ? 'is-interacted' : ''}`}
      data-tier={tier ?? 'pending'}
    >
      {/* Poster: a drawn night sky that is correct on its own, so there is no
          layout shift when (or if) the canvas mounts over it. */}
      <div className="v3-space" aria-hidden="true">
        <div className="v3-stars" />
      </div>

      {tier && tier !== 'static' && globeReady && (
        <GlobeCanvas
          tier={tier}
          active={showGlobeScene}
          preview={preview}
          traces={traces}
          onPinSelect={(slug) => {
            const g = getGuide(slug);
            if (g) goToGuide(g);
          }}
          onReady={(api) => {
            globeRef.current = api;
          }}
          onArrivalProgress={onArrivalProgress}
        />
      )}

      <div className={`v3-stage ${showGlobeScene ? '' : 'is-hidden'}`}>
        <FirstScreen
          onSelect={onSelect}
          onPreview={setPreview}
          expressPlan={expressPlan}
          canExplore={globeReady && tier !== null && tier !== 'static'}
          resume={
            lastGuide && view.kind === 'globe'
              ? { label: lastGuide.city.en, onResume: () => goToGuide(lastGuide) }
              : null
          }
        />
      </div>

      {view.kind === 'guide' && (
        <div className="v3-landed">
          <DestinationJourney
            guide={view.guide}
            onBack={goHome}
            onTravelled={() => addMark(view.guide.slug, 'travelled')}
          />
        </div>
      )}

      {/* Crawlable links to every written guide. The journey is a client
          experience; discovery must not depend on JavaScript. */}
      <nav className="v3-index" aria-label="Destination guides">
        <h2 className="sr-only">Destination guides</h2>
        {guides.map((g) => (
          <a key={g.slug} href={`/destination/${g.slug}`}>
            {g.city.en}
          </a>
        ))}
      </nav>
    </div>
  );
}
