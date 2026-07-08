'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// Client gate for the admin panel. The email is verified server-side against
// the ADMIN_EMAIL env variable via /api/admin.
export function AdminGate({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setAuthorized(sessionStorage.getItem('domner-admin') === '1');
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        sessionStorage.setItem('domner-admin', '1');
        setAuthorized(true);
      } else {
        setError('This email does not have admin access.');
      }
    } catch {
      setError('Could not verify. Try again.');
    } finally {
      setChecking(false);
    }
  };

  if (authorized === null) return <div className="py-24" aria-busy="true" />;

  if (!authorized) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center px-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-3">
          <Lock size={24} className="text-ink-secondary" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-xl font-bold text-ink">Admin access</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">
          Enter the admin email to open the Domer control panel.
        </p>
        <form onSubmit={verify} className="mt-6 w-full space-y-3">
          <Input
            id="admin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@domnerapp.com"
            aria-label="Admin email"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={checking} className="w-full">
            {checking && <Loader2 size={16} className="animate-spin" />}
            Continue
          </Button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
