'use client';

import { useState } from 'react';
import { Copy, Check, DollarSign, MousePointerClick, ShoppingBag, Download, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';

// Demo affiliate stats — real values come from the affiliates table.
const demoStats = {
  referralCode: 'SOKHA30',
  clicks: 184,
  orders: 23,
  earnedUsd: 96.6,
};

export default function AffiliatePage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', telegram: '', plan: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const referralLink = `https://domnerapp.com/?ref=${demoStats.referralCode}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'affiliate.apply', ...form }),
    }).catch(() => undefined);
    setSubmitting(false);
    setSubmitted(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — link text remains selectable.
    }
  };

  return (
    <>
      {/* Hero */}
      <section className="bg-primary py-16 text-center">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Affiliate Program</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-5xl">
            Earn 30% on every eSIM you refer
          </h1>
          <p className="mt-4 text-white/70">
            Share Domer with your friends, followers, or tour groups — get paid in USD via ABA every
            month.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Apply form */}
          <div>
            <h2 className="mb-5 font-display text-xl font-bold text-ink">Apply to join</h2>
            <Card className="p-7">
              {submitted ? (
                <div className="flex flex-col items-center py-8 text-center animate-fade-up">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                    <Check size={26} className="text-success" />
                  </span>
                  <p className="mt-4 font-semibold text-ink">Application received!</p>
                  <p className="mt-1.5 text-sm text-ink-secondary">
                    We review applications within 48 hours and reply on Telegram.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <Input
                    id="name"
                    label="Name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <Input
                    id="email"
                    type="email"
                    label="Email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <Input
                    id="phone"
                    label="Phone"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  <Input
                    id="telegram"
                    label="Telegram"
                    placeholder="@username"
                    value={form.telegram}
                    onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                  />
                  <Textarea
                    id="plan"
                    label="How do you plan to promote Domer?"
                    required
                    placeholder="e.g. My Facebook travel group with 12,000 members…"
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value })}
                  />
                  <Button type="submit" disabled={submitting} className="w-full">
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    Submit application
                  </Button>
                </form>
              )}
            </Card>
          </div>

          {/* Dashboard preview */}
          <div>
            <h2 className="mb-5 font-display text-xl font-bold text-ink">
              Your dashboard <span className="text-sm font-normal text-ink-muted">(once approved)</span>
            </h2>
            <Card className="p-7">
              <p className="text-sm font-medium text-ink">Your referral link</p>
              <div className="mt-2 flex gap-2">
                <p className="flex-1 truncate rounded-btn bg-surface-3 px-3.5 py-2.5 font-mono text-xs text-ink-secondary">
                  {referralLink}
                </p>
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </Button>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { icon: MousePointerClick, label: 'Clicks this month', value: String(demoStats.clicks) },
                  { icon: ShoppingBag, label: 'Orders', value: String(demoStats.orders) },
                  { icon: DollarSign, label: 'Commission', value: `$${demoStats.earnedUsd.toFixed(2)}` },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-card border border-line bg-surface-2 p-4 text-center">
                    <stat.icon size={18} className="mx-auto text-accent" aria-hidden="true" />
                    <p className="mt-2 font-display text-lg font-bold text-ink">{stat.value}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-ink-muted">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-line pt-6">
                <p className="mb-3 text-sm font-semibold text-ink">Marketing materials</p>
                <div className="space-y-2">
                  {['Banner images (Facebook, Telegram)', 'Sample Facebook post text in Khmer', 'Referral guide PDF'].map(
                    (m) => (
                      <button
                        key={m}
                        type="button"
                        className="flex w-full items-center justify-between rounded-btn border border-line px-4 py-2.5 text-sm text-ink-secondary transition-colors hover:border-secondary hover:text-secondary"
                      >
                        {m}
                        <Download size={14} aria-hidden="true" />
                      </button>
                    )
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-20">
          <SectionHeading eyebrow="How it works" title="Three steps to your first payout" />
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: 1, title: 'Apply & get approved', body: 'Tell us how you plan to promote. We approve within 48 hours.' },
              { n: 2, title: 'Share your link', body: 'Your unique link gives friends 5% off — and you 30% commission.' },
              { n: 3, title: 'Get paid monthly', body: 'Commissions are paid in USD to your ABA account every month.' },
            ].map((s) => (
              <Card key={s.n} className="p-7 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-display font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 font-display font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-secondary">{s.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
