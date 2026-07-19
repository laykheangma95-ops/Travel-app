import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const baseFieldClasses =
  'w-full rounded-btn border border-line bg-surface-1 px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted transition-all duration-200 ease-smooth focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 disabled:bg-surface-3';

interface FieldWrapperProps {
  label?: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}

export function FieldWrapper({ label, required, error, htmlFor, children }: FieldWrapperProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-accent">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, required, id, className, ...props },
  ref
) {
  return (
    <FieldWrapper label={label} required={required} error={error} htmlFor={id}>
      <input ref={ref} id={id} required={required} className={cn(baseFieldClasses, className)} {...props} />
    </FieldWrapper>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, required, id, className, children, ...props },
  ref
) {
  return (
    <FieldWrapper label={label} required={required} error={error} htmlFor={id}>
      <select ref={ref} id={id} required={required} className={cn(baseFieldClasses, className)} {...props}>
        {children}
      </select>
    </FieldWrapper>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, required, id, className, ...props },
  ref
) {
  return (
    <FieldWrapper label={label} required={required} error={error} htmlFor={id}>
      <textarea ref={ref} id={id} required={required} rows={3} className={cn(baseFieldClasses, className)} {...props} />
    </FieldWrapper>
  );
});
