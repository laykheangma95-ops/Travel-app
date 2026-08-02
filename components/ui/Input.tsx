import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ≥44px min-height keeps every field a comfortable touch target (skill §6).
const baseFieldClasses =
  'w-full rounded-btn border px-4 py-2.5 text-sm min-h-[2.75rem] transition-all duration-200 ease-smooth focus:outline-none focus:ring-2';

// Light utility variant (dashboards/admin) vs. night-glass variant (funnel on
// the .night-canvas surface) — see .claude/skills/ui-ux §9 concept continuity.
const lightField =
  'border-line bg-white text-ink placeholder:text-ink-muted focus:border-secondary focus:ring-secondary/20 disabled:bg-surface-3';
const darkField =
  'border-gold-light/20 bg-white/5 text-white placeholder:text-white/40 backdrop-blur-md focus:border-gold-light/50 focus:ring-gold-light/25 disabled:opacity-50';

interface FieldWrapperProps {
  label?: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  dark?: boolean;
  children: React.ReactNode;
}

export function FieldWrapper({ label, required, error, htmlFor, dark, children }: FieldWrapperProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className={cn('block text-sm font-medium', dark ? 'text-white/80' : 'text-ink')}>
          {label}
          {required && <span className="ml-0.5 text-accent">*</span>}
        </label>
      )}
      {children}
      {error && <p className={cn('text-xs', dark ? 'text-danger' : 'text-danger')} role="alert">{error}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  dark?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, required, id, className, dark, ...props },
  ref
) {
  return (
    <FieldWrapper label={label} required={required} error={error} htmlFor={id} dark={dark}>
      <input ref={ref} id={id} required={required} className={cn(baseFieldClasses, dark ? darkField : lightField, className)} {...props} />
    </FieldWrapper>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  dark?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, required, id, className, dark, children, ...props },
  ref
) {
  return (
    <FieldWrapper label={label} required={required} error={error} htmlFor={id} dark={dark}>
      <select
        ref={ref}
        id={id}
        required={required}
        className={cn(
          baseFieldClasses,
          dark ? cn(darkField, '[&>option]:bg-primary-deep [&>option]:text-white') : lightField,
          className
        )}
        {...props}
      >
        {children}
      </select>
    </FieldWrapper>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  dark?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, required, id, className, dark, ...props },
  ref
) {
  return (
    <FieldWrapper label={label} required={required} error={error} htmlFor={id} dark={dark}>
      <textarea ref={ref} id={id} required={required} rows={3} className={cn(baseFieldClasses, dark ? darkField : lightField, className)} {...props} />
    </FieldWrapper>
  );
});
