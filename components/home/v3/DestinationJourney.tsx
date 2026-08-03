'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The destination journey — six chapters, revealed in sequence.
//
// The order is the argument: you learn about the place first and are offered a
// product last, after you have already been given something worth having. The
// eSIM is the final helpful recommendation, not the toll gate.
//
// Chapter 3 gets the most design care because it is the one thing no competitor
// does: entry requirements for a *Cambodian* passport specifically. Every fact
// in it carries its verification date and, where one exists, a link to the
// official source — on the face of the card, not in a footnote. A fact marked
// `volatile` renders a confirm-before-you-book prompt instead of a confident
// number, because being visibly unsure about a genuinely unsettled rule is more
// useful than being confidently wrong.
//
// This component is shared by the homepage (after the flight) and by the
// server-rendered /destination/[slug] route, so the content is identical
// whether you flew here or arrived from a search engine.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Building2,
  CircleAlert,
  Clock,
  Phone,
  Plug,
  Signal,
  Sparkles,
  Ticket,
  TramFront,
} from 'lucide-react';
import type { DestinationGuide, Bi, Source } from '@/content/schema';
import { useBi, useLang } from '@/lib/i18n';
import { formatRate } from '@/lib/live/rates';
import { DestinationScene } from './destinationScene';
import { Recommendation } from './Recommendation';
import { useLive, useLocalClock } from './useLive';

/* ── Small shared pieces ───────────────────────────────────────────────── */

function Verified({ date, source, volatile: isVolatile }: { date: string; source?: Source; volatile?: boolean }) {
  const { t, lang } = useLang();
  const bi = useBi();
  // The verification date is a promise to the reader, so it is rendered in the
  // reader's own script — a Khmer page full of Khmer months should not switch to
  // English for the one field that says how much to trust the rest.
  const pretty = new Date(date).toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <p className={`v3-verified ${isVolatile ? 'is-volatile' : ''}`}>
      {isVolatile ? (
        <CircleAlert size={13} aria-hidden="true" />
      ) : (
        <BadgeCheck size={13} aria-hidden="true" />
      )}
      <span>
        {isVolatile && <strong>{t('v3.confirmFirst')} · </strong>}
        {t('v3.verified')} {pretty}
        {source && (
          <>
            {' · '}
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {bi(source.label)}
              <ArrowUpRight size={11} aria-hidden="true" />
            </a>
          </>
        )}
      </span>
    </p>
  );
}

function Chapter({
  id,
  eyebrow,
  title,
  children,
  wide,
}: {
  id: string;
  eyebrow: string;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  // Chapters arrive one at a time. IntersectionObserver rather than a scroll
  // library — it costs nothing and it is already how the rest of the repo does
  // reveals. Reduced motion is handled in CSS, where the class is a no-op.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) e.target.classList.add('is-in');
      },
      { rootMargin: '-8% 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} id={id} className={`v3-chapter ${wide ? 'v3-chapter-wide' : ''}`}>
      <p className="v3-eyebrow">{eyebrow}</p>
      {title && <h2 className="v3-chapter-title">{title}</h2>}
      {children}
    </section>
  );
}

/* ── The journey ───────────────────────────────────────────────────────── */

