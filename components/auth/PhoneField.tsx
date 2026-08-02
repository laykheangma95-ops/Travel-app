'use client';

import { FieldWrapper } from '@/components/ui/Input';
import { CountryPicker } from '@/components/ui/CountryPicker';

interface PhoneFieldProps {
  country: string;
  onCountryChange: (code: string) => void;
  number: string;
  onNumberChange: (value: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function PhoneField({
  country,
  onCountryChange,
  number,
  onNumberChange,
  label = 'Phone number',
  hint,
  error,
  required,
  disabled,
  autoFocus,
}: PhoneFieldProps) {
  return (
    <FieldWrapper label={label} required={required} error={error} htmlFor="phone-number">
      <div className="flex gap-2">
        <CountryPicker
          value={country}
          onChange={onCountryChange}
          showDial
          compact
          disabled={disabled}
          aria-label="Country calling code"
        />
        <input
          id="phone-number"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          value={number}
          onChange={(e) => onNumberChange(e.target.value)}
          placeholder="12 345 678"
          className="w-full rounded-btn border border-line bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted transition-all duration-200 ease-smooth focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 disabled:bg-surface-3"
        />
      </div>
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
    </FieldWrapper>
  );
}
