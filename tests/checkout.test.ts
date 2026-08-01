import { describe, expect, it } from 'vitest';
import { parseCheckoutBody } from '@/lib/checkout';
import { ApiError } from '@/lib/http';
import { isAdminEmail } from '@/lib/auth';
import { parseAirportCode, parseFlightNumber, parseIsoDate } from '@/lib/flightInput';

const validCustomer = {
  fullName: 'Sokha Prak',
  email: 'Sokha@Example.com',
  phone: '+855 12 345 678',
  contactMethod: 'telegram',
  deviceType: 'iphone',
};

describe('parseCheckoutBody', () => {
  it('accepts a valid customer and normalizes the email', () => {
    const { customer } = parseCheckoutBody({ customer: validCustomer });
    expect(customer.email).toBe('sokha@example.com');
  });

  it('rejects a malformed email', () => {
    expect(() => parseCheckoutBody({ customer: { ...validCustomer, email: 'not-an-email' } })).toThrow(
      ApiError
    );
  });

  it('rejects an absurdly long name', () => {
    expect(() =>
      parseCheckoutBody({ customer: { ...validCustomer, fullName: 'a'.repeat(500) } })
    ).toThrow(ApiError);
  });

  it('rejects a missing customer block', () => {
    expect(() => parseCheckoutBody({})).toThrow(ApiError);
  });

  it('rejects an unknown device type', () => {
    expect(() =>
      parseCheckoutBody({ customer: { ...validCustomer, deviceType: 'nokia-3310' } })
    ).toThrow(ApiError);
  });

  it('uses a client-supplied idempotency key when it is long enough', () => {
    const key = 'ck-1234567890abcdef';
    const { idempotencyKey } = parseCheckoutBody({ customer: validCustomer, idempotencyKey: key });
    expect(idempotencyKey).toBe(key);
  });

  it('derives a key when the client sends none', () => {
    const { idempotencyKey } = parseCheckoutBody({
      customer: validCustomer,
      items: [{ planId: 'vietnam-basic', quantity: 1 }],
    });
    expect(idempotencyKey).toMatch(/^auto:sokha@example\.com:/);
  });

  it('derives the same key for identical carts submitted together', () => {
    const body = {
      customer: validCustomer,
      items: [{ planId: 'vietnam-basic', quantity: 1 }],
    };
    expect(parseCheckoutBody(body).idempotencyKey).toBe(parseCheckoutBody(body).idempotencyKey);
  });

  it('derives different keys for different carts', () => {
    const a = parseCheckoutBody({
      customer: validCustomer,
      items: [{ planId: 'vietnam-basic', quantity: 1 }],
    });
    const b = parseCheckoutBody({
      customer: validCustomer,
      items: [{ planId: 'japan-premium', quantity: 2 }],
    });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it('ignores a too-short client key rather than trusting it', () => {
    const { idempotencyKey } = parseCheckoutBody({ customer: validCustomer, idempotencyKey: 'x' });
    expect(idempotencyKey).toMatch(/^auto:/);
  });
});

describe('isAdminEmail', () => {
  it('is false when no allowlist is configured, so a fresh deploy is not wide open', () => {
    const previous = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = '';
    try {
      expect(isAdminEmail('anyone@example.com')).toBe(false);
    } finally {
      process.env.ADMIN_EMAIL = previous;
    }
  });

  it('matches case-insensitively against the allowlist', () => {
    const previous = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = 'ops@domnerapp.com';
    try {
      expect(isAdminEmail('OPS@Domnerapp.com')).toBe(true);
      expect(isAdminEmail('intruder@example.com')).toBe(false);
      expect(isAdminEmail(null)).toBe(false);
      expect(isAdminEmail(undefined)).toBe(false);
    } finally {
      process.env.ADMIN_EMAIL = previous;
    }
  });
});

describe('flight input validation', () => {
  it.each(['QH215', 'vn841', 'TG 560', '5J904'])('accepts %s', (input) => {
    expect(parseFlightNumber(input)).toBe(input.replace(/\s/g, '').toUpperCase());
  });

  it.each(['', '../../etc/passwd', 'DROP TABLE', 'A', 'QH2151234567'])(
    'rejects %s',
    (input) => {
      expect(() => parseFlightNumber(input)).toThrow(ApiError);
    }
  );

  it('rejects a null flight number', () => {
    expect(() => parseFlightNumber(null)).toThrow(ApiError);
  });

  it('accepts a 3-letter airport code and uppercases it', () => {
    expect(parseAirportCode('pnh')).toBe('PNH');
  });

  it.each(['PNHX', 'P1H', '', '../'])('rejects airport code %s', (input) => {
    expect(() => parseAirportCode(input)).toThrow(ApiError);
  });

  it('accepts a real ISO date', () => {
    expect(parseIsoDate('2026-07-04', '2026-01-01')).toBe('2026-07-04');
  });

  it('falls back when the date is absent', () => {
    expect(parseIsoDate(null, '2026-01-01')).toBe('2026-01-01');
  });

  it.each(['2026-13-01', '2026-02-30', '04/07/2026', 'yesterday'])(
    'rejects date %s',
    (input) => {
      expect(() => parseIsoDate(input, '2026-01-01')).toThrow(ApiError);
    }
  );
});
