'use client';

// Report on every shot, one tap — the reason picker *is* the confirmation
// (§5.2). There is no "are you sure": asking someone to confirm twice that a
// photo has a stranger in it is friction on exactly the wrong side.

import { useEffect, useRef, useState } from 'react';
import type { ReportReason } from '@/lib/corner-map/types';
import { useLang, type DictKey } from '@/lib/i18n';

const REASONS: { id: ReportReason; key: DictKey }[] = [
  { id: 'person', key: 'corner.report.person' },
  { id: 'unsafe', key: 'corner.report.unsafe' },
  { id: 'spam', key: 'corner.report.spam' },
  { id: 'wrong_place', key: 'corner.report.wrongPlace' },
  { id: 'other', key: 'corner.report.other' },
];

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason) => Promise<void> | void;
}

export function ReportDialog({ open, onClose, onSubmit }: ReportDialogProps) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    setBusy(false);
    firstRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pick = async (reason: ReportReason) => {
    setBusy(true);
    try {
      await onSubmit(reason);
      setDone(true);
      setTimeout(onClose, 1400);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={t('corner.close')}
        onClick={onClose}
        className="absolute inset-0 bg-dusk/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('corner.report.title')}
        className="relative w-full max-w-sm rounded-t-2xl bg-slab p-5 shadow-2xl sm:rounded-2xl"
      >
        {done ? (
          <p className="py-6 text-center text-sm text-paper">{t('corner.report.done')}</p>
        ) : (
          <>
            <h2 className="mb-4 text-base font-semibold text-paper">{t('corner.report.title')}</h2>
            {/* Labels wrap rather than truncate — Khmer runs 15–25% longer (§8). */}
            <div className="flex flex-col gap-1">
              {REASONS.map((r, i) => (
                <button
                  key={r.id}
                  ref={i === 0 ? firstRef : undefined}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(r.id)}
                  className="corner-label w-full rounded-lg px-3 py-3 text-left text-sm text-paper transition-colors hover:bg-dusk disabled:opacity-50"
                >
                  {t(r.key)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full rounded-lg px-3 py-3 text-sm text-ash transition-colors hover:text-paper"
            >
              {t('corner.report.cancel')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
