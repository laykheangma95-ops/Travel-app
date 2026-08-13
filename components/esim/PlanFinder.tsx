'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The plan finder — a conversation, not a form.
//
// WHY IT LOOKS LIKE A CHAT BUT IS NOT ONE: every answer is a tap. There is no
// text box to type into, because a text box asks the customer to invent what to
// say, and a first-time eSIM buyer does not know the vocabulary. Chips ask them
// to recognise instead of recall, which is the easier half of the brain and the
// only half that works one-handed on a phone in an airport.
//
// It borrows the chat *shape* — Domner asks on the left, your answer lands on
// the right, a typing pause in between — because that shape is warm and legible
// and everyone already knows how to read it. It is friendly on purpose: buying
// data abroad is an anxious purchase, and a four-question form with a progress
// bar feels like paperwork.
//
// Two escape hatches, both required (see the §6 note in CLAUDE.md about never
// trapping the customer in a funnel):
//   · "I know what I want" — straight to the full catalogue, always visible.
//   · Every answered question stays tappable, so they can change one answer
//     without restarting the conversation.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Search, Sparkles } from 'lucide-react';
import { destinations } from '@/data/destinations';
import { esimPlans } from '@/data/esimPlans';
import {
  USAGE_PROFILES,
  recommendPlan,
  explainRecommendation,
  type UsageProfile,
} from '@/lib/esim/recommend';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { PlanResult } from './PlanResult';

type StepId = 'country' | 'days' | 'usage' | 'result';

const STEPS: StepId[] = ['country', 'days', 'usage', 'result'];

/** How long the "…" sits there before Domner's next question appears. */
const TYPING_MS = 520;

const COPY = {
  // The page heading lives here rather than in the route so it can be
  // bilingual — the customer UI is Khmer-first, and a server component has no
  // useLang(). See CLAUDE.md §1.
  kicker: { en: 'Find my eSIM', km: 'រកកញ្ចប់ eSIM' },
  heading: {
    en: 'Three questions. One plan that fits.',
    km: 'សំណួរបីយ៉ាង។ កញ្ចប់មួយដែលសម។',
  },
  greeting: {
    en: "Hi! I'll find you the right eSIM in about 30 seconds. 👋",
    km: 'សួស្ដី! ខ្ញុំនឹងជួយរកកញ្ចប់ eSIM ដែលសមនឹងអ្នកក្នុងរយៈពេល ៣០ វិនាទី។ 👋',
  },
  askCountry: {
    en: 'First — where are you flying to?',
    km: 'ដំបូង — តើអ្នកនឹងហោះទៅណា?',
  },
  askDays: {
    en: 'Nice choice. How many days will you be there?',
    km: 'ជម្រើសល្អ! តើអ្នកនឹងស្នាក់នៅទីនោះប៉ុន្មានថ្ងៃ?',
  },
  askUsage: {
    en: 'Last one. What will you actually use the internet for? Pick as many as you like.',
    km: 'សំណួរចុងក្រោយ។ តើអ្នកនឹងប្រើអ៊ីនធឺណិតសម្រាប់អ្វីខ្លះ? ជ្រើសរើសបានច្រើន។',
  },
  thinking: {
    en: 'Perfect. Let me do the maths…',
    km: 'ល្អណាស់។ ខ្ញុំកំពុងគណនា…',
  },
  skip: { en: 'I know what I want', km: 'ខ្ញុំដឹងអ្វីដែលខ្ញុំចង់បាន' },
  searchPlaceholder: { en: 'Search a country…', km: 'ស្វែងរកប្រទេស…' },
  daysUnit: { en: 'days', km: 'ថ្ងៃ' },
  dayUnit: { en: 'day', km: 'ថ្ងៃ' },
  done: { en: "That's me", km: 'រួចរាល់' },
  restart: { en: 'Start over', km: 'ចាប់ផ្ដើមឡើងវិញ' },
  noPick: { en: 'Just the basics', km: 'គ្រាន់តែមូលដ្ឋាន' },
};

