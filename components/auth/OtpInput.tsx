'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the last box is filled. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * Six separate boxes that behave like one field: paste, arrow keys, backspace
 * and iOS/Android SMS autofill all work. `autoComplete="one-time-code"` on the
 * first box is what lets the OS offer the code from the notification.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (value.length === length) onComplete?.(value);
    // Only re-fire when the code itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length]);

  const setDigit = (index: number, digit: string) => {
    const next = (value.slice(0, index) + digit + value.slice(index + 1)).slice(0, length);
    onChange(next);
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      e.preventDefault();
      onChange(value.slice(0, index - 1));
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2" onPaste={onPaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ''}
          onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={cn(
            'h-14 w-11 rounded-btn border bg-white text-center font-display text-xl font-bold text-ink transition-all duration-200 focus:outline-none focus:ring-2 disabled:bg-surface-3',
            invalid
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-line focus:border-secondary focus:ring-secondary/20'
          )}
        />
      ))}
    </div>
  );
}
