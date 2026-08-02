'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, HelpCircle, Search } from 'lucide-react';

// Common eSIM-capable device families. Matched loosely against user input.
const ESIM_SUPPORTED = [
  'iphone 11', 'iphone 12', 'iphone 13', 'iphone 14', 'iphone 15', 'iphone 16',
  'iphone xs', 'iphone xr', 'iphone se',
  'galaxy s20', 'galaxy s21', 'galaxy s22', 'galaxy s23', 'galaxy s24', 'galaxy s25',
  'galaxy z fold', 'galaxy z flip', 'galaxy note 20',
  'pixel 3', 'pixel 4', 'pixel 5', 'pixel 6', 'pixel 7', 'pixel 8', 'pixel 9',
  'huawei p40', 'oppo find x3', 'oppo find x5', 'xiaomi 12', 'xiaomi 13', 'xiaomi 14',
];

const ESIM_UNSUPPORTED = [
  'iphone 6', 'iphone 7', 'iphone 8', 'iphone x ', 'galaxy a1', 'galaxy a2', 'galaxy a3',
  'galaxy j', 'redmi note', 'vivo y', 'oppo a',
];

type Result = 'supported' | 'unsupported' | 'unknown' | null;

export function DeviceChecker({ dark = false }: { dark?: boolean }) {
  const [model, setModel] = useState('');
  const [result, setResult] = useState<Result>(null);

  const check = () => {
    const q = model.trim().toLowerCase();
    if (!q) return;
    if (ESIM_SUPPORTED.some((d) => q.includes(d) || d.includes(q))) setResult('supported');
    else if (ESIM_UNSUPPORTED.some((d) => q.includes(d))) setResult('unsupported');
    else setResult('unknown');
  };

  return (
    <div className={dark ? 'night-card p-8' : 'rounded-card border border-line/60 bg-white p-8 shadow-card'}>
      <h3 className={dark ? 'font-display text-lg font-bold text-white' : 'font-display text-lg font-bold text-ink'}>
        Is my phone eSIM compatible?
      </h3>
      <p className={dark ? 'mt-1.5 text-sm text-white/70' : 'mt-1.5 text-sm text-ink-secondary'}>
        Type your phone model and we&apos;ll check for you.
      </p>
      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <input
          type="text"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setResult(null);
          }}
          placeholder="e.g. iPhone 14 Pro, Galaxy S23"
          aria-label="Phone model"
          className={
            dark
              ? 'min-h-[2.75rem] flex-1 rounded-btn border border-gold-light/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 backdrop-blur-md focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/25'
              : 'min-h-[2.75rem] flex-1 rounded-btn border border-line px-4 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20'
          }
        />
        <button
          type="submit"
          className={
            dark
              ? 'liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn px-5 py-2.5 text-sm font-semibold text-primary-deep transition-all hover:brightness-110'
              : 'inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn bg-secondary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-secondary-high'
          }
        >
          <Search size={16} /> Check
        </button>
      </form>

      {result === 'supported' && (
        <p className="mt-4 flex items-center gap-2 rounded-btn bg-emerald-50 p-3.5 text-sm font-medium text-success animate-fade-up">
          <CheckCircle2 size={18} /> Great news — your phone supports eSIM!
        </p>
      )}
      {result === 'unsupported' && (
        <p className="mt-4 flex items-center gap-2 rounded-btn bg-red-50 p-3.5 text-sm font-medium text-danger animate-fade-up">
          <XCircle size={18} /> Sorry, this model doesn&apos;t support eSIM. You&apos;ll need a physical SIM.
        </p>
      )}
      {result === 'unknown' && (
        <p className="mt-4 flex items-center gap-2 rounded-btn bg-amber-50 p-3.5 text-sm font-medium text-warning animate-fade-up">
          <HelpCircle size={18} /> We&apos;re not sure about this model — message our Khmer support on Telegram and we&apos;ll check.
        </p>
      )}
    </div>
  );
}