export function PlanFinder({ initialCountry }: { initialCountry?: string }) {
  const { lang } = useLang();

  const [country, setCountry] = useState<string | null>(initialCountry ?? null);
  const [days, setDays] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<UsageProfile[]>([]);
  const [step, setStep] = useState<StepId>(initialCountry ? 'days' : 'country');
  const [typing, setTyping] = useState(false);
  const [query, setQuery] = useState('');

  const endRef = useRef<HTMLDivElement>(null);

  const destination = useMemo(
    () => destinations.find((d) => d.slug === country) ?? null,
    [country]
  );

  const recommendation = useMemo(() => {
    if (!country || !days) return null;
    return recommendPlan(
      esimPlans.filter((p) => p.countrySlug === country),
      days,
      profiles
    );
  }, [country, days, profiles]);

  // Keep the newest question in view. `block: 'nearest'` rather than a hard
  // scroll to bottom — on a short screen the latter jumps the answered bubbles
  // off the top, and people lose the thread of what they already said.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [step, typing]);

  /** Move to the next question with a short "typing" beat in between. */
  function advance(next: StepId) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setStep(next);
    }, TYPING_MS);
  }

  function chooseCountry(slug: string) {
    setCountry(slug);
    setQuery('');
    advance('days');
  }

  function chooseDays(value: number) {
    setDays(value);
    advance('usage');
  }

  function toggleProfile(id: UsageProfile) {
    setProfiles((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id]
    );
  }

  function reset() {
    setCountry(null);
    setDays(null);
    setProfiles([]);
    setQuery('');
    setStep('country');
  }

  const reached = (id: StepId) => STEPS.indexOf(step) >= STEPS.indexOf(id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
      <header className="mb-4 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
          {COPY.kicker[lang]}
        </p>
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
          {COPY.heading[lang]}
        </h1>
      </header>

      {/* ── Domner's greeting ── */}
      <Bubble from="domner" delay={0}>
        {COPY.greeting[lang]}
      </Bubble>

      {/* ── 1. Country ── */}
      <Bubble from="domner" delay={0.12}>
        {COPY.askCountry[lang]}
      </Bubble>

      {destination && (
        <Answer onEdit={() => setStep('country')}>
          {destination.flag} {lang === 'km' ? destination.nameKm : destination.name}
        </Answer>
      )}

      <AnimatePresence mode="wait">
        {step === 'country' && (
          <StepShell key="country">
            <CountryChooser
              query={query}
              onQuery={setQuery}
              onPick={chooseCountry}
              lang={lang}
            />
          </StepShell>
        )}
      </AnimatePresence>

      {/* ── 2. Days ── */}
      {reached('days') && (
        <Bubble from="domner" delay={0}>
          {COPY.askDays[lang]}
        </Bubble>
      )}

      {days !== null && (
        <Answer onEdit={() => setStep('days')}>
          {days} {days === 1 ? COPY.dayUnit[lang] : COPY.daysUnit[lang]}
        </Answer>
      )}

      <AnimatePresence mode="wait">
        {step === 'days' && !typing && (
          <StepShell key="days">
            <DayScroller value={days} onPick={chooseDays} lang={lang} />
          </StepShell>
        )}
      </AnimatePresence>

      {/* ── 3. Usage ── */}
      {reached('usage') && (
        <Bubble from="domner" delay={0}>
          {COPY.askUsage[lang]}
        </Bubble>
      )}

      {step === 'result' && (
        <Answer onEdit={() => setStep('usage')}>
          {profiles.length === 0
            ? COPY.noPick[lang]
            : USAGE_PROFILES.filter((p) => profiles.includes(p.id))
                .map((p) => `${p.emoji} ${p.label[lang]}`)
                .join(' · ')}
        </Answer>
      )}

      <AnimatePresence mode="wait">
        {step === 'usage' && !typing && (
          <StepShell key="usage">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {USAGE_PROFILES.map((profile) => {
                const on = profiles.includes(profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => toggleProfile(profile.id)}
                    aria-pressed={on}
                    className={cn(
                      'group flex items-start gap-3 rounded-card border p-3.5 text-left transition-all duration-200 ease-smooth',
                      on
                        ? 'border-gold-light/60 bg-gold-light/15 shadow-sm'
                        : 'border-white/10 bg-white/5 hover:border-gold-light/40 hover:bg-white/10'
                    )}
                  >
                    <span className="text-xl leading-none" aria-hidden="true">
                      {profile.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm font-semibold',
                          on ? 'text-gold-light' : 'text-white'
                        )}
                      >
                        {profile.label[lang]}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-white/55">
                        {profile.hint[lang]}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
                        on ? 'border-gold-light bg-gold-light' : 'border-white/25'
                      )}
                      aria-hidden="true"
                    >
                      {on && <Check size={12} className="text-primary-deep" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => advance('result')}
              className="liquid-glass-accent liquid-press mt-4 flex w-full items-center justify-center gap-2 rounded-btn px-5 py-3.5 text-sm font-semibold text-primary-deep transition-all hover:brightness-110"
            >
              {profiles.length === 0 ? COPY.noPick[lang] : COPY.done[lang]}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </StepShell>
        )}
      </AnimatePresence>

      {/* ── Typing indicator ── */}
      <AnimatePresence>{typing && <TypingDots key="typing" />}</AnimatePresence>

      {/* ── 4. Result ── */}
      {step === 'result' && recommendation && destination && days !== null && (
        <>
          <Bubble from="domner" delay={0}>
            {explainRecommendation(recommendation, days, profiles, lang)}
          </Bubble>
          <PlanResult
            recommendation={recommendation}
            destination={destination}
            days={days}
            lang={lang}
          />
          <button
            type="button"
            onClick={reset}
            className="mx-auto mt-2 text-xs font-medium text-white/50 underline underline-offset-4 transition-colors hover:text-white/80"
          >
            {COPY.restart[lang]}
          </button>
        </>
      )}

      {/* ── The escape hatch, always available ── */}
      {step !== 'result' && (
        <Link
          href="/esim"
          className="mx-auto mt-2 text-xs font-medium text-white/50 underline underline-offset-4 transition-colors hover:text-white/80"
        >
          {COPY.skip[lang]} →
        </Link>
      )}

      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Bubble({
  from,
  delay,
  children,
}: {
  from: 'domner';
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-end gap-2.5"
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-light/20 text-gold-light"
        aria-hidden="true"
      >
        <Sparkles size={15} />
      </span>
      <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-white/10 bg-white/8 px-4 py-3 text-sm leading-relaxed text-white/90 backdrop-blur-md">
        {children}
      </p>
    </motion.div>
  );
}

/**
 * The customer's own answer, echoed back. Tapping it reopens that question —
 * this is what makes the conversation editable instead of a one-way funnel.
 */
function Answer({ children, onEdit }: { children: React.ReactNode; onEdit: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onEdit}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="liquid-press ml-auto max-w-[85%] rounded-2xl rounded-br-md border border-gold-light/40 bg-gold-light/15 px-4 py-2.5 text-left text-sm font-medium text-gold-light transition-all hover:border-gold-light/70"
    >
      {children}
      <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-gold-light/60">
        edit
      </span>
    </motion.button>
  );
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="ml-10"
    >
      {children}
    </motion.div>
  );
}

