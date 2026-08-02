'use client';

// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { useState } from 'react';
import { BadgeCheck, ShieldQuestion } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PhoneField } from '@/components/auth/PhoneField';
import { OtpInput } from '@/components/auth/OtpInput';
import { AuthError } from '@/components/auth/AuthCard';
import { toE164, validatePhone } from '@/lib/phone';
import { confirmPhoneLink, startPhoneLink } from '@/lib/auth';

interface PhoneVerifyCardProps {
  initialCountry?: string;
  initialNumber?: string;
  verifiedAt?: string | null;
}

/**
 * Verify-later flow. A traveller who signed up on airport wi-fi lands here
 * once our eSIM has given them data — or once they are home again. Nothing in
 * the product is gated on finishing this.
 */
export function PhoneVerifyCard({
  initialCountry = 'KH',
  initialNumber = '',
  verifiedAt = null,
}: PhoneVerifyCardProps) {
  const [country, setCountry] = useState(initialCountry);
  const [number, setNumber] = useState(initialNumber);
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'idle' | 'code' | 'done'>(verifiedAt ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const e164 = toE164(country, number);

  const sendCode = async () => {
    const invalid = validatePhone(country, number);
    if (invalid) return setError(invalid);
    setError(null);
    setLoading(true);
    const { error: err, demo } = await startPhoneLink(e164);
    setLoading(false);
    if (err && !demo) return setError(err);
    setStage('code');
  };

  const confirm = async (value: string) => {
    setError(null);
    setLoading(true);
    const { error: err, demo } = await confirmPhoneLink(e164, value);
    setLoading(false);
    if (err && !demo) {
      setCode('');
      return setError(err);
    }
    setStage('done');
  };

  if (stage === 'done') {
    return (
      <Card className="p-7">
        <h2 className="flex items-center gap-2 font-display font-bold text-ink">
          <BadgeCheck size={18} className="text-success" aria-hidden="true" />
          Phone verified
        </h2>
        <p className="mt-2 text-sm text-ink-secondary">
          {e164 || initialNumber} is confirmed. We can now reach you for delivery problems and use
          it to recover your account.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            setStage('idle');
            setCode('');
          }}
        >
          Change number
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-7">
      <h2 className="flex items-center gap-2 font-display font-bold text-ink">
        <ShieldQuestion size={18} className="text-ink-muted" aria-hidden="true" />
        Verify your phone <span className="text-sm font-medium text-ink-muted">(optional)</span>
      </h2>
      <p className="mt-2 text-sm text-ink-secondary">
        A verified number lets us text you if an eSIM install fails, and gives you a second way back
        into your account. Skip it while you are travelling without signal — it can wait.
      </p>

      <div className="mt-5 space-y-4">
        {stage === 'idle' ? (
          <>
            <PhoneField
              country={country}
              onCountryChange={setCountry}
              number={number}
              onNumberChange={setNumber}
              label="Mobile number"
            />
            <AuthError message={error} />
            <Button type="button" onClick={sendCode} disabled={loading}>
              {loading ? 'Sending…' : 'Send verification code'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-secondary">
              Enter the 6-digit code we sent to <strong className="text-ink">{e164}</strong>.
            </p>
            <OtpInput value={code} onChange={setCode} onComplete={confirm} disabled={loading} invalid={Boolean(error)} />
            <AuthError message={error} />
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStage('idle')}>
                Back
              </Button>
              <Button type="button" variant="outline" onClick={sendCode} disabled={loading}>
                Resend
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
