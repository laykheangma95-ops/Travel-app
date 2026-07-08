'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { AuthCard, OAuthButtons, Divider } from '@/components/auth/AuthCard';
import { Input, Select } from '@/components/ui/Input';
import { getSupabase } from '@/lib/supabase';

const passportCountries = [
  { code: 'KH', label: 'Cambodia 🇰🇭' },
  { code: 'TH', label: 'Thailand 🇹🇭' },
  { code: 'VN', label: 'Vietnam 🇻🇳' },
  { code: 'LA', label: 'Laos 🇱🇦' },
  { code: 'OTHER', label: 'Other' },
];

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    passportCountry: 'KH',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifySent, setVerifySent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) {
      router.push('/dashboard');
      return;
    }
    const { error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.fullName,
          phone: form.phone,
          passport_country: form.passportCountry,
        },
      },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
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
      <OAuthButtons />
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
        <Input
          id="phone"
          label="Phone number"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+855 12 345 678"
          autoComplete="tel"
        />
        <Select
          id="passportCountry"
          label="Passport country"
          value={form.passportCountry}
          onChange={(e) => setForm({ ...form, passportCountry: e.target.value })}
        >
          {passportCountries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
        {error && <p className="rounded-btn bg-red-50 p-3 text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 disabled:opacity-60"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          Create Account
        </button>
      </form>
    </AuthCard>
  );
}
