'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, Luggage, Plane, ArrowLeft, ArrowRight } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { getCustomsRule } from '@/data/customsRules';
import { Select, Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
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
  label: string;
}

const categoryMeta: Record<ChecklistCategory, { title: string; icon: typeof AlertTriangle; tone: string }> = {
  urgent: { title: '🚨 URGENT — Do before flying (7+ days before)', icon: AlertTriangle, tone: 'text-danger' },
  important: { title: '📋 IMPORTANT — Do 48 hours before', icon: ClipboardList, tone: 'text-warning' },
  pack: { title: '🧳 PACK', icon: Luggage, tone: 'text-secondary' },
  'day-of': { title: '✈️ DAY OF FLIGHT', icon: Plane, tone: 'text-accent' },
};

function generateChecklist(setup: Setup): GeneratedItem[] {
  const dest = destinations.find((d) => d.slug === setup.destination);
  const customs = getCustomsRule(setup.destination);
  const name = dest?.name ?? 'your destination';
  const items: GeneratedItem[] = [];
  let id = 0;
  const add = (category: ChecklistCategory, label: string) => items.push({ id: String(id++), category, label });

  // Urgent
  add('urgent', customs ? `Check ${name} visa requirements (${customs.visaInfo})` : `Check ${name} visa requirements for your passport`);
  if (setup.accommodationBooked !== 'yes') add('urgent', 'Book accommodation (save hotel confirmation)');
  else add('urgent', 'Save your hotel confirmation where you can find it offline');
  if (setup.hasInsurance !== 'yes') add('urgent', 'Travel insurance (recommended: SafetyWing from $40/month)');
  add('urgent', `Get eSIM for ${name}`);
  if (setup.firstTimeAbroad === 'yes') add('urgent', 'Check your passport is valid 6+ months after your return date');

  // Important
  if (setup.destination === 'vietnam') add('important', 'Fill Vietnam e-arrival card (official form)');
  if (setup.destination === 'singapore') add('important', 'Submit the SG Arrival Card online');
  if (setup.destination === 'malaysia') add('important', 'Complete the Malaysia Digital Arrival Card (MDAC)');
  if (setup.destination === 'japan') add('important', 'Complete Visit Japan Web for faster entry');
  add('important', 'Check flight status on Domer');
  if (customs) add('important', `Confirm: max cash $${customs.maxCashUsd.toLocaleString()} USD allowed into ${name}`);
  add('important', `Screenshot hotel address in the local language for the taxi driver`);
  add('important', 'Download offline maps of your destination city');

  // Pack
  add('pack', 'Passport (valid 6+ months)');
  add('pack', 'Return flight booking printout');
  add('pack', 'Hotel confirmation');
  add('pack', 'USD cash for emergencies');
  add('pack', 'Phone charger + adapter');
  add('pack', 'Prescription medications (in original packaging)');
  if (setup.travelingWith === 'family') add('pack', "Children's documents + snacks + entertainment");

  // Day of flight
  add('day-of', `Arrive airport ${setup.flownBefore === 'yes' ? '2.5' : '3'} hours early`);
  add('day-of', 'Check in online');
  add('day-of', 'Activate eSIM only after landing');
  if (setup.firstTimeAbroad === 'yes') add('day-of', 'Open the Domer Airport Guide when you arrive at the airport');

  return items;
}

export default function ChecklistPage() {
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

  const items = useMemo(() => generateChecklist(setup), [setup]);
  const doneCount = items.filter((i) => checked.has(i.id)).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const destName = destinations.find((d) => d.slug === setup.destination)?.name ?? '';

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
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Am I Ready?</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">
          Your personal travel checklist
        </h1>
        <p className="mt-3 text-ink-secondary">
          Answer a few questions and we&apos;ll build the exact list you need — nothing forgotten.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-10 flex items-center justify-center gap-2" aria-label={`Step ${step} of 3`}>
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
          <h2 className="mb-6 font-display text-xl font-bold text-ink">Step 1 — Travel details</h2>
          <div className="space-y-5">
            <Select
              id="destination"
              label="Where are you going?"
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
              label="Your passport country"
              value={setup.passportCountry}
              onChange={(e) => setSetup({ ...setup, passportCountry: e.target.value })}
            >
              <option value="KH">Cambodia 🇰🇭</option>
              <option value="OTHER">Other</option>
            </Select>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                id="departure"
                type="date"
                label="Departure date"
                value={setup.departureDate}
                onChange={(e) => setSetup({ ...setup, departureDate: e.target.value })}
              />
              <Input
                id="return"
                type="date"
                label="Return date"
                value={setup.returnDate}
                onChange={(e) => setSetup({ ...setup, returnDate: e.target.value })}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Traveling with</p>
              {yesNoButtons('travelingWith', [
                { value: 'solo', label: 'Solo' },
                { value: 'partner', label: 'Partner' },
                { value: 'family', label: 'Family' },
                { value: 'group', label: 'Group' },
              ])}
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <Button onClick={() => setStep(2)}>
              Continue <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-card border border-line/60 bg-white p-8 shadow-card animate-fade-up">
          <h2 className="mb-6 font-display text-xl font-bold text-ink">Step 2 — Your profile</h2>
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Is this your first time traveling abroad?</p>
              {yesNoButtons('firstTimeAbroad', [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ])}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Have you flown before?</p>
              {yesNoButtons('flownBefore', [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ])}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Do you have travel insurance?</p>
              {yesNoButtons('hasInsurance', [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
                { value: 'not-yet', label: 'Not yet' },
              ])}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Accommodation booked?</p>
              {yesNoButtons('accommodationBooked', [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
                { value: 'not-yet', label: 'Not yet' },
              ])}
            </div>
          </div>
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Back
            </Button>
            <Button onClick={() => setStep(3)}>
              Generate my checklist <ArrowRight size={16} />
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
              label={`${doneCount}/${items.length} items complete — You're ${pct}% ready for ${destName}`}
            />
          </div>

          {(Object.keys(categoryMeta) as ChecklistCategory[]).map((cat) => {
            const catItems = items.filter((i) => i.category === cat);
            if (catItems.length === 0) return null;
            const meta = categoryMeta[cat];
            return (
              <section key={cat} className="rounded-card border border-line/60 bg-white p-6 shadow-card">
                <h2 className={cn('mb-4 font-display text-sm font-bold uppercase tracking-wide', meta.tone)}>
                  {meta.title}
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
                        {item.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="rounded-card bg-primary p-6 text-center">
            <p className="text-sm text-white/80">
              📲 We&apos;ll remind you <strong className="text-white">48 hours before your flight</strong> if you
              still have unchecked items.
            </p>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft size={16} /> Edit answers
            </Button>
            <Button href="/esim">Get your eSIM next →</Button>
          </div>
        </div>
      )}
    </div>
  );
}
