'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthCard, OAuthButtons, Divider } from '@/components/auth/AuthCard';
import { Input } from '@/components/ui/Input';
import { getSupabase } from '@/lib/supabase';

type Method = 'email' | 'phone';

export default function SignInPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('email');

  // Email flow
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Phone flow
  const [phone, setPhone] = useState('+855');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goAfterAuth = () => {
    const returnTo = sessionStorage.getItem('domner-return-to');
    sessionStorage.removeItem('domner-return-to');
    router.push(returnTo ?? '/dashboard');
  };

  // ── Email + password ──────────────────────────────────────────────────────
  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) {
      router.push('/dashboard'); // Demo mode
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) return setError(authError.message);
    goAfterAuth();
  };

  // ── Phone: send the one-time SMS code ─────────────────────────────────────
  const onSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) {
      // Demo mode: pretend we sent a code and move to the verify step.
      setLoading(false);
      setOtpSent(true);
      setNotice('Demo mode — enter any 6 digits to continue.');
      return;
    }
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (otpError) return setError(otpError.message);
    setOtpSent(true);
    setNotice(`We sent a 6-digit code to ${phone}.`);
  };

  // ── Phone: verify the code ────────────────────────────────────────────────
  const onVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) {
      router.push('/dashboard'); // Demo mode
      return;
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    setLoading(false);
    if (verifyError) return setError(verifyError.message);
    goAfterAuth();
  };

  const switchMethod = (m: Method) => {
    setMethod(m);
    setError(null);
    setNotice(null);
    setOtpSent(false);
    setOtp('');
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Domer account"
      footer={
        <>
          New to Domer?{' '}
          <Link href="/sign-up" className="font-semibold text-secondary hover:text-accent">
            Create an account
          </Link>
        </>
      }
    >
      <OAuthButtons />
      <Divider />

      {/* Email / Phone segmented toggle */}
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-btn bg-surface-2 p-1">
        {(['email', 'phone'] as Method[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMethod(m)}
            aria-pressed={method === m}
            className={`rounded-[10px] py-2 text-sm font-semibold capitalize transition-all duration-200 ${
              method === m ? 'bg-white text-ink shadow-card' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {method === 'email' ? (
        <form onSubmit={onEmailSubmit} className="space-y-4">
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
          <div>
            <Input
              id="password"
              type="password"
              label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <div className="mt-1.5 text-right">
              <Link href="/forgot-password" className="text-xs font-medium text-secondary hover:text-accent">
                Forgot password?
              </Link>
            </div>
          </div>
          {error && <p className="rounded-btn bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <SubmitButton loading={loading}>Sign In</SubmitButton>
        </form>
      ) : !otpSent ? (
        <form onSubmit={onSendCode} className="space-y-4">
          <Input
            id="phone"
            type="tel"
            label="Phone number"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+855 12 345 678"
            autoComplete="tel"
            inputMode="tel"
          />
          <p className="text-xs text-ink-muted">
            We&apos;ll text you a one-time code. Include your country code (e.g. +855 for Cambodia).
          </p>
          {error && <p className="rounded-btn bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <SubmitButton loading={loading}>Send code</SubmitButton>
        </form>
      ) : (
        <form onSubmit={onVerifyCode} className="space-y-4">
          <Input
            id="otp"
            type="text"
            label="Verification code"
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            autoComplete="one-time-code"
            inputMode="numeric"
          />
          {notice && <p className="rounded-btn bg-green-50 p-3 text-sm text-jade">{notice}</p>}
          {error && <p className="rounded-btn bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <SubmitButton loading={loading}>Verify &amp; sign in</SubmitButton>
          <button
            type="button"
            onClick={() => {
              setOtpSent(false);
              setOtp('');
              setError(null);
              setNotice(null);
            }}
            className="w-full text-center text-xs font-medium text-secondary hover:text-accent"
          >
            Use a different number
          </button>
        </form>
      )}
    </AuthCard>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 disabled:opacity-60"
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
