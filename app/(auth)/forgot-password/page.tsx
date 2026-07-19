'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Input } from '@/components/ui/Input';
import { getSupabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabase();
    if (supabase) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    setSent(true);
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a reset link"
      footer={
        <Link href="/sign-in" className="font-semibold text-secondary hover:text-accent">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <MailCheck size={26} className="text-success" />
          </span>
          <p className="mt-4 text-sm text-ink-secondary">
            If an account exists for <strong className="text-ink">{email}</strong>, a reset link is
            on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            id="email"
            type="email"
            label="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
          {error && <p className="rounded-btn bg-danger/10 p-3 text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Send reset link
          </button>
        </form>
      )}
    </AuthCard>
  );
}
