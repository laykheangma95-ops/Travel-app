'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthCard, OAuthButtons, Divider } from '@/components/auth/AuthCard';
import { Input } from '@/components/ui/Input';
import { getSupabase } from '@/lib/supabase';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) {
      // Demo mode: no Supabase project configured yet.
      router.push('/dashboard');
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    // Return to checkout if the user was mid-purchase.
    const returnTo = sessionStorage.getItem('domner-return-to');
    sessionStorage.removeItem('domner-return-to');
    router.push(returnTo ?? '/dashboard');
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Domner account"
      footer={
        <>
          New to Domner?{' '}
          <Link href="/sign-up" className="font-semibold text-secondary hover:text-accent">
            Create an account
          </Link>
        </>
      }
    >
      <OAuthButtons />
      <Divider />
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
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 disabled:opacity-60"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          Sign In
        </button>
      </form>
    </AuthCard>
  );
}
