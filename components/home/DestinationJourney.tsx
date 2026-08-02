'use client';

/**
 * DestinationJourney — chapters two through six of the reveal.
 *
 * The order is the entire argument. A traveller's real questions arrive in a
 * sequence — *what time is it there, what does it cost, will they let me in,
 * how do I get around, what will I remember* — and the eSIM is the answer to
 * none of them. So it is last, after every question has already been answered
 * for free. By the time the plan appears it reads as the final helpful
 * suggestion from something that has been useful for five straight screens,
 * rather than the opening pitch of a shop.
 *
 * Each chapter is a scroll beat: gold eyebrow, chapter number, one idea, then
 * cards rising in sequence (`Reveal`, staggered). Everything sits on the same
 * night sky the globe is flying through — no light cards, no energy drop.
 */

import Link from 'next/link';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CreditCard,
  Languages,
  Lightbulb,
  type LucideIcon,
  Phone,
  Plug,
  Route,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Wifi,
} from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { getPlansForCountry } from '@/data/esimPlans';
import { getScamAlerts } from '@/data/scamAlerts';
import { getCustomsRule } from '@/data/customsRules';
import { useLang } from '@/lib/i18n';
import { formatUsd } from '@/lib/utils';
import type { Destination, DestinationProfile } from '@/types';

/* ────────────────────────── Chapter shell ────────────────────────── */

function Chapter({
  n,
  eyebrow,
  title,
  children,
}: {
  n: number;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="jrny-chapter" data-journey-section data-journey-label={eyebrow}>
      <div className="jrny-inner">
        <Reveal>
          <p className="jrny-eyebrow">
            <span className="jrny-num font-mono">{String(n).padStart(2, '0')}</span>
            {eyebrow}
          </p>
          <h2 className="jrny-title">{title}</h2>
        </Reveal>
        {children}
      </div>
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="jrny-fact night-card">
      <span className="night-icon jrny-fact-icon">
        <Icon size={20} className="text-gold-light" aria-hidden="true" />
      </span>
      <p className="jrny-fact-label">{label}</p>
      <p className="jrny-fact-value">{value}</p>
      {note && <p className="jrny-fact-note">{note}</p>}
    </div>
  );
}

/* ────────────────────────── Component ────────────────────────── */

interface DestinationJourneyProps {
  dest: Destination;
  profile: DestinationProfile;
  onClear: () => void;
}

