'use client';

import { useEffect, useState } from 'react';
import { useLang, type DictKey } from '@/lib/i18n';

type Slot = 'morning' | 'afternoon' | 'evening';

function slotFor(hour: number): Slot {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const ICON: Record<Slot, string> = {
  morning: '☀️',
  afternoon: '🌤️',
  evening: '🌙',
};

/**
 * Time-of-day greeting.
 *
 * Deliberately renders nothing until after mount. The server has no idea what
 * time it is where the visitor is, so greeting them on the server would either
 * produce a hydration mismatch or confidently say "Good morning" to someone
 * whose evening it is. An empty first paint is the honest option, and the
 * reserved height stops it from shifting the headline when it appears.
 */
export function HeroGreeting() {
  const { t, lang } = useLang();
  const [slot, setSlot] = useState<Slot | null>(null);

  useEffect(() => {
    const update = () => setSlot(slotFor(new Date().getHours()));
    update();
    // Re-check every ten minutes so a session open across the boundary
    // (someone browsing at 17:58) does not keep the wrong greeting.
    const id = window.setInterval(update, 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p
      className="min-h-[1.75rem] text-base font-medium text-white/75 sm:text-lg"
      // The greeting swaps in silently after hydration; announcing it would
      // interrupt a screen reader for something purely atmospheric.
      aria-live="off"
    >
      {slot && (
        <span className={lang === 'km' ? 'font-khmer' : undefined}>
          {t(`hero.greet.${slot}` as DictKey)}{' '}
          <span aria-hidden="true">{ICON[slot]}</span>
        </span>
      )}
    </p>
  );
}
