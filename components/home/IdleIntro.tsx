'use client';

/**
 * IdleIntro — everything the first screen is allowed to say.
 *
 * A greeting that knows what time it is where *you* are, one question, one
 * line of promise, and the search field. No products, no pricing, no banners,
 * no second CTA. The globe is the hero; this is the caption.
 *
 * The greeting depends on the visitor's own clock, which the server cannot
 * know, so it is rendered after mount. Its row reserves height up front so the
 * headline never jumps.
 */

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DestinationSearch } from '@/components/home/DestinationSearch';
import { PHASE_GLYPH, phaseForHour, type DayPhase } from '@/lib/destinationLive';
import { useLang, type DictKey } from '@/lib/i18n';
import type { Destination } from '@/types';

const GREETING_KEY: Record<DayPhase, DictKey> = {
  morning: 'home.greet.morning',
  afternoon: 'home.greet.afternoon',
  evening: 'home.greet.evening',
  // Late night still reads as "evening" — nobody wants to be told it is 02:00.
  night: 'home.greet.evening',
};

export function IdleIntro({ onSelect }: { onSelect: (dest: Destination) => void }) {
  const { t } = useLang();
  const [phase, setPhase] = useState<DayPhase | null>(null);

  useEffect(() => {
    const tick = () => setPhase(phaseForHour(new Date().getHours()));
    tick();
    // Re-check each minute so a visitor sitting on the page at 11:59 is
    // greeted correctly at 12:00.
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <p className="dgh-greet dgh-reveal" aria-live="polite">
        {phase && (
          <>
            {t(GREETING_KEY[phase])}{' '}
            <span aria-hidden="true">{PHASE_GLYPH[phase]}</span>
          </>
        )}
      </p>

      <h1 className="dgh-ask dgh-reveal">{t('home.ask')}</h1>
      <p className="dgh-sub dgh-reveal">{t('home.sub')}</p>

      <div className="dgh-reveal dgh-searchwrap">
        <DestinationSearch onSelect={onSelect} />
      </div>

      <div className="dgh-cue dgh-reveal" aria-hidden="true">
        <ChevronDown size={16} />
        <span>{t('home.scrollCue')}</span>
      </div>
    </>
  );
}
