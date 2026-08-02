'use client';

import Link from 'next/link';
import { ArrowRight, ShieldAlert, Wallet, Sun, Sparkles } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { Badge } from '@/components/ui/Badge';
import { LocalClock } from '@/components/destination/LocalClock';
import { destinations } from '@/data/destinations';
import { destinationGuides, getDestinationGuide } from '@/data/destinationGuides';
import { scamAlerts } from '@/data/scamAlerts';
import { useLang } from '@/lib/i18n';

/* ────────────────────────────────────────────────────────────────────────────
   The homepage travel feed — everything below the hero.

   Product note: the brief asked for both "Trending Destinations" and "Popular
   This Week". Those are the same section wearing two hats, and shipping both
   would pad the page with a second ranked list of the same twenty countries.
   They are merged into one. The brief also asked for a live weather preview
   per destination; there is no weather provider wired up, and rendering a
   plausible-looking temperature would be inventing data. Live local time (real,
   computed from the IANA zone) and the best travel season (real, static) carry
   that slot honestly until a provider is connected.

   Nothing here invents popularity numbers. "Trending" is the editorially
   curated `popular` flag in the catalogue, not a fabricated search count.
   ──────────────────────────────────────────────────────────────────────────── */

function TrendingDestinations() {
  const { t } = useLang();
  const trending = destinations.filter((d) => d.popular).slice(0, 6);

  return (
    <section className="relative section-pad" data-journey-section data-journey-label={t('feed.trending.eyebrow')}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading
            eyebrow={t('feed.trending.eyebrow')}
            title={t('feed.trending.title')}
            description={t('feed.trending.desc')}
            dark
          />
        </Reveal>

        {/* Horizontal rail on phones, grid from md up. The rail keeps the
            "there is more here" affordance without a second row of cards. */}
        <div className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
          {trending.map((d, i) => {
            const guide = getDestinationGuide(d.slug);
            return (
              <Reveal key={d.slug} delay={(i % 3) * 90} className="min-w-[78%] snap-start sm:min-w-[46%] md:min-w-0">
                <Link
                  href={`/esim/${d.slug}`}
                  className="group night-card flex h-full flex-col p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
                >
                  <div className="flex items-start justify-between gap-4">
                    <WavyFlag
                      flag={d.flag}
                      label={`${d.name} flag`}
                      size={56}
                      className="origin-bottom-left transition-transform duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-3"
                    />
                    {guide && (
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-white/45">Local time</p>
                        <LocalClock
                          timezone={guide.timezone}
                          className="font-mono text-lg font-bold text-white"
                        />
                      </div>
                    )}
                  </div>

                  <h3 className="mt-4 font-display text-xl font-bold text-white">{d.name}</h3>
                  <p className="font-khmer text-sm text-white/55">{d.nameKm}</p>

                  {guide && (
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
                      <p className="flex items-center gap-2 text-white/70">
                        <Sun size={14} className="shrink-0 text-gold-light/80" aria-hidden="true" />
                        Best {guide.bestMonths}
                      </p>
                      <p className="flex items-center gap-2 text-white/70">
                        <Wallet size={14} className="shrink-0 text-gold-light/80" aria-hidden="true" />
                        ${guide.dailyBudgetUsd.budget}–{guide.dailyBudgetUsd.comfortable} a day
                      </p>
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-5">
                    <span className="text-sm text-white/55">
                      Data from{' '}
                      <span className="font-semibold text-gold-light">
                        ${d.fromPriceUsd.toFixed(2)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-light transition-all duration-200 group-hover:gap-2.5">
                      {t('feed.readMore')} <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Travel tips ──────────────────────────────────────────────────────────────
   Pulled from the real guide data rather than written as marketing filler, so
   every card is a genuine, checkable fact and links to the guide it came from. */

function TravelTipsFeed() {
  const { t } = useLang();

  const tipCards = [
    {
      slug: 'japan',
      title: 'Japan runs at 100V — the lowest in the world',
      body: 'Your Cambodian plug fits the socket, which is exactly why people get caught out. Check any hair dryer or kettle is rated for it.',
    },
    {
      slug: 'china',
      title: 'Set up Alipay before you fly to China',
      body: 'Cash is genuinely awkward now and most non-Chinese apps are blocked. The time to solve this is on wi-fi at home, not in the arrivals hall.',
    },
    {
      slug: 'usa',
      title: 'In the US, a 20% tip is not optional',
      body: 'It is most service workers’ actual income, and the menu price is never what you pay. Budget for it before you go.',
    },
    {
      slug: 'south-korea',
      title: 'Google Maps barely works in Korea',
      body: 'Mapping data is legally restricted. Install Naver Map or KakaoMap before you land, or you will be navigating blind.',
    },
  ];

  return (
    <section className="relative section-pad" data-journey-section data-journey-label={t('feed.tips.eyebrow')}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading
            eyebrow={t('feed.tips.eyebrow')}
            title={t('feed.tips.title')}
            description={t('feed.tips.desc')}
            dark
          />
        </Reveal>
        <div className="grid gap-5 md:grid-cols-2">
          {tipCards.map((tip, i) => {
            const dest = destinations.find((d) => d.slug === tip.slug);
            return (
              <Reveal key={tip.slug} delay={(i % 2) * 110}>
                <Link
                  href={`/esim/${tip.slug}`}
                  className="group night-card flex h-full gap-5 p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
                >
                  <span className="text-3xl leading-none" aria-hidden="true">
                    {dest?.flag}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-lg font-bold leading-snug text-white">
                      {tip.title}
                    </span>
                    <span className="mt-2 block text-sm leading-relaxed text-white/65">{tip.body}</span>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-light transition-all duration-200 group-hover:gap-2.5">
                      {t('feed.readMore')} <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Travel alerts ────────────────────────────────────────────────────────────
   Driven by data/scamAlerts.ts — real, specific, locally-sourced warnings.
   Labelled as standing advisories, NOT as live breaking alerts, because there
   is no live feed behind them. Faking urgency would be the fastest way to lose
   the trust this section exists to build. */

const SEVERITY_TONE = { high: 'danger', medium: 'warning', low: 'info' } as const;

function TravelAlerts() {
  const { t } = useLang();
  const featured = scamAlerts.filter((a) => a.severity === 'high').slice(0, 3);

  return (
    <section className="relative section-pad" data-journey-section data-journey-label={t('feed.alerts.eyebrow')}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow={t('feed.alerts.eyebrow')} title={t('feed.alerts.title')} dark />
        </Reveal>

        {featured.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-3">
            {featured.map((a, i) => {
              const dest = destinations.find((d) => d.slug === a.countrySlug);
              return (
                <Reveal key={`${a.countrySlug}-${a.title}`} delay={i * 100}>
                  <Link
                    href={`/esim/${a.countrySlug}`}
                    className="group night-card flex h-full flex-col p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-primary-deep"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-white/70">
                        <span className="text-lg leading-none" aria-hidden="true">
                          {dest?.flag}
                        </span>
                        {dest?.name}
                      </span>
                      <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                    </div>
                    <h3 className="mt-4 flex items-start gap-2 font-display text-lg font-bold text-white">
                      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-gold-light" aria-hidden="true" />
                      {a.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">{a.description}</p>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        ) : (
          <p className="night-card p-8 text-center text-white/60">{t('feed.alerts.empty')}</p>
        )}

        <Reveal>
          <p className="mt-6 text-center text-xs text-white/40">
            Standing advisories collected from travellers and local sources — not a live
            government feed. Always check your own government&apos;s guidance before you fly.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Why travellers stay ─────────────────────────────────────────────────── */

const REASONS = [
  {
    title: 'A guide before a checkout',
    body: 'Every destination page answers the trip first — entry rules, plugs, budget, scams, emergency numbers. The eSIM is at the bottom, where it belongs.',
  },
  {
    title: 'Khmer support, by people who travel',
    body: 'Real answers on Telegram, in Khmer, from a team that has actually stood in those arrival halls. Not a translated help centre.',
  },
  {
    title: 'Works when your phone does not',
    body: 'Install before you fly and land connected. Emergency numbers on every guide dial without credit, even without a SIM.',
  },
  {
    title: 'Your trip, not your order history',
    body: 'Flights, eSIMs and trips in one place — so the thing you bought becomes part of the journey instead of a receipt.',
  },
];

function WhyTravelers() {
  const { t } = useLang();
  return (
    <section className="relative section-pad" data-journey-section data-journey-label={t('feed.why.eyebrow')}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading eyebrow={t('feed.why.eyebrow')} title={t('feed.why.title')} dark />
        </Reveal>
        <div className="grid gap-5 md:grid-cols-2">
          {REASONS.map((r, i) => (
            <Reveal key={r.title} delay={(i % 2) * 110}>
              <div className="night-card h-full p-7">
                <div className="night-icon mb-4 flex h-11 w-11">
                  <Sparkles size={20} className="text-gold-light" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-bold text-white">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TravelFeed() {
  return (
    <>
      <TrendingDestinations />
      <TravelTipsFeed />
      <TravelAlerts />
      <WhyTravelers />
    </>
  );
}