export function DestinationJourney({ dest, profile, onClear }: DestinationJourneyProps) {
  const { t, lang } = useLang();
  const name = lang === 'km' ? dest.nameKm : dest.name;

  const scams = getScamAlerts(dest.slug);
  const customs = getCustomsRule(dest.slug);
  // The standard tier is the recommendation: a week of data is what most trips
  // actually need. Falling back to the cheapest keeps this safe if tiers move.
  const plans = getPlansForCountry(dest.slug);
  const plan = plans.find((p) => p.popular) ?? plans[0];

  return (
    <div className="jrny">
      {/* ── 2 · The essentials ── */}
      <Chapter n={2} eyebrow={t('j.ch2')} title={t('j.ch2title')}>
        <div className="jrny-grid-4">
          {(
            [
              {
                id: 'currency',
                icon: Banknote,
                label: t('j.currency'),
                value: `${profile.currencySymbol} ${dest.currency}`,
                note: `${profile.currencyName} · ${dest.usdRate.toLocaleString()} ${t('j.perUsd')}`,
              },
              {
                id: 'language',
                icon: Languages,
                label: t('j.language'),
                value: profile.languages[0],
                note: profile.languages.slice(1).join(' · ') || undefined,
              },
              {
                id: 'power',
                icon: Plug,
                label: t('j.adapter'),
                value: profile.plugTypes,
                note: profile.voltage,
              },
              {
                id: 'internet',
                icon: Wifi,
                label: t('j.internet'),
                value: `${dest.networkQuality} · ${dest.networkTech}`,
                note: profile.internetNote,
              },
            ] as const
          ).map((f, i) => (
            <Reveal key={f.id} delay={i * 90}>
              <Fact icon={f.icon} label={f.label} value={f.value} note={f.note} />
            </Reveal>
          ))}
        </div>
      </Chapter>

      {/* ── 3 · Arrive prepared ── */}
      <Chapter n={3} eyebrow={t('j.ch3')} title={t('j.ch3title')}>
        <div className="jrny-grid-2">
          <Reveal>
            <div className="night-card jrny-panel">
              <p className="jrny-panel-label">
                <BadgeCheck size={16} className="text-gold-light" aria-hidden="true" />
                {t('j.entry')}
              </p>
              <p className="jrny-headline">{profile.visa.headline}</p>
              <p className="jrny-body">{profile.visa.detail}</p>
              {/* The customs record adds the two numbers the visa line does not
                  carry. Its own visa sentence is deliberately skipped — it says
                  the same thing again, one paragraph later. */}
              {customs && (
                <p className="jrny-body jrny-body-dim">
                  Maximum stay {customs.maxStayDays} days · cash over $
                  {customs.maxCashUsd.toLocaleString('en-US')} must be declared at the border.
                </p>
              )}
              <p className="jrny-disclaimer">{t('j.entryNote')}</p>
            </div>
          </Reveal>

          <Reveal delay={110}>
            <div className="night-card jrny-panel">
              <p className="jrny-panel-label">
                <ShieldCheck size={16} className="text-gold-light" aria-hidden="true" />
                {t('j.safety')}
              </p>
              <p className="jrny-headline">
                {profile.safety.score}
                <span className="jrny-headline-unit">/10</span>
              </p>
              <div
                className="jrny-meter"
                role="img"
                aria-label={`${t('j.safety')} ${profile.safety.score} / 10`}
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <span
                    key={i}
                    className={`jrny-meter-dot${i < profile.safety.score ? ' is-on' : ''}`}
                  />
                ))}
              </div>
              <p className="jrny-body">{profile.safety.note}</p>
              {scams.length > 0 && (
                <>
                  <p className="jrny-sublabel">{t('j.watch')}</p>
                  <ul className="jrny-list">
                    {scams.slice(0, 2).map((s) => (
                      <li key={s.title}>
                        <strong>{s.title}</strong> — {s.description}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Reveal>
        </div>

        <div className="jrny-grid-2 jrny-grid-gap">
          <Reveal>
            <div className="night-card jrny-panel">
              <p className="jrny-panel-label">
                <Phone size={16} className="text-gold-light" aria-hidden="true" />
                {t('j.emergency')}
              </p>
              <ul className="jrny-emergency">
                {profile.emergency.map((e) => (
                  <li key={e.label}>
                    <span>{e.label}</span>
                    <a href={`tel:${e.number.replace(/[^+\d]/g, '')}`} className="font-mono">
                      {e.number}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={110}>
            <div className="night-card jrny-panel">
              <p className="jrny-panel-label">
                <Lightbulb size={16} className="text-gold-light" aria-hidden="true" />
                {t('j.tips')}
              </p>
              <ul className="jrny-list">
                {profile.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 4 · Getting around ── */}
      <Chapter n={4} eyebrow={t('j.ch4')} title={t('j.ch4title')}>
        <div className="jrny-grid-2">
          <Reveal>
            <div className="night-card jrny-panel">
              <p className="jrny-panel-label">
                <Route size={16} className="text-gold-light" aria-hidden="true" />
                {t('j.transport')}
              </p>
              <ul className="jrny-list">
                {profile.transport.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={110}>
            <div className="night-card jrny-panel">
              <p className="jrny-panel-label">
                <Smartphone size={16} className="text-gold-light" aria-hidden="true" />
                {t('j.apps')}
              </p>
              <ul className="jrny-apps">
                {profile.apps.map((app) => (
                  <li key={app.name}>
                    <strong>{app.name}</strong>
                    <span>{app.use}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <div className="jrny-grid-2 jrny-grid-gap">
          <Reveal>
            <div className="night-card jrny-panel">
              <p className="jrny-panel-label">
                <CreditCard size={16} className="text-gold-light" aria-hidden="true" />
                {t('j.payments')}
              </p>
              <p className="jrny-body">{profile.payments}</p>
            </div>
          </Reveal>
          <Reveal delay={110}>
            <blockquote className="jrny-quote">
              <p className="jrny-panel-label">
                <Sparkles size={16} className="text-gold-light" aria-hidden="true" />
                {t('j.localTip')}
              </p>
              <p>{profile.localTip}</p>
            </blockquote>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 5 · Inspiration ── */}
      <Chapter n={5} eyebrow={t('j.ch5')} title={t('j.ch5title')}>
        <Reveal>
          <p className="jrny-sublabel jrny-sublabel-lead">{t('j.trending')}</p>
        </Reveal>
        <div className="jrny-grid-3">
          {profile.attractions.map((a, i) => (
            <Reveal key={a.name} delay={i * 90}>
              <article className="night-card jrny-place">
                <h3>{a.name}</h3>
                <p>{a.note}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="jrny-sublabel jrny-sublabel-lead">{t('j.gems')}</p>
        </Reveal>
        <div className="jrny-grid-2">
          {profile.hiddenGems.map((g, i) => (
            <Reveal key={g.name} delay={i * 90}>
              <article className="night-card jrny-place jrny-place-gem">
                <h3>{g.name}</h3>
                <p>{g.note}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <blockquote className="jrny-inspiration">{profile.inspiration}</blockquote>
        </Reveal>

        {profile.alert && (
          <Reveal>
            <p className="jrny-alert" role="note">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                <strong>{t('j.alert')}</strong> {profile.alert}
              </span>
            </p>
          </Reveal>
        )}
      </Chapter>

      {/* ── 6 · Only now, the eSIM ── */}
      <Chapter n={6} eyebrow={t('j.ch6')} title={t('j.ch6title')}>
        <Reveal>
          <p className="jrny-lede">{t('j.esimWhy')}</p>
        </Reveal>

        {plan && (
          <Reveal delay={120}>
            <div className="jrny-esim night-card">
              <div className="jrny-esim-body">
                <p className="jrny-panel-label">
                  <Signal size={16} className="text-gold-light" aria-hidden="true" />
                  {name} · {plan.name}
                </p>
                <p className="jrny-esim-price">
                  {formatUsd(plan.priceUsd)}
                  <span className="jrny-esim-unit">
                    {' '}
                    · {plan.durationDays} days · {plan.dataGbDaily}GB {t('j.esimPerDay')}
                  </span>
                </p>
                <p className="jrny-body">
                  {t('j.networks')} {dest.networks.join(' · ')} — {plan.network}.
                </p>
              </div>
              <div className="jrny-esim-actions">
                <Link href={`/esim/${dest.slug}`} className="jrny-cta">
                  {t('j.esimCta')}
                </Link>
                <Link href="/flights" className="jrny-cta-ghost">
                  {t('j.esimTrack')}
                </Link>
              </div>
            </div>
          </Reveal>
        )}

        <Reveal delay={200}>
          <p className="jrny-restart">
            <button type="button" onClick={onClear} className="jrny-restart-btn">
              {t('j.explore')}
            </button>
          </p>
        </Reveal>
      </Chapter>
    </div>
  );
}
