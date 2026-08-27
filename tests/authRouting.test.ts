import { describe, expect, it } from 'vitest';
import {
  currentPathWithSearch,
  isAdminRoute,
  isAuthPage,
  isProtectedCustomerRoute,
  normalizeReturnTo,
} from '@/lib/authRouting';

describe('normalizeReturnTo', () => {
  it('keeps same-origin app paths, including query strings', () => {
    expect(normalizeReturnTo('/trips/123?tab=itinerary')).toBe('/trips/123?tab=itinerary');
  });

  it('falls back when the path is missing', () => {
    expect(normalizeReturnTo(null, '/dashboard')).toBe('/dashboard');
  });

  it('rejects protocol-relative and non-path values', () => {
    expect(normalizeReturnTo('//evil.example.com', '/dashboard')).toBe('/dashboard');
    expect(normalizeReturnTo('https://evil.example.com', '/dashboard')).toBe('/dashboard');
  });

  it('rejects auth pages to avoid callback and sign-in loops', () => {
    expect(normalizeReturnTo('/sign-in', '/dashboard')).toBe('/dashboard');
    expect(normalizeReturnTo('/auth/callback?code=123', '/dashboard')).toBe('/dashboard');
    expect(normalizeReturnTo('/reset-password#token', '/dashboard')).toBe('/dashboard');
  });

  it('preserves hash fragments for same-origin in-app destinations', () => {
    expect(normalizeReturnTo('/trips/123?tab=itinerary#day-2', '/dashboard')).toBe(
      '/trips/123?tab=itinerary#day-2'
    );
  });
});

describe('isProtectedCustomerRoute', () => {
  it('covers the real signed-in traveler routes', () => {
    expect(isProtectedCustomerRoute('/trips')).toBe(true);
    expect(isProtectedCustomerRoute('/trips/abc/edit')).toBe(true);
    expect(isProtectedCustomerRoute('/updates')).toBe(true);
    expect(isProtectedCustomerRoute('/you/notifications')).toBe(true);
    expect(isProtectedCustomerRoute('/settings')).toBe(true);
  });

  it('leaves public routes alone', () => {
    expect(isProtectedCustomerRoute('/')).toBe(false);
    expect(isProtectedCustomerRoute('/you')).toBe(false);
    expect(isProtectedCustomerRoute('/explore')).toBe(false);
    expect(isProtectedCustomerRoute('/affiliate')).toBe(false);
  });
});

describe('route helpers', () => {
  it('identifies admin and auth pages by prefix', () => {
    expect(isAdminRoute('/admin')).toBe(true);
    expect(isAdminRoute('/admin/orders')).toBe(true);
    expect(isAdminRoute('/trips')).toBe(false);

    expect(isAuthPage('/sign-in')).toBe(true);
    expect(isAuthPage('/auth/callback')).toBe(true);
    expect(isAuthPage('/auth/callback/complete')).toBe(true);
    expect(isAuthPage('/settings')).toBe(false);
  });

  it('preserves search strings when building a return path', () => {
    expect(currentPathWithSearch('/trips/abc', '?tab=edit')).toBe('/trips/abc?tab=edit');
    expect(currentPathWithSearch('/updates', '')).toBe('/updates');
  });
});