function TypingDots() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="ml-10 flex w-fit gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/8 px-4 py-3.5"
      role="status"
      aria-label="Domner is typing"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-gold-light/70"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16 }}
        />
      ))}
    </motion.div>
  );
}

function CountryChooser({
  query,
  onQuery,
  onPick,
  lang,
}: {
  query: string;
  onQuery: (v: string) => void;
  onPick: (slug: string) => void;
  lang: 'en' | 'km';
}) {
  const q = query.trim().toLowerCase();

  // With no search, lead with the destinations Cambodians actually fly to. The
  // full list is 29 countries — a wall of flags is a worse first impression
  // than six familiar ones and a search box.
  const shown = q
    ? destinations.filter(
        (d) => d.name.toLowerCase().includes(q) || d.nameKm.includes(query.trim())
      )
    : destinations.filter((d) => d.popular);

  return (
    <div>
      <div className="relative mb-3">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={COPY.searchPlaceholder[lang]}
          aria-label={COPY.searchPlaceholder[lang]}
          className="w-full rounded-btn border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/35 backdrop-blur-md transition-all focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/25"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {shown.map((d) => (
          <button
            key={d.slug}
            type="button"
            onClick={() => onPick(d.slug)}
            className="liquid-press flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white/85 transition-all duration-200 ease-smooth hover:border-gold-light/50 hover:bg-gold-light/10 hover:text-white"
          >
            <span aria-hidden="true">{d.flag}</span>
            {lang === 'km' ? d.nameKm : d.name}
          </button>
        ))}
        {shown.length === 0 && (
          <p className="py-2 text-sm text-white/50">
            {lang === 'km'
              ? 'រកមិនឃើញប្រទេសនេះទេ។'
              : `No destination matches "${query}".`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The day scroller the brief asked for: 1 → 30, swipeable, with the common
 * trip lengths called out so nobody has to drag thirty chips to find "7".
 */
function DayScroller({
  value,
  onPick,
  lang,
}: {
  value: number | null;
  onPick: (days: number) => void;
  lang: 'en' | 'km';
}) {
  const COMMON = [3, 5, 7, 10, 14, 30];
  const ALL = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {COMMON.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            className={cn(
              'liquid-press rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 ease-smooth',
              value === d
                ? 'border-gold-light/60 bg-gold-light/15 text-gold-light'
                : 'border-white/10 bg-white/5 text-white/85 hover:border-gold-light/50 hover:text-white'
            )}
          >
            {d} {COPY.daysUnit[lang]}
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs text-white/45">
        {lang === 'km' ? 'ឬរំកិលដើម្បីជ្រើសរើសថ្ងៃពិតប្រាកដ' : 'Or scroll to the exact number'}
      </p>

      <div
        className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2"
        role="group"
        aria-label={lang === 'km' ? 'ចំនួនថ្ងៃ' : 'Number of days'}
      >
        {ALL.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            aria-pressed={value === d}
            className={cn(
              'liquid-press h-11 w-11 shrink-0 snap-center rounded-xl border text-sm font-semibold transition-all duration-200',
              value === d
                ? 'border-gold-light/60 bg-gold-light/15 text-gold-light'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-gold-light/40 hover:text-white'
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
