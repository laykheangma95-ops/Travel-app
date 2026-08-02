'use client';

// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { Mail, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeliveryChannel } from '@/types';

const options: Array<{
  id: DeliveryChannel;
  label: string;
  description: string;
  icon: typeof Mail;
  recommended?: boolean;
}> = [
  {
    id: 'both',
    label: 'Email + Telegram',
    description: 'Belt and braces — the QR lands in both places.',
    icon: Sparkles,
    recommended: true,
  },
  {
    id: 'email',
    label: 'Email only',
    description: 'Works anywhere, and stays in your inbox as a record.',
    icon: Mail,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'One tap after payment connects our bot to your chat.',
    icon: Send,
  },
];

interface DeliveryOptionsProps {
  value: DeliveryChannel;
  onChange: (value: DeliveryChannel) => void;
}

export function DeliveryOptions({ value, onChange }: DeliveryOptionsProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-ink">
        Where should we send your eSIM QR code?
      </legend>
      <div className="space-y-2.5">
        {options.map((option) => {
          const Icon = option.icon;
          const active = value === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-all duration-200',
                active
                  ? 'border-secondary bg-secondary/5 ring-2 ring-secondary/20'
                  : 'border-line hover:border-ink-muted hover:bg-surface-2'
              )}
            >
              <input
                type="radio"
                name="deliveryChannel"
                value={option.id}
                checked={active}
                onChange={() => onChange(option.id)}
                className="mt-1 h-4 w-4 accent-[#C69749]"
              />
              <Icon
                size={18}
                className={cn('mt-0.5 shrink-0', active ? 'text-secondary' : 'text-ink-muted')}
                aria-hidden="true"
              />
              <span className="flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {option.label}
                  {option.recommended && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-ink-secondary">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {value !== 'email' && (
        <p className="mt-3 rounded-btn bg-surface-2 p-3 text-xs text-ink-secondary">
          Telegram cannot be messaged from a phone number alone — after payment we&apos;ll show you
          a one-tap button that connects our bot to your chat. Your number is used to confirm it is
          really you. We always email the QR as well, so nothing is lost if you skip that step.
        </p>
      )}
    </fieldset>
  );
}
