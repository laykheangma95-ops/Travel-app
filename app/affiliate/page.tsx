'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, DollarSign, MousePointerClick, ShoppingBag, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { SignInLink } from '@/components/ui/SignInLink';

/** The caller's own affiliate row, from /api/affiliate/me. Never anyone else's. */
interface AffiliateSelf {
  referralCode: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  clicks: number;
  orders: number;
  earnedUsd: number;
  commissionRate: number;
}

type SelfState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'none' }
  | { kind: 'ready'; affiliate: AffiliateSelf };

export default function AffiliatePage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', telegram: '', plan: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [self, setSelf] = useState<SelfState>({ kind: 'loading' });

  // This panel used to render a hardcoded referral code and invented earnings to
  // every visitor. Anyone who copied that link credited another account's
  // referrals. It now shows the caller's own row, or says plainly that there
  // isn't one yet.
  const loadSelf = useCallback(async () => {
    try {
      const response = await fetch('/api/affiliate/me', { credentials: 'include' });
      if (response.status === 401) {
        setSelf({ kind: 'guest' });
        return;
      }
      const body = (await response.json().catch(() => null)) as { affiliate?: AffiliateSelf | null } | null;
      setSelf(body?.affiliate ? { kind: 'ready', affiliate: body.affiliate } : { kind: 'none' });
    } catch {
      setSelf({ kind: 'none' });
    }
  }, []);

  useEffect(() => {
    void loadSelf();
  }, [loadSelf]);

  // Built from the current origin, not a baked-in production host, so a link
  // copied from a preview deployment points at that deployment.
  const referralLink =
    self.kind === 'ready' && typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${self.affiliate.referralCode}`
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'affiliate.apply', ...form }),
      });
      if (!response.ok) throw new Error();
      setSubmitted(true);
      // Applying while signed in files the row against this account, so the
      // panel opposite can fill in straight away.
      void loadSelf();
    } catch {
      setSubmitError('Could not send your application. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — link text remains visible and selectable.
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0e1b30] py-16 text-center text-white shadow-[0_18px_50px_rgba(14,27,48,0.18)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(87,200,255,0.22),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(230,203,139,0.12),transparent_36%)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-2xl px-4 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#e6cb8b]">Affiliate Program</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-5xl">
            Earn 30% on every eSIM you refer
          </h1>
          <p className="mt-4 text-[#d9e9f5]">
            Share Domner with your friends, followers, or tour groups — get paid in USD via ABA every
            month.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Apply form */}
          <div>
            <h2 className="mb-5 font-display text-xl font-bold text-[#0e1b30]">Apply to join</h2>
            <Card className="border-[#d9e9f5] bg-white/95 p-7 shadow-[0_18px_50px_rgba(20,38,63,0.10)]">
              {submitted ? (
                <div className="flex flex-col items-center py-8 text-center animate-fade-up">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
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
                    label="How do you plan to promote Domner?"
                    required
                    placeholder="e.g. My Facebook travel group with 12,000 members…"
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value })}
                  />
                  {submitError && (
                    <p role="alert" className="text-sm text-danger">
                      {submitError}
                    </p>
                  )}
                  <Button type="submit" variant="secondary" disabled={submitting} className="w-full bg-[#0e2a52] hover:bg-[#123b70]">
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    Submit application
                  </Button>
                </form>
              )}
            </Card>
          </div>

          {/* The affiliate's own numbers. Nothing here is rendered unless it
              came back from /api/affiliate/me for this caller. */}
          <div>
            <h2 className="mb-5 font-display text-xl font-bold text-[#0e1b30]">Your dashboard</h2>
            <Card className="border-[#d9e9f5] bg-white/95 p-7 shadow-[0_18px_50px_rgba(20,38,63,0.10)]">
              {self.kind === 'loading' && (
                <div className="space-y-3" aria-busy="true">
                  <div className="h-10 animate-pulse rounded-btn bg-surface-3 motion-reduce:animate-none" />
                  <div className="h-24 animate-pulse rounded-card bg-surface-3 motion-reduce:animate-none" />
                </div>
              )}

              {self.kind === 'guest' && (
                <div className="py-6 text-center">
                  <p className="font-semibold text-ink">Sign in to see your dashboard</p>
                  <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-secondary">
                    Your referral link and earnings are tied to your account.
                  </p>
                  <SignInLink
                    returnTo="/affiliate"
                    className="mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn bg-[#0e2a52] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123b70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#57c8ff]"
                  >
                    Sign in
                  </SignInLink>
                </div>
              )}

              {self.kind === 'none' && (
                <div className="py-6 text-center">
                  <p className="font-semibold text-ink">No application yet</p>
                  <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-secondary">
                    Apply on the left. Once we approve you, your referral link and live earnings
                    appear here.
                  </p>
                </div>
              )}

              {self.kind === 'ready' && (
                <>
                  {self.affiliate.status !== 'approved' && (
                    <p className="mb-5 rounded-btn border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-ink-secondary">
                      {self.affiliate.status === 'pending'
                        ? 'Your application is under review. We reply on Telegram within 48 hours — your link starts counting once approved.'
                        : self.affiliate.status === 'suspended'
                          ? 'This affiliate account is suspended. Contact us on Telegram and we will look into it.'
                          : 'This application was not approved. You are welcome to apply again with more detail.'}
                    </p>
                  )}

                  <p className="text-sm font-medium text-ink">Your referral link</p>
                  <div className="mt-2 flex gap-2">
                    <p className="flex-1 truncate rounded-btn bg-surface-3 px-3.5 py-2.5 font-mono text-xs text-ink-secondary">
                      {referralLink ?? `/?ref=${self.affiliate.referralCode}`}
                    </p>
                    <Button variant="outline" size="sm" onClick={copyLink} disabled={!referralLink}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      <span className="sr-only">Copy referral link</span>
                    </Button>
                  </div>
                  {copied && (
                    <p role="status" className="mt-1.5 text-xs text-success">
                      Link copied.
                    </p>
                  )}

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {[
                      {
                        icon: MousePointerClick,
                        label: 'Clicks',
                        value: self.affiliate.clicks.toLocaleString(),
                      },
                      { icon: ShoppingBag, label: 'Orders', value: self.affiliate.orders.toLocaleString() },
                      {
                        icon: DollarSign,
                        label: 'Commission',
                        value: `$${self.affiliate.earnedUsd.toFixed(2)}`,
                      },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-card border border-[#d9e9f5] bg-[#f4faff] p-4 text-center shadow-[0_8px_24px_rgba(87,200,255,0.10)]">
                        <stat.icon size={18} className="mx-auto text-[#168bd1]" aria-hidden="true" />
                        <p className="mt-2 font-display text-lg font-bold text-ink tabular-nums">{stat.value}</p>
                        <p className="mt-0.5 text-[11px] leading-tight text-ink-muted">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-xs text-ink-muted">
                    Paid monthly in USD via ABA at {Math.round(self.affiliate.commissionRate * 100)}%
                    commission. Totals update as orders are confirmed.
                  </p>
                </>
              )}
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
              <Card key={s.n} className="border-[#d9e9f5] bg-white/95 p-7 text-center shadow-[0_18px_50px_rgba(20,38,63,0.08)]">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#168bd1] font-display font-bold text-white shadow-[0_8px_18px_rgba(22,139,209,0.25)]">
                  {s.n}
                </span>
                <h3 className="mt-4 font-display font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-secondary">{s.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