export function DestinationJourney({
  guide,
  onBack,
  onTravelled,
}: {
  guide: DestinationGuide;
  onBack?: () => void;
  /** Fired when an eSIM for this place is bought — the mark turns gold. */
  onTravelled?: () => void;
}) {
  const { t } = useLang();
  const bi = useBi();
  const live = useLive(guide.slug);
  const clock = useLocalClock(guide.geo.timezone);
  const { entry, basics, around, places } = guide;

  const kindLabel = (k: string) =>
    k === 'hidden-gem' ? t('v3.hiddenGem') : k === 'landmark' ? t('v3.landmark') : t('v3.popularKh');

  return (
    <div className="v3-journey">
      {/* ── Instrument strip: the place stays running while you read ──
          The way back lives here too. Floating a second pill over a sticky bar
          in the same corner reads as a bug, not as two controls. */}
      <div className="v3-strip">
        {onBack && (
          <button type="button" className="v3-back" onClick={onBack} aria-label={t('v3.back')}>
            <ArrowLeft size={15} aria-hidden="true" />
            <span className="v3-back-label">{t('v3.back')}</span>
          </button>
        )}
        <span className="v3-strip-city">{bi(guide.city)}</span>
        {clock && (
          <span className="v3-strip-item">
            <Clock size={13} aria-hidden="true" />
            {clock.time}
          </span>
        )}
        {live?.weather && (
          <span className="v3-strip-item">
            {live.weather.temperatureC}° {bi(live.weather.description)}
          </span>
        )}
      </div>

      {/* ── Chapter 1 · Arrival ── */}
      <header className="v3-hero">
        <DestinationScene
          slug={guide.slug}
          skyColor={guide.arrival.skyColor}
          horizonColor={guide.arrival.horizonColor}
          className="v3-hero-scene"
        />
        <div className="v3-hero-scrim" aria-hidden="true" />
        <div className="v3-hero-copy">
          <p className="v3-eyebrow">{t('v3.ch1.eyebrow')}</p>
          <h1 className="v3-hero-title">{bi(guide.city)}</h1>
          <p className="v3-hero-country">{bi(guide.country)}</p>
          <p className="v3-hero-meta">
            {clock ? `${clock.weekday}, ${clock.time}` : ' '}
            {live?.weather && ` · ${live.weather.temperatureC}° ${bi(live.weather.description)}`}
          </p>
          <p className="v3-hero-intro">{bi(guide.arrival.intro)}</p>
        </div>
      </header>

      {/* ── Chapter 2 · The basics ── */}
      <Chapter id="basics" eyebrow={t('v3.ch2.eyebrow')} title={t('v3.ch2.title')}>
        {live?.rates && (
          <div className="v3-rates">
            <span>
              <strong>$1</strong> = {basics.currency.symbol}
              {formatRate(live.rates.perUsd)}
            </span>
            <span className="v3-dot-sep" aria-hidden="true" />
            <span>
              <strong>1,000៛</strong> = {basics.currency.symbol}
              {formatRate(live.rates.perThousandKhr)}
            </span>
            <span className="v3-rates-note">
              {t('v3.updatedDaily')}
              {live.rates.khrIsIndicative && ` · ${t('v3.indicative')}`}
            </span>
          </div>
        )}

        <div className="v3-grid-3">
          <div className="v3-card">
            <p className="v3-card-label">
              <Banknote size={15} aria-hidden="true" /> {t('v3.currency')}
            </p>
            <p className="v3-card-value">
              {basics.currency.symbol} {basics.currency.code}
            </p>
            <p className="v3-card-note">{bi(basics.currency.name)}</p>
          </div>
          <div className="v3-card">
            <p className="v3-card-label">
              <Plug size={15} aria-hidden="true" /> {t('v3.power')}
            </p>
            <p className="v3-card-value">{basics.plugTypes.join(' / ')}</p>
            <p className="v3-card-note">{basics.voltage}</p>
          </div>
          <div className="v3-card">
            <p className="v3-card-label">
              <Signal size={15} aria-hidden="true" /> {t('v3.network')}
            </p>
            <p className="v3-card-value">{basics.networks[0]?.name}</p>
            <p className="v3-card-note">
              {basics.networks
                .slice(1)
                .map((n) => n.name)
                .join(' · ') || bi({ en: 'Nationwide coverage', km: 'គ្របដណ្តប់ទូទាំងប្រទេស' })}
            </p>
          </div>
        </div>

        <div className="v3-buys">
          <p className="v3-card-label">{t('v3.buys')}</p>
          <ul>
            {basics.tenDollarsBuys.map((b) => (
              <li key={b.localPrice + b.item.en}>
                <span>{bi(b.item)}</span>
                <span className="v3-buys-price">{b.localPrice}</span>
              </li>
            ))}
          </ul>
          <p className="v3-card-note">
            {t('v3.language')}: {basics.languages.map((l) => bi(l)).join(', ')} ·{' '}
            <span className="v3-native">{basics.hello.native}</span> ({basics.hello.roman})
          </p>
        </div>

        <Verified date={basics.lastVerified} source={basics.source} volatile={basics.volatile} />
      </Chapter>

      {/* ── Chapter 3 · Getting in ── the reason this page exists ── */}
      <Chapter id="entry" eyebrow={t('v3.ch3.eyebrow')} title={t('v3.ch3.title')} wide>
        {entry.advisory && (
          <div className="v3-advisory" role="note">
            <p className="v3-advisory-title">
              <AlertTriangle size={17} aria-hidden="true" />
              {bi(entry.advisory.title)}
            </p>
            <p className="v3-advisory-body">{bi(entry.advisory.detail)}</p>
            <Verified
              date={entry.advisory.lastVerified}
              source={entry.advisory.source}
              volatile={entry.advisory.volatile}
            />
          </div>
        )}

        <div className={`v3-visa ${entry.visa.volatile ? 'is-volatile' : ''}`}>
          <p className="v3-visa-kind">
            {entry.visa.kind === 'visa-free' && bi({ en: 'No visa needed', km: 'មិនត្រូវការទិដ្ឋាការ' })}
            {entry.visa.kind === 'visa-on-arrival' && bi({ en: 'Visa on arrival', km: 'ទិដ្ឋាការពេលមកដល់' })}
            {entry.visa.kind === 'e-visa' && bi({ en: 'E-visa', km: 'ទិដ្ឋាការអេឡិចត្រូនិក' })}
            {entry.visa.kind === 'embassy-visa' && bi({ en: 'Visa required', km: 'ត្រូវការទិដ្ឋាការ' })}
            {entry.visa.kind === 'check-before-booking' &&
              bi({ en: 'Check before booking', km: 'ពិនិត្យមុនកក់' })}
          </p>
          <p className="v3-visa-summary">{bi(entry.visa.summary)}</p>
          <div className="v3-visa-facts">
            {entry.visa.maxStayDays != null && (
              <span>
                {bi({ en: 'Stay up to', km: 'ស្នាក់នៅរហូតដល់' })} <strong>{entry.visa.maxStayDays}</strong>{' '}
                {t('v3.rec.days')}
              </span>
            )}
            {entry.visa.costUsd != null && (
              <span>
                {entry.visa.costUsd === 0
                  ? bi({ en: 'Free', km: 'ឥតគិតថ្លៃ' })
                  : `~$${entry.visa.costUsd}`}
              </span>
            )}
            {entry.visa.processingTime && <span>{bi(entry.visa.processingTime)}</span>}
          </div>
          {entry.visa.applyUrl && (
            <a className="v3-link" href={entry.visa.applyUrl} target="_blank" rel="noopener noreferrer">
              {bi({ en: 'Official page', km: 'ទំព័រផ្លូវការ' })}
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          )}
          <Verified date={entry.visa.lastVerified} source={entry.visa.source} volatile={entry.visa.volatile} />
        </div>

        <h3 className="v3-subhead">{t('v3.beforeYouFly')}</h3>
        <ul className="v3-reqs">
          {entry.requirements.map((r) => (
            <li key={r.id} className="v3-req">
              <span className={`v3-req-tag ${r.mandatory ? 'is-required' : ''}`}>
                {r.mandatory ? t('v3.required') : t('v3.recommended')}
              </span>
              <div className="v3-req-body">
                <p className="v3-req-title">{bi(r.title)}</p>
                <p className="v3-req-detail">{bi(r.detail)}</p>
                {r.window?.opensDaysBefore != null && (
                  <p className="v3-req-window">
                    <Clock size={12} aria-hidden="true" />
                    {bi({
                      en: `From ${r.window.opensDaysBefore} days before you fly`,
                      km: `ចាប់ពី ${r.window.opensDaysBefore} ថ្ងៃមុនអ្នកហោះហើរ`,
                    })}
                  </p>
                )}
                {r.url && (
                  <a className="v3-link" href={r.url} target="_blank" rel="noopener noreferrer">
                    {bi({ en: 'Open the official form', km: 'បើកទម្រង់ផ្លូវការ' })}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                )}
                <Verified date={r.lastVerified} source={r.source} volatile={r.volatile} />
              </div>
            </li>
          ))}
        </ul>

        <div className="v3-grid-2">
          <div className="v3-card">
            <p className="v3-card-label">
              <Ticket size={15} aria-hidden="true" /> {t('v3.passport')}
            </p>
            <p className="v3-card-value">
              {entry.passportValidity.monthsBeyondStay}{' '}
              {bi({ en: 'months', km: 'ខែ' })}
            </p>
            <p className="v3-card-note">
              {entry.passportValidity.note
                ? bi(entry.passportValidity.note)
                : bi({
                    en: 'Beyond the end of your stay.',
                    km: 'បន្ទាប់ពីថ្ងៃបញ្ចប់ការស្នាក់នៅ។',
                  })}
            </p>
          </div>
          <div className="v3-card">
            <p className="v3-card-label">{t('v3.customs')}</p>
            <ul className="v3-banned">
              {entry.customs.banned.map((b) => (
                <li key={b.en}>{bi(b)}</li>
              ))}
            </ul>
            {entry.customs.cashDeclareOverUsd != null && (
              <p className="v3-card-note">
                {t('v3.declareCash')} ${entry.customs.cashDeclareOverUsd.toLocaleString('en-US')}
              </p>
            )}
          </div>
        </div>

        <h3 className="v3-subhead">{t('v3.ifWrong')}</h3>
        <div className="v3-emergency">
          <div className="v3-emergency-numbers">
            {[
              { label: t('v3.police'), value: entry.emergency.police },
              { label: t('v3.ambulance'), value: entry.emergency.ambulance },
              { label: t('v3.fire'), value: entry.emergency.fire },
            ].map((n) => (
              <a key={n.label} href={`tel:${n.value}`} className="v3-emergency-number">
                <span>{n.label}</span>
                <strong>{n.value}</strong>
              </a>
            ))}
          </div>

          {entry.emergency.khmerMission && (
            <div className="v3-mission">
              <p className="v3-card-label">
                <Building2 size={15} aria-hidden="true" />
                {bi(entry.emergency.khmerMission.name)}
              </p>
              {entry.emergency.khmerMission.address && (
                <p className="v3-mission-line">{bi(entry.emergency.khmerMission.address)}</p>
              )}
              {entry.emergency.khmerMission.phone && (
                <a className="v3-mission-line v3-link" href={`tel:${entry.emergency.khmerMission.phone}`}>
                  <Phone size={13} aria-hidden="true" />
                  {entry.emergency.khmerMission.phone}
                </a>
              )}
              {entry.emergency.khmerMission.note && (
                <p className="v3-card-note">{bi(entry.emergency.khmerMission.note)}</p>
              )}
              {entry.emergency.khmerMission.url && (
                <a
                  className="v3-link"
                  href={entry.emergency.khmerMission.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {bi({ en: 'Mission details', km: 'ព័ត៌មានស្ថានតំណាង' })}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>
        <Verified date={entry.emergency.lastVerified} source={entry.emergency.source} />
      </Chapter>

      {/* ── Chapter 4 · Getting around ── */}
      <Chapter id="around" eyebrow={t('v3.ch4.eyebrow')} title={t('v3.ch4.title')}>
        <ul className="v3-transfers">
          {around.fromAirport.map((f) => (
            <li key={f.mode.en}>
              <div>
                <p className="v3-transfer-mode">{bi(f.mode)}</p>
                {f.note && <p className="v3-card-note">{bi(f.note)}</p>}
              </div>
              <div className="v3-transfer-figures">
                <span className="v3-transfer-time">{f.durationMins} min</span>
                <span className="v3-transfer-cost">
                  {f.costLocal} <span>≈ ${f.costUsd}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="v3-grid-2">
          {around.transitCard && (
            <div className="v3-card">
              <p className="v3-card-label">
                <TramFront size={15} aria-hidden="true" /> {t('v3.transitCard')}
              </p>
              <p className="v3-card-value">{around.transitCard.name}</p>
              <p className="v3-card-note">{bi(around.transitCard.note)}</p>
              <p className={`v3-flag ${around.transitCard.inPhoneWallet ? 'is-yes' : 'is-no'}`}>
                {around.transitCard.inPhoneWallet ? t('v3.inWallet') : t('v3.notInWallet')}
              </p>
            </div>
          )}
          <div className="v3-card">
            <p className="v3-card-label">{t('v3.yourCard')}</p>
            <p className="v3-card-value">
              {around.money.cambodianCardAccepted === 'widely'
                ? t('v3.cardWidely')
                : around.money.cambodianCardAccepted === 'sometimes'
                  ? t('v3.cardSometimes')
                  : t('v3.cardRarely')}
            </p>
            <p className={`v3-flag ${around.money.khqrAccepted ? 'is-yes' : 'is-no'}`}>
              {around.money.khqrAccepted ? t('v3.khqrYes') : t('v3.khqrNo')}
            </p>
            <p className="v3-card-note">{bi(around.money.khqrNote)}</p>
          </div>
        </div>

        <div className="v3-apps">
          <p className="v3-card-label">{t('v3.apps')}</p>
          <ul>
            {around.apps.map((a) => (
              <li key={a.name}>
                <strong>{a.name}</strong>
                <span>{bi(a.purpose)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="v3-prose">{bi(around.money.cashCulture)}</p>
        <p className="v3-prose">
          <strong>{t('v3.tipping')}:</strong> {bi(around.money.tipping)}
        </p>
        <Verified date={around.lastVerified} source={around.source} volatile={around.volatile} />
      </Chapter>

      {/* ── Chapter 5 · Why you go ── */}
      <Chapter id="places" eyebrow={t('v3.ch5.eyebrow')} title={t('v3.ch5.title')}>
        <ul className="v3-places">
          {places.list.map((p) => (
            <li key={p.name.en} className="v3-place">
              <span className={`v3-place-kind kind-${p.kind}`}>
                {p.kind === 'hidden-gem' && <Sparkles size={12} aria-hidden="true" />}
                {kindLabel(p.kind)}
              </span>
              <p className="v3-place-name">{bi(p.name)}</p>
              <p className="v3-place-why">{bi(p.why)}</p>
              <p className="v3-place-meta">
                {bi(p.area)}
                {p.bestTime && ` · ${bi(p.bestTime)}`}
                {p.roughCostUsd != null &&
                  ` · ${p.roughCostUsd === 0 ? bi({ en: 'free', km: 'ឥតគិតថ្លៃ' }) : `~$${p.roughCostUsd}`}`}
              </p>
            </li>
          ))}
        </ul>
        <Verified date={places.lastVerified} source={places.source} volatile={places.volatile} />
      </Chapter>

      {/* ── Chapter 6 · And only now, the eSIM ── */}
      <Chapter id="esim" eyebrow={t('v3.ch6.eyebrow')} title={t('v3.ch6.title')}>
        <Recommendation guide={guide} onBought={onTravelled} />

        <div className="v3-trust">
          <p className="v3-card-label">{t('v3.trust.title')}</p>
          <ul>
            <li>{t('v3.trust.refund')}</li>
            <li>{t('v3.trust.khmer')}</li>
            <li>{t('v3.trust.pay')}</li>
            <li>{t('v3.trust.noContract')}</li>
          </ul>
          <Link href="/refunds" className="v3-link">
            {t('v3.trust.policy')}
          </Link>
        </div>
      </Chapter>
    </div>
  );
}

/** Somewhere we have not written up yet. It says so, and offers what is real. */
export function UnwrittenDestination({
  name,
  esimSlug,
}: {
  name: string;
  esimSlug: string | null;
}) {
  const { t } = useLang();
  return (
    <div className="v3-journey">
      <section className="v3-chapter is-in">
        <p className="v3-eyebrow">{t('v3.ch1.eyebrow')}</p>
        <h1 className="v3-chapter-title">{name}</h1>
        <p className="v3-prose">
          <strong>{t('v3.noGuideTitle')}</strong>
        </p>
        <p className="v3-prose">{t('v3.noGuideBody')}</p>
        {esimSlug && (
          <Link href={`/esim/${esimSlug}`} className="v3-btn v3-btn-primary">
            {t('v3.noGuideCta')}
          </Link>
        )}
      </section>
    </div>
  );
}

export type { Bi };
