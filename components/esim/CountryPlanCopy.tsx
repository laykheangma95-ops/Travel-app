'use client';

// The country plan page is a server component with generateStaticParams, so it
// cannot read the language toggle itself. Its prose lives here instead — the
// page keeps the data fetching, these components keep the words.

import { MapPin, Signal } from 'lucide-react';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { RichText, useLang, type DictKey } from '@/lib/i18n';

interface CountryFacts {
  name: string;
  networks: string[];
  networkTech: string;
  networkQuality: string;
}

export function CountryHeading({ country, networks }: { country: string; networks: string[] }) {
  const { t } = useLang();
  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
        {t('country.title', { country })}
      </h1>
      <p className="mt-1.5 flex items-center gap-2 text-sm text-white/70">
        <Signal size={15} aria-hidden="true" />
        {t('country.poweredBy', { networks: networks.join(' & ') })}
      </p>
    </div>
  );
}

export function CoverageBadge({ tech, quality }: { tech: string; quality: string }) {
  const { t } = useLang();
  // The catalogue stores quality as an English word, so it needs translating
  // rather than passing straight through.
  const qualityLabel = t(quality === 'Excellent' ? 'quality.Excellent' : 'quality.Good');
  return (
    <div className="liquid-glass hidden items-center gap-3 rounded-card px-6 py-4 md:flex">
      <MapPin size={20} className="text-accent" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-white">{t('country.coverage')}</p>
        <p className="text-xs text-white/60">{t('country.quality', { tech, quality: qualityLabel })}</p>
      </div>
    </div>
  );
}

export function EntryInfoLabel() {
  const { t } = useLang();
  return <>{t('country.entryInfo')}</>;
}

const iphoneSteps = [
  'country.install.iphone1',
  'country.install.iphone2',
  'country.install.iphone3',
  'country.install.iphone4',
  'country.install.iphone5',
] as const satisfies ReadonlyArray<DictKey>;

const androidSteps = [
  'country.install.android1',
  'country.install.android2',
  'country.install.android3',
  'country.install.android4',
  'country.install.android5',
] as const satisfies ReadonlyArray<DictKey>;

export function InstallGuide({ country }: { country: string }) {
  const { t } = useLang();
  return (
    <>
      <h2 className="mb-6 font-display text-2xl font-bold text-white">{t('country.installTitle')}</h2>
      <Accordion dark>
        <AccordionItem title={t('country.install.iphone')} defaultOpen>
          <ol className="list-inside list-decimal space-y-2">
            {iphoneSteps.map((key) => (
              <li key={key}>
                <RichText text={t(key, { country })} />
              </li>
            ))}
          </ol>
        </AccordionItem>
        <AccordionItem title={t('country.install.android')}>
          <ol className="list-inside list-decimal space-y-2">
            {androidSteps.map((key) => (
              <li key={key}>
                <RichText text={t(key, { country })} />
              </li>
            ))}
          </ol>
        </AccordionItem>
      </Accordion>
    </>
  );
}

export function CountryFaq({ dest }: { dest: CountryFacts }) {
  const { t } = useLang();
  // q3/a3 want the networks joined with "or" rather than the "&" the hero uses.
  const vars = {
    country: dest.name,
    networks: dest.networks.join(' / '),
    tech: dest.networkTech,
  };

  const faqs = [
    ['country.faq.q1', 'country.faq.a1'],
    ['country.faq.q2', 'country.faq.a2'],
    ['country.faq.q3', 'country.faq.a3'],
    ['country.faq.q4', 'country.faq.a4'],
    ['country.faq.q5', 'country.faq.a5'],
  ] as const satisfies ReadonlyArray<readonly [DictKey, DictKey]>;

  return (
    <>
      <h2 className="mb-6 font-display text-2xl font-bold text-white">
        {t('country.faqTitle', { country: dest.name })}
      </h2>
      <Accordion dark>
        {faqs.map(([q, a]) => (
          <AccordionItem key={q} title={t(q, vars)}>
            {t(a, vars)}
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}
