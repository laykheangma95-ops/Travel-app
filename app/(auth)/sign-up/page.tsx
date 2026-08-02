'use client';

// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Info, MailCheck } from 'lucide-react';
import { AuthCard, AuthError, AuthSubmit, OAuthButtons, Divider } from '@/components/auth/AuthCard';
import { PhoneField } from '@/components/auth/PhoneField';
import { Input, FieldWrapper } from '@/components/ui/Input';
import { CountryPicker } from '@/components/ui/CountryPicker';
import { toE164, validatePhone } from '@/lib/phone';
import { consumeReturnTo, signUpWithPassword } from '@/lib/auth';

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    phoneCountry: 'KH',
    passportCountry: 'KH',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifySent, setVerifySent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Phone is optional. Only validate it when something was actually typed —
    // an empty field must never block account creation.
    if (form.phone.trim()) {
      const invalid = validatePhone(form.phoneCountry, form.phone);
      if (invalid) {
        setError(invalid);
        return;
      }
    }

    setLoading(true);
    const { error: authError, demo } = await signUpWithPassword(form.email, form.password, {
      fullName: form.fullName,
      phone: form.phone.trim() ? toE164(form.phoneCountry, form.phone) : undefined,
      passportCountry: form.passportCountry,
    });
    setLoading(false);
    if (demo) {
      router.push(consumeReturnTo());
      return;
    }
    if (authError) {
      setError(authError);
      return;
    }
    setVerifySent(true);
  };

  if (verifySent) {
    return (
      <AuthCard title="Check your email" subtitle="One more step to activate your account">
        <div className="flex flex-col items-center py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <MailCheck size={26} className="text-success" />
          </span>
          <p className="mt-4 text-sm text-ink-secondary">
            We sent a verification link to <strong className="text-ink">{form.email}</strong>. Click
            it to activate your account, then sign in.
          </p>
          <p className="mt-3 text-xs text-ink-muted">
            Already abroad? This link works on any wi-fi — no mobile signal needed.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Travel confidently with Domer"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-semibold text-secondary hover:text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <OAuthButtons onError={setError} />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          id="fullName"
          label="Full name"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          placeholder="e.g. Sokha Prak"
          autoComplete="name"
        />
        <Input
          id="email"
          type="email"
          label="Email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <Input
          id="password"
          type="password"
          label="Password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />

        <PhoneField
          label="Phone number (optional)"
          country={form.phoneCountry}
          onCountryChange={(phoneCountry) => setForm({ ...form, phoneCountry })}
          number={form.phone}
          onNumberChange={(phone) => setForm({ ...form, phone })}
          hint="For delivery updates and account recovery. You can add or verify it any time from Settings."
        />

        <FieldWrapper label="Passport country" htmlFor="passportCountry">
          <CountryPicker
            id="passportCountry"
            value={form.passportCountry}
            onChange={(passportCountry) => setForm({ ...form, passportCountry })}
            aria-label="Passport country"
          />
        </FieldWrapper>

        <p className="flex items-start gap-2 rounded-btn bg-surface-2 p-3 text-xs text-ink-secondary">
          <Info size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
          <span>
            We never make you verify a phone number to buy an eSIM. Most of our customers are
            already abroad with roaming switched off — your email is all we need.
          </span>
        </p>

        <AuthError message={error} />
        <AuthSubmit loading={loading}>Create Account</AuthSubmit>
      </form>
    </AuthCard>
  );
}
