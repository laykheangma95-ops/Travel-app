'use client';

// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { AuthCard, AuthError, AuthSubmit } from '@/components/auth/AuthCard';
import { OtpInput } from '@/components/auth/OtpInput';
import { Input } from '@/components/ui/Input';
import {
  consumeRecoveryLink,
  consumeReturnTo,
  updatePassword,
  verifyRecoveryCode,
} from '@/lib/auth';

const MIN_LENGTH = 8;

type Stage = 'checking' | 'code' | 'form' | 'done';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [stage, setStage] = useState<Stage>('checking');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The link carries the recovery token. Trade it for a session before showing
  // the form, so we never collect a new password we have no authority to set.
  useEffect(() => {
    let cancelled = false;
    consumeRecoveryLink().then(({ ready, error: linkError }) => {
      if (cancelled) return;
      if (linkError) setError(linkError);
      setStage(ready ? 'form' : 'code');
      // Keep the token out of the address bar, history and any Referer header.
      if (window.location.search || window.location.hash) {
        window.history.replaceState(null, '', '/reset-password');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submitCode = async (value: string) => {
    if (!email.trim()) {
      setError('Enter the email address you asked us to reset.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: codeError, demo } = await verifyRecoveryCode(email.trim(), value);
    setLoading(false);
    if (codeError && !demo) {
      setCode('');
      setError(codeError);
      return;
    }
    setStage('form');
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: updateError, demo } = await updatePassword(password);
    setLoading(false);
    if (updateError && !demo) {
      setError(updateError);
      return;
    }
    setStage('done');
  };

  if (stage === 'checking') {
    return (
      <AuthCard title="Checking your link" subtitle="One moment…">
        <div className="flex justify-center py-8">
          <Loader2 size={26} className="animate-spin text-ink-muted" aria-hidden="true" />
        </div>
      </AuthCard>
    );
  }

  if (stage === 'done') {
    return (
      <AuthCard title="Password updated" subtitle="You are signed in on this device">
        <div className="flex flex-col items-center py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <ShieldCheck size={26} className="text-success" aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm text-ink-secondary">
            Use your new password next time you sign in.
          </p>
          <button
            type="button"
            onClick={() => router.replace(consumeReturnTo())}
            className="mt-6 inline-flex w-full items-center justify-center rounded-btn bg-accent px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
          >
            Continue
          </button>
        </div>
      </AuthCard>
    );
  }

  if (stage === 'code') {
    return (
      <AuthCard
        title="Enter your reset code"
        subtitle="The six digits from the email we sent"
        footer={
          <Link href="/forgot-password" className="font-semibold text-secondary hover:text-accent">
            Send a new reset email
          </Link>
        }
      >
        <div className="space-y-4">
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
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            disabled={loading}
            invalid={Boolean(error)}
          />
          <AuthError message={error} />
          <p className="text-xs text-ink-muted">
            Opening the link from your email app can land you in a different browser than the one
            you started in — typing the code always works.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Almost done"
      footer={
        <Link href="/sign-in" className="font-semibold text-secondary hover:text-accent">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submitPassword} className="space-y-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
          <KeyRound size={22} className="text-ink-muted" aria-hidden="true" />
        </span>
        <Input
          id="password"
          type="password"
          label="New password"
          required
          minLength={MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`At least ${MIN_LENGTH} characters`}
          autoComplete="new-password"
        />
        <Input
          id="confirm"
          type="password"
          label="Confirm new password"
          required
          minLength={MIN_LENGTH}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it again"
          autoComplete="new-password"
        />
        <AuthError message={error} />
        <AuthSubmit loading={loading}>Save New Password</AuthSubmit>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Checking your link" subtitle="One moment…">
          <div className="flex justify-center py-8">
            <Loader2 size={26} className="animate-spin text-ink-muted" aria-hidden="true" />
          </div>
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
