import { describe, expect, it } from 'vitest';
import {
  classifySupabaseError,
  customerSafeMessage,
  describeSupabaseError,
} from '@/lib/supabaseError';

// The invariant this file protects: a Supabase failure is classified by its
// code, not by guessing from prose, and nothing that reaches a log line carries
// a customer's row values.

describe('classifySupabaseError', () => {
  it('reads a missing table as our fault, not the caller\'s', () => {
    const failure = classifySupabaseError({
      code: '42P01',
      message: 'relation "public.esim_orders" does not exist',
    });

    expect(failure.kind).toBe('missing_table');
    expect(failure.ourFault).toBe(true);
    expect(failure.retryable).toBe(false);
    expect(failure.operatorHint).toContain('migration');
  });

  it('separates an RLS refusal from a missing table', () => {
    expect(classifySupabaseError({ code: '42501' }).kind).toBe('rls_denied');
    expect(classifySupabaseError({ code: 'PGRST205' }).kind).toBe('missing_table');
  });

  it('treats a duplicate as expected traffic rather than an incident', () => {
    const failure = classifySupabaseError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "esim_orders_idempotency_key_key"',
    });

    expect(failure.kind).toBe('duplicate');
    // A replayed webhook must not page anyone.
    expect(failure.ourFault).toBe(false);
  });

  it('marks only the transient failures retryable', () => {
    expect(classifySupabaseError({ code: '57014' }).retryable).toBe(true);
    expect(classifySupabaseError({ code: '53300' }).retryable).toBe(true);
    expect(classifySupabaseError({ code: '23503' }).retryable).toBe(false);
  });

  it('recognises a dead session from an auth error with no code', () => {
    const failure = classifySupabaseError({
      status: 400,
      message: 'Invalid Refresh Token: Refresh Token Not Found',
    });

    expect(failure.kind).toBe('stale_session');
    expect(failure.ourFault).toBe(false);
  });

  it('falls back to the status when there is nothing else to go on', () => {
    expect(classifySupabaseError({ status: 503, message: 'Service Unavailable' }).kind).toBe(
      'unavailable'
    );
    expect(classifySupabaseError(null).kind).toBe('unknown');
    expect(classifySupabaseError(undefined).message).toBe('Unknown error');
  });
});

describe('describeSupabaseError', () => {
  it('scrubs the row values Postgres pastes into constraint messages', () => {
    const fields = describeSupabaseError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint — Key (customer_email)=(sokha@example.com) already exists',
    });

    expect(fields.dbMessage).not.toContain('sokha@example.com');
    expect(fields.dbMessage).toContain('=(***)');
  });

  it('drops PostgREST details entirely — that field echoes the whole row', () => {
    const fields = describeSupabaseError({
      code: '23505',
      message: 'duplicate key',
      details: 'Key (customer_phone)=(+855 12 345 678) already exists.',
      hint: null,
    });

    expect(Object.keys(fields)).not.toContain('details');
    expect(JSON.stringify(fields)).not.toContain('855');
  });
});

describe('customerSafeMessage', () => {
  it('never leaks schema detail to a customer', () => {
    const message = customerSafeMessage({
      code: '42P01',
      message: 'relation "public.esim_orders" does not exist',
    });

    expect(message).not.toContain('esim_orders');
    expect(message).toBe('Something went wrong on our side. Please try again.');
  });

  it('tells a signed-out customer what to actually do', () => {
    expect(customerSafeMessage({ message: 'Invalid Refresh Token: Refresh Token Not Found' })).toBe(
      'Your session has expired. Please sign in again.'
    );
  });
});
