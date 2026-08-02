'use client';

// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { AuthCard, AuthError, AuthSubmit, AuthTabs, OAuthButtons, Divider } from '@/components/auth/AuthCard';
import { PhoneField } from '@/components/auth/PhoneField';
import { OtpInput } from '@/components/auth/OtpInput';
import { Input } from '@/components/ui/Input';
import { toE164, validatePhone } from '@/lib/phone';
import {
  consumeReturnTo,
  sendEmailCode,
  sendPhoneCode,
  signInWithPassword,
  verifyEmailCode,
  verifyPhoneCode,
} from '@/lib/auth';

type Method = 'email' | 'phone';
type Stage = 'form' | 'code';

export default function SignInPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('email');
  const [stage, setStage] = useState<Stage>('form');
  const [usePassword, setUsePassword] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('KH');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const e164 = toE164(country, phone);

  const finish = () => router.push(consumeReturnTo());

  const switchMethod = (next: Method) => {
    setMethod(next);
    setStage('form');
    setCode('');
    setError(null);
  };

  const onSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (method === 'phone') {
      const invalid = validatePhone(country, phone);
      if (invalid) {
        setError(invalid);
        return;
      }
      setLoading(true);
      const { error: err, demo } = await sendPhoneCode(e164, false);
      setLoading(false);
      if (demo) return finish();
      if (err) return setError(err);
      setStage('code');
      return;
    }

    setLoading(true);
    if (usePassword) {
      const { error: err, demo } = await signInWithPassword(email, password);
      setLoading(false);
      if (demo) return finish();
      if (err) return setError(err);
      return finish();
    }

    const { error: err, demo } = await sendEmailCode(email, false);
    setLoading(false);
    if (demo) return finish();
    if (err) return setError(err);
    setStage('code');
  };

  const onSubmitCode = async (value: string) => {
    setError(null);
    setLoading(true);
    const { error: err, demo } =
      method === 'phone' ? await verifyPhoneCode(e164, value) : await verifyEmailCode(email, value);
    setLoading(false);
    if (demo) return finish();
    if (err) {
      setCode('');
      return setError(err);
    }
    finish();
  };

  const resend = async () => {
    setError(null);
    setLoading(true);
    const { error: err } =
      method === 'phone' ? await sendPhoneCode(e164, false) : await sendEmailCode(email, false);
    setLoading(false);
    if (err) setError(err);
  };

  if (stage === 'code') {
    return (
      <AuthCard
        title="Enter your code"
        subtitle={
          method === 'phone'
            ? `We sent a 6-digit code to ${e164}`
            : `We sent a 6-digit code to ${email}`
        }
      >
        <div className="space-y-5">
          <OtpInput value={code} onChange={setCode} onComplete={onSubmitCode} disabled={loading} invalid={Boolean(error)} />
          <AuthError message={error} />

          {method === 'phone' && (
            <div className="rounded-btn bg-surface-2 p-4">
              <p className="flex items-start gap-2 text-xs text-ink-secondary">
                <WifiOff size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                <span>
                  <strong className="text-ink">Abroad and the SMS never arrives?</strong> That is
                  normal — roaming is often off. Sign in with your email or Google account instead;
                  it works on any wi-fi.
                </span>
              </p>
              <button
                type="button"
                onClick={() => switchMethod('email')}
                className="mt-2 text-xs font-semibold text-secondary hover:text-accent"
              >
                Use email instead
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setStage('form')}
              className="inline-flex items-center gap-1 text-ink-secondary hover:text-ink"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={loading}
              className="font-semibold text-secondary hover:text-accent disabled:opacity-60"
            >
              Resend code
            </button>
          </div>
        </div>
      </AuthCard>
    );
  }

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
      <OAuthButtons onError={setError} />
      <Divider />

      <AuthTabs
        tabs={[
          { id: 'email', label: 'Email' },
          { id: 'phone', label: 'Phone' },
        ]}
        active={method}
        onChange={switchMethod}
      />

      <form onSubmit={onSubmitForm} className="space-y-4">
        {method === 'email' ? (
          <>
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
            {usePassword && (
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
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-secondary hover:text-accent"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setUsePassword((p) => !p);
                setError(null);
              }}
              className="text-xs font-semibold text-secondary hover:text-accent"
            >
              {usePassword ? 'Email me a sign-in code instead' : 'Use my password instead'}
            </button>
          </>
        ) : (
          <PhoneField
            country={country}
            onCountryChange={setCountry}
            number={phone}
            onNumberChange={setPhone}
            required
            hint="We'll text you a 6-digit code. Needs roaming or a local signal."
          />
        )}

        <AuthError message={error} />
        <AuthSubmit loading={loading}>
          {method === 'phone' || !usePassword ? 'Send code' : 'Sign In'}
        </AuthSubmit>
      </form>

      {method === 'phone' && (
        <p className="mt-4 text-center text-xs text-ink-muted">
          Travelling with no signal? Use the Email tab or Google — no SMS needed.
        </p>
      )}
    </AuthCard>
  );
}
