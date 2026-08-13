'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, Luggage, Plane, ArrowLeft, ArrowRight } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { getCustomsRule } from '@/data/customsRules';
import { Select, Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { RichText, useLang, type DictKey, type TVars } from '@/lib/i18n';
import type { ChecklistCategory } from '@/types';

interface Setup {
  destination: string;
  passportCountry: string;
  departureDate: string;
  returnDate: string;
  travelingWith: string;
  firstTimeAbroad: string;
  flownBefore: string;
  hasInsurance: string;
  accommodationBooked: string;
}

interface GeneratedItem {
  id: string;
  category: ChecklistCategory;
  /** Translated at render, not here — the generator must not bake a language in. */
  key: DictKey;
  vars?: TVars;
}

const categoryMeta: Record<
  ChecklistCategory,
  { title: DictKey; icon: typeof AlertTriangle; tone: string }
> = {
  urgent: { title: 'check.cat.urgent', icon: AlertTriangle, tone: 'text-danger' },
  important: { title: 'check.cat.important', icon: ClipboardList, tone: 'text-warning' },
  pack: { title: 'check.cat.pack', icon: Luggage, tone: 'text-secondary' },
  'day-of': { title: 'check.cat.day-of', icon: Plane, tone: 'text-accent' },
};

/**
 * Which items apply, and with which values — but not what they say. The country
 * name lands in a different position in each language, so the sentence can only
 * be assembled once the language is known.
 */
function generateChecklist(setup: Setup, destName: string): GeneratedItem[] {
  const customs = getCustomsRule(setup.destination);
  const items: GeneratedItem[] = [];
  let id = 0;
  const add = (category: ChecklistCategory, key: DictKey, vars?: TVars) =>
    items.push({ id: String(id++), category, key, vars });

  // Urgent
  if (customs) {
    add('urgent', 'check.item.visaCustoms', { country: destName, info: customs.visaInfo });
  } else {
    add('urgent', 'check.item.visa', { country: destName });
  }
  if (setup.accommodationBooked !== 'yes') add('urgent', 'check.item.bookStay');
  else add('urgent', 'check.item.saveStay');
  if (setup.hasInsurance !== 'yes') add('urgent', 'check.item.insurance');
  add('urgent', 'check.item.esim', { country: destName });
  if (setup.firstTimeAbroad === 'yes') add('urgent', 'check.item.passport6m');

  // Important
  if (setup.destination === 'vietnam') add('important', 'check.item.vietnamArrival');
  if (setup.destination === 'singapore') add('important', 'check.item.sgArrival');
  if (setup.destination === 'malaysia') add('important', 'check.item.mdac');
  if (setup.destination === 'japan') add('important', 'check.item.visitJapan');
  add('important', 'check.item.flightStatus');
  if (customs) {
    add('important', 'check.item.maxCash', {
      amount: customs.maxCashUsd.toLocaleString(),
      country: destName,
    });
  }
  add('important', 'check.item.hotelScreenshot');
  add('important', 'check.item.offlineMaps');

  // Pack
  add('pack', 'check.item.packPassport');
  add('pack', 'check.item.packReturn');
  add('pack', 'check.item.packHotel');
  add('pack', 'check.item.packCash');
  add('pack', 'check.item.packCharger');
  add('pack', 'check.item.packMeds');
  if (setup.travelingWith === 'family') add('pack', 'check.item.packKids');

  // Day of flight
  add('day-of', 'check.item.arriveEarly', { hours: setup.flownBefore === 'yes' ? '2.5' : '3' });
  add('day-of', 'check.item.checkIn');
  add('day-of', 'check.item.activateAfter');
  if (setup.firstTimeAbroad === 'yes') add('day-of', 'check.item.airportGuide');

  return items;
}

export default function ChecklistPage() {
  const { t } = useLang();
  const [step, setStep] = useState(1);
  const [setup, setSetup] = useState<Setup>({
    destination: 'vietnam',
    passportCountry: 'KH',
    departureDate: '',
    returnDate: '',
    travelingWith: 'solo',
    firstTimeAbroad: 'no',
    flownBefore: 'yes',
    hasInsurance: 'not-yet',
    accommodationBooked: 'not-yet',
  });
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const destName =
    destinations.find((d) => d.slug === setup.destination)?.name ?? t('check.destFallback');
  const items = useMemo(() => generateChecklist(setup, destName), [setup, destName]);
  const doneCount = items.filter((i) => checked.has(i.id)).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const yesNoButtons = (field: keyof Setup, options: { value: string; label: string }[]) => (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSetup({ ...setup, [field]: opt.value })}
          className={cn(
            'rounded-btn border-2 px-4 py-2.5 text-sm font-medium transition-all duration-200',
            setup[field] === opt.value
              ? 'border-accent bg-[#F5EEDC] text-accent'
              : 'border-line text-ink-secondary hover:border-ink-muted'
          )}
          aria-pressed={setup[field] === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">{t('check.eyebrow')}</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">{t('check.title')}</h1>
        <p className="mt-3 text-ink-secondary">{t('check.sub')}</p>
      </div>

      {/* Step indicator */}
      <div className="mb-10 flex items-center justify-center gap-2" aria-label={t('check.stepOf', { step })}>
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              s === step ? 'w-10 bg-accent' : s < step ? 'w-6 bg-success' : 'w-6 bg-line'
            )}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="rounded-card border border-line/60 bg-white p-8 shadow-card animate-fade-up">
          <h2 className="mb-6 font-display text-xl font-bold text-ink">{t('check.step1')}</h2>
          <div className="space-y-5">
            <Select
              id="destination"
              label={t('check.where')}
              value={setup.destination}
              onChange={(e) => setSetup({ ...setup, destination: e.target.value })}
            >
              {destinations.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.flag} {d.name}
                </option>
              ))}
            </Select>
            <Select
              id="passport"
              label={t('check.passportCountry')}
              value={setup.passportCountry}
              onChange={(e) => setSetup({ ...setup, passportCountry: e.target.value })}
            >
              <option value="KH">{t('check.cambodia')}</option>
              <option value="OTHER">{t('check.other')}</option>
            </Select>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                id="departure"
                type="date"
                label={t('check.departure')}
                value={setup.departureDate}
                onChange={(e) => setSetup({ ...setup, departureDate: e.target.value })}
              />
              <Input
                id="return"
                type="date"
                label={t('check.return')}
                value={setup.returnDate}
                onChange={(e) => setSetup({ ...setup, returnDate: e.target.value })}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{t('check.travelingWith')}</p>
              {yesNoButtons('travelingWith', [
                { value: 'solo', label: t('check.solo') },
                { value: 'partner', label: t('check.partner') },
                { value: 'family', label: t('check.family') },
                { value: 'group', label: t('check.group') },
              ])}
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <Button onClick={() => setStep(2)}>
              {t('check.continue')} <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-card border border-line/60 bg-white p-8 shadow-card animate-fade-up">
          <h2 className="mb-6 font-display text-xl font-bold text-ink">{t('check.step2')}</h2>
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{t('check.firstTime')}</p>
              {yesNoButtons('firstTimeAbroad', [
                { value: 'yes', label: t('check.yes') },
                { value: 'no', label: t('check.no') },
              ])}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{t('check.flownBefore')}</p>
              {yesNoButtons('flownBefore', [
                { value: 'yes', label: t('check.yes') },
                { value: 'no', label: t('check.no') },
              ])}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{t('check.insuranceQ')}</p>
              {yesNoButtons('hasInsurance', [
                { value: 'yes', label: t('check.yes') },
                { value: 'no', label: t('check.no') },
                { value: 'not-yet', label: t('check.notYet') },
              ])}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{t('check.stayQ')}</p>
              {yesNoButtons('accommodationBooked', [
                { value: 'yes', label: t('check.yes') },
                { value: 'no', label: t('check.no') },
                { value: 'not-yet', label: t('check.notYet') },
              ])}
            </div>
          </div>
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> {t('check.back')}
            </Button>
            <Button onClick={() => setStep(3)}>
              {t('check.generate')} <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 animate-fade-up">
          {/* Progress */}
          <div className="sticky top-20 z-20 rounded-card border border-line/60 bg-white/95 p-5 shadow-card backdrop-blur">
            <ProgressBar
              value={pct}
              tone={pct === 100 ? 'success' : 'accent'}
              label={t('check.progress', {
                done: doneCount,
                total: items.length,
                pct,
                country: destName,
              })}
            />
          </div>

          {(Object.keys(categoryMeta) as ChecklistCategory[]).map((cat) => {
            const catItems = items.filter((i) => i.category === cat);
            if (catItems.length === 0) return null;
            const meta = categoryMeta[cat];
            return (
              <section key={cat} className="rounded-card border border-line/60 bg-white p-6 shadow-card">
                <h2 className={cn('mb-4 font-display text-sm font-bold uppercase tracking-wide', meta.tone)}>
                  {t(meta.title)}
                </h2>
                <ul className="space-y-1">
                  {catItems.map((item) => (
                    <li key={item.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-btn p-2.5 text-sm transition-colors hover:bg-surface-2',
                          checked.has(item.id) ? 'text-ink-muted line-through' : 'text-ink'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(item.id)}
                          onChange={() => toggle(item.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#C69749]"
                        />
                        {t(item.key, item.vars)}
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="rounded-card bg-primary p-6 text-center">
            <p className="text-sm text-white/80">
              <RichText text={t('check.remind')} />
            </p>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft size={16} /> {t('check.editAnswers')}
            </Button>
            <Button href="/esim">{t('check.esimNext')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
