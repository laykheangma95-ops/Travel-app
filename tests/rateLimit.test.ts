import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMITS, __resetRateLimits, checkRateLimit, clientKey } from '@/lib/rateLimit';

// The regression this file exists for: nothing throttled the public endpoints.
// /api/flightradar proxies free, volunteer-run ADS-B networks that will ban our
// egress IP, and /api/payments/* creates a database row and a gateway object
// per call.

function requestFrom(ip: string): Request {
  return new Request('https://domnerapp.com/api/test', {
    headers: { 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  __resetRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
  __resetRateLimits();
});

describe('checkRateLimit', () => {
  it('permits requests up to the limit', () => {
    const request = requestFrom('1.1.1.1');
    const { limit } = RATE_LIMITS.checkout;

    for (let i = 0; i < limit; i += 1) {
      expect(checkRateLimit(request, 'checkout').ok).toBe(true);
    }
  });

  it('blocks the request after the limit', () => {
    const request = requestFrom('2.2.2.2');
    const { limit } = RATE_LIMITS.checkout;

    for (let i = 0; i < limit; i += 1) checkRateLimit(request, 'checkout');

    const blocked = checkRateLimit(request, 'checkout');
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each client separately', () => {
    const { limit } = RATE_LIMITS.checkout;
    for (let i = 0; i < limit; i += 1) checkRateLimit(requestFrom('3.3.3.3'), 'checkout');

    expect(checkRateLimit(requestFrom('3.3.3.3'), 'checkout').ok).toBe(false);
    expect(checkRateLimit(requestFrom('4.4.4.4'), 'checkout').ok).toBe(true);
  });

  it('counts each rule separately', () => {
    const request = requestFrom('5.5.5.5');
    const { limit } = RATE_LIMITS.checkout;

    for (let i = 0; i < limit; i += 1) checkRateLimit(request, 'checkout');

    expect(checkRateLimit(request, 'checkout').ok).toBe(false);
    expect(checkRateLimit(request, 'flightData').ok).toBe(true);
  });

  it('lets the window slide', () => {
    vi.useFakeTimers();
    const request = requestFrom('6.6.6.6');
    const { limit, windowMs } = RATE_LIMITS.checkout;

    for (let i = 0; i < limit; i += 1) checkRateLimit(request, 'checkout');
    expect(checkRateLimit(request, 'checkout').ok).toBe(false);

    vi.advanceTimersByTime(windowMs + 1000);
    expect(checkRateLimit(request, 'checkout').ok).toBe(true);
  });

  it('decrements the remaining count', () => {
    const request = requestFrom('7.7.7.7');
    const first = checkRateLimit(request, 'checkout');
    const second = checkRateLimit(request, 'checkout');

    expect(second.remaining).toBe(first.remaining - 1);
  });

  it('supports an explicit identity so limits can key on a user', () => {
    const { limit } = RATE_LIMITS.checkout;
    const shared = requestFrom('8.8.8.8');

    for (let i = 0; i < limit; i += 1) checkRateLimit(shared, 'checkout', 'user-a');

    expect(checkRateLimit(shared, 'checkout', 'user-a').ok).toBe(false);
    expect(checkRateLimit(shared, 'checkout', 'user-b').ok).toBe(true);
  });
});

describe('clientKey', () => {
  it('takes the left-most x-forwarded-for entry', () => {
    const request = new Request('https://domnerapp.com/', {
      headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1, 10.0.0.2' },
    });
    expect(clientKey(request)).toBe('9.9.9.9');
  });

  it('falls back to a constant so an unknown client is limited, not exempt', () => {
    expect(clientKey(new Request('https://domnerapp.com/'))).toBe('unknown-client');
  });
});
