'use client';

import { useState } from 'react';
import { BellRing, Check, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { WavyFlag } from '@/components/ui/WavyFlag';
import { useNotifications, defaultAlertPreferences, type FlightAlertPreferences } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface NotifyModalProps {
  open: boolean;
  onClose: () => void;
  flightNumber: string;
  date: string;
}

const alertOptions: { key: keyof Pick<FlightAlertPreferences, 'gateChange' | 'delay' | 'boarding' | 'landing'>; label: string }[] = [
  { key: 'gateChange', label: 'Gate changes' },
  { key: 'delay', label: 'Flight delayed' },
  { key: 'boarding', label: 'Boarding starts' },
  { key: 'landing', label: 'Flight landed' },
];

export function NotifyModal({ open, onClose, flightNumber, date }: NotifyModalProps) {
  const [prefs, setPrefs] = useState<FlightAlertPreferences>(defaultAlertPreferences);
  const { saving, registerAlerts } = useNotifications();
  const [done, setDone] = useState(false);

  const handleSave = async () => {
    const ok = await registerAlerts(flightNumber, date, prefs);
    if (ok) {
      setDone(true);
      setTimeout(() => {
        setDone(false);
        onClose();
      }, 1400);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Flight alerts — ${flightNumber}`}>
      {done ? (
        <div className="flex flex-col items-center py-8 text-center animate-fade-up">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success">
            <Check size={28} className="text-white" />
          </span>
          <p className="mt-4 font-semibold text-ink">Alerts set!</p>
          <p className="text-sm text-ink-secondary">We&apos;ll message you the moment anything changes.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-3 text-sm font-semibold text-ink">Get notified when:</p>
            <div className="space-y-2.5">
              {alertOptions.map((opt) => (
                <label key={opt.key} className="flex cursor-pointer items-center gap-3 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={prefs[opt.key]}
                    onChange={(e) => setPrefs({ ...prefs, [opt.key]: e.target.checked })}
                    className="h-4 w-4 rounded border-line text-accent accent-[#C69749]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="contact" className="mb-1.5 block text-sm font-semibold text-ink">
              Your phone number or Telegram:
            </label>
            <input
              id="contact"
              type="text"
              value={prefs.contact}
              onChange={(e) => setPrefs({ ...prefs, contact: e.target.value })}
              placeholder="+855 12 345 678 or @username"
              className="w-full rounded-btn border border-line px-4 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Notify me in:</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Notification language">
              {(['km', 'en'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  role="radio"
                  aria-checked={prefs.language === lang}
                  onClick={() => setPrefs({ ...prefs, language: lang })}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-btn border-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                    prefs.language === lang
                      ? 'border-accent bg-[#F5EEDC] text-accent'
                      : 'border-line text-ink-secondary hover:border-ink-muted'
                  )}
                >
                  <WavyFlag flag={lang === 'km' ? '🇰🇭' : '🇬🇧'} label={lang === 'km' ? 'Khmer' : 'English'} size={22} />
                  {lang === 'km' ? 'Khmer' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="liquid-glass-accent liquid-sheen inline-flex w-full items-center justify-center gap-2 rounded-btn px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
            Set Alert
          </button>
        </div>
      )}
    </Modal>
  );
}
