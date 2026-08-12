import { describe, expect, it } from 'vitest';
import { classifyQuery, diagnose, maskEmail, maskPhone } from '@/lib/support';
import type { EsimOrder } from '@/types';

// The invariant this file protects: the call-centre console resolves an
// identifier the caller already has, and never becomes a way to browse the
// customer list. classifyQuery is where that is decided.

function order(partial: Partial<EsimOrder> = {}): EsimOrder {
  return {
    status: 'paid',
    created_at: new Date().toISOString(),
    esim_iccid: null,
    qr_code_url: null,
    esim_activation_code: null,
    delivered_email_at: null,
    delivered_telegram_at: null,
    ...partial,
  } as EsimOrder;
}

const MINUTES = 60_000;

describe('classifyQuery', () => {
  it('recognises an email address', () => {
    expect(classifyQuery('Jane@Example.com')).toEqual({ kind: 'email', value: 'jane@example.com' });
  });

  it('recognises a phone number and strips the spacing people read out', () => {
    expect(classifyQuery('+855 12 345-678')).toEqual({ kind: 'phone', value: '+85512345678' });
  });

  it('treats anything else as an order number, upper-cased', () => {
    expect(classifyQuery('dn-2026-0001')).toEqual({
      kind: 'order_number',
      value: 'DN-2026-0001',
    });
  });

  it('rejects a term too short to be a real identifier', () => {
    expect(classifyQuery('a')).toBeNull();
    expect(classifyQuery('  ')).toBeNull();
  });

  it('does not treat a partial email as an email — the wildcard search is the leak', () => {
    // '@gmail' must not resolve to an email lookup; it falls through to an
    // exact order-number match, which will simply find nothing.
    expect(classifyQuery('@gmail.com')?.kind).toBe('order_number');
    expect(classifyQuery('jane@')?.kind).toBe('order_number');
  });
});

describe('masking', () => {
  it('masks the local part of an email but keeps the domain', () => {
    expect(maskEmail('jane@gmail.com')).toBe('j•••@gmail.com');
  });

  it('keeps the dialling code and last four digits of a phone number', () => {
    expect(maskPhone('+85512345678')).toBe('+855••••5678');
  });

  it('returns null for missing contact details rather than a masked empty string', () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskPhone(null)).toBeNull();
  });
});

describe('diagnose', () => {
  it('flags a paid order with no eSIM after five minutes as the refund risk it is', () => {
    const result = diagnose(
      order({ status: 'paid', created_at: new Date(Date.now() - 10 * MINUTES).toISOString() })
    );

    expect(result.diagnosis).toContain('stuck');
    expect(result.nextAction).toContain('Escalate');
  });

  it('does not panic about an order that was paid seconds ago', () => {
    const result = diagnose(order({ status: 'paid' }));

    expect(result.diagnosis).toContain('still being issued');
    expect(result.nextAction).not.toContain('Escalate');
  });

  it('spots a paid order that has an eSIM but was never marked fulfilled', () => {
    const result = diagnose(order({ status: 'paid', esim_iccid: '8985' }));

    expect(result.nextAction).toContain('Mark it fulfilled');
  });

  it('spots a fulfilled order that never reached the customer', () => {
    const result = diagnose(order({ status: 'fulfilled', esim_iccid: '8985' }));

    expect(result.diagnosis).toContain('no record of it reaching');
    expect(result.nextAction).toContain('Re-send');
  });

  it('reports a delivered order as complete', () => {
    const result = diagnose(
      order({
        status: 'fulfilled',
        esim_iccid: '8985',
        delivered_email_at: new Date().toISOString(),
      })
    );

    expect(result.diagnosis).toContain('Complete');
  });

  it('tells the operator nothing was charged on an abandoned checkout', () => {
    const result = diagnose(
      order({ status: 'pending', created_at: new Date(Date.now() - 60 * MINUTES).toISOString() })
    );

    expect(result.nextAction).toContain('Nothing was charged');
  });
});
