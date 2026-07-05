'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCart } from '@/hooks/useCart';

// Captures ?ref=CODE from any landing URL and stores it on the cart so the
// affiliate discount is auto-applied at checkout.
export function ReferralTracker() {
  const searchParams = useSearchParams();
  const setReferralCode = useCart((s) => s.setReferralCode);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferralCode(ref.toUpperCase());
      void fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'affiliate.click', referralCode: ref.toUpperCase() }),
      }).catch(() => undefined);
    }
  }, [searchParams, setReferralCode]);

  return null;
}
