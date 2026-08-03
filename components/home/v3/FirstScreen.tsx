'use client';

// The first screen. Nothing here but a greeting, a question, a quiet line and
// one field — no products, no prices, no promotions, no second call to action.
//
// LCP discipline: the title, subtitle and search field are plain markup that
// ships in the server HTML. They are painted before the globe chunk is even
// requested. The greeting is server-rendered for Cambodia time (which is where
// almost everyone reading this is) and corrected on mount for anyone elsewhere,
// so there is no empty line waiting to fill and no layout shift either way.

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useLang, type DictKey } from '@/lib/i18n';
import { DestinationSearch, type SearchSelection } from './DestinationSearch';

function greetingKeyFor(hour: number): DictKey {
  if (hour >= 5 && hour < 11) return 'v3.greet.morning';
  if (hour >= 11 && hour < 17) return 'v3.greet.afternoon';
  if (hour >= 17 && hour < 22) return 'v3.greet.evening';
  return 'v3.greet.night';
}

/** Cambodia time, computed the same way on the server and the client. */
export function cambodiaHour(now: Date = new Date()): number {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  return Number(s);
}

export function FirstScreen({
  onSelect,
  resume,
  expressPlan,
}: {
  onSelect: (selection: SearchSelection) => void;
  /** Returning visitor's last destination, if we know one. */
  resume?: { label: string; onResume: () => void } | null;
  expressPlan?: { label: string; priceUsd: number; onBuy: () => void } | null;
}) {
  const { t } = useLang();
  const [greetKey, setGreetKey] = useState<DictKey>(() => greetingKeyFor(cambodiaHour()));
  const [resumeShown, setResumeShown] = useState(false);

  useEffect(() => {
    setGreetKey(greetingKeyFor(new Date().getHours()));
  }, []);

  // The one affordance for someone who already knows what they want. It waits
  // for the first frame to settle so it never competes with it.
  useEffect(() => {
    if (!resume) return;
    const id = setTimeout(() => setResumeShown(true), 600);
    return () => clearTimeout(id);
  }, [resume]);

  return (
    <div className="v3-first">
      <p className="v3-greeting" suppressHydrationWarning>
        {t(greetKey)}
      </p>
      <h1 className="v3-first-title">{t('v3.title')}</h1>
      <p className="v3-first-sub">{t('v3.sub')}</p>

      <DestinationSearch onSelect={onSelect} expressPlan={expressPlan} />

      <div className="v3-resume-slot">
        {resume && (
          <button
            type="button"
            className={`v3-resume ${resumeShown ? 'is-shown' : ''}`}
            onClick={resume.onResume}
          >
            {resume.label} — {t('v3.continue')}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
