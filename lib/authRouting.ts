const ADMIN_PREFIX = '/admin';
const CUSTOMER_PROTECTED_PREFIXES = [
  '/dashboard',
  '/my-esims',
  '/my-trips',
  '/settings',
  '/trips',
  '/updates',
  '/you/notifications',
] as const;
const AUTH_PAGE_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
] as const;

export const DEFAULT_AUTH_RETURN_TO = '/dashboard';
export const AUTH_RETURN_TO_COOKIE = 'domner-return-to';
export const AUTH_RETURN_TO_MAX_AGE_SECONDS = 60 * 60;
const INTERNAL_ORIGIN = 'https://domner.local';

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAdminRoute(pathname: string): boolean {
  return matchesPrefix(pathname, ADMIN_PREFIX);
}

export function isProtectedCustomerRoute(pathname: string): boolean {
  return CUSTOMER_PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function normalizeReturnTo(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_RETURN_TO
): string {
  if (!value) return fallback;

  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;

    const normalized = `${url.pathname}${url.search}${url.hash}`;
    if (!normalized.startsWith('/') || normalized.startsWith('//')) return fallback;
    if (isAuthPage(url.pathname)) return fallback;
    return normalized;
  } catch {
    return fallback;
  }
}

export function currentPathWithSearch(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

export function readReturnTo(searchParams: URLSearchParams): string | null {
  const normalized = normalizeReturnTo(searchParams.get('returnTo'), '');
  return normalized || null;
}

export function applyReturnTo(url: URL, value: string | null | undefined): URL {
  const normalized = normalizeReturnTo(value, '');
  if (normalized) {
    url.searchParams.set('returnTo', normalized);
  } else {
    url.searchParams.delete('returnTo');
  }
  return url;
}
