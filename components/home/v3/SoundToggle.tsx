'use client';

// The one control that turns the sound on.
//
// Off by default, and that is a design decision rather than caution. This
// audience browses on shared phones, in tuk-tuks, on the back of a moto, in
// offices — a website that makes noise uninvited is not luxurious, it is rude,
// and it is the fastest way to get a tab closed. So the invitation is quiet and
// the answer is remembered.
//
// It appears a beat after the page settles, so it is never competing with the
// first frame, and turning it on plays the one sound that explains what you
// just agreed to.

import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSoundOn, loadSoundPreference, onSoundChange, setSoundEnabled } from '@/lib/sound';
import { useLang } from '@/lib/i18n';

export function SoundToggle({ delayMs = 1400 }: { delayMs?: number }) {
  const { t } = useLang();
  const [on, setOn] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setOn(loadSoundPreference() && isSoundOn());
    return onSoundChange(setOn);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);

  return (
    <button
      type="button"
      className={`v3-sound ${shown ? 'is-shown' : ''} ${on ? 'is-on' : ''}`}
      aria-pressed={on}
      aria-label={on ? t('v3.soundOff') : t('v3.soundOn')}
      onClick={() => setSoundEnabled(!on)}
    >
      {on ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
      <span className="v3-sound-label">{on ? t('v3.soundOff') : t('v3.soundOn')}</span>
    </button>
  );
}
