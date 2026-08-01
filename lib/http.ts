// ─────────────────────────────────────────────────────────────────────────────
// API response envelope + route wrapper.
//
// Every route returns the same shape, so the client never has to guess:
//   success → the payload, plus `requestId`
//   failure → { error: { code, message }, requestId }
//
// `message` is safe to show a customer. Internal detail goes to the log under
// the same requestId, never into the response body.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { ConfigurationError } from './env';
import { PricingError } from './pricing';
import { log, requestId as newRequestId } from './logger';
import { checkRateLimit, type RateLimitName } from './rateLimit';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const STATUS_FOR: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** An error that is safe to render to the customer verbatim. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(data: T, init?: ResponseInit & { requestId?: string }): NextResponse {
  const { requestId, ...responseInit } = init ?? {};
  return NextResponse.json({ ...data, requestId }, responseInit);
}

export function fail(
  code: ApiErrorCode,
  message: string,
  opts?: { requestId?: string; headers?: HeadersInit; details?: Record<string, unknown> }
): NextResponse {
  return NextResponse.json(
    {
      error: { code, message, ...(opts?.details ? { details: opts.details } : {}) },
      requestId: opts?.requestId,
    },
    { status: STATUS_FOR[code], headers: opts?.headers }
  );
}

/** Parses a JSON body, turning malformed input into a clean 400. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    const body = (await request.json()) as T;
    if (body === null || typeof body !== 'object') {
      throw new ApiError('BAD_REQUEST', 'Request body must be a JSON object.');
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('BAD_REQUEST', 'Request body must be valid JSON.');
  }
}

export interface RouteContext {
  requestId: string;
}

type Handler = (request: Request, context: RouteContext) => Promise<NextResponse>;

/**
 * Wraps a route handler with request IDs, optional rate limiting, and a single
 * place where every thrown error becomes a correct status code.
 *
 * Crucially, an unexpected exception becomes a 500 — never a 200 with partial
 * data, and never an unhandled rejection that returns the platform's HTML error
 * page to a `fetch` expecting JSON.
 */
export function route(
  handler: Handler,
  options: { rateLimit?: RateLimitName; name?: string } = {}
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const requestId = newRequestId();
    const name = options.name ?? new URL(request.url).pathname;

    if (options.rateLimit) {
      const verdict = checkRateLimit(request, options.rateLimit);
      if (!verdict.ok) {
        log.warn('http.rate_limited', { name, requestId, limit: verdict.limit });
        return fail('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', {
          requestId,
          headers: {
            'Retry-After': String(verdict.retryAfterSeconds),
            'X-RateLimit-Limit': String(verdict.limit),
            'X-RateLimit-Remaining': '0',
          },
        });
      }
    }

    try {
      return await handler(request, { requestId });
    } catch (error) {
      // Configuration is missing somewhere it must not be faked.
      if (error instanceof ConfigurationError) {
        log.error('http.misconfigured', {
          name,
          requestId,
          service: error.service,
          missing: error.missing,
        });
        return fail(
          'SERVICE_UNAVAILABLE',
          'This service is temporarily unavailable. Our team has been notified.',
          { requestId }
        );
      }

      // The catalog rejected the order — the message is customer-safe by design.
      if (error instanceof PricingError) {
        log.warn('http.pricing_rejected', { name, requestId, code: error.code });
        return fail('BAD_REQUEST', error.message, { requestId, details: { reason: error.code } });
      }

      if (error instanceof ApiError) {
        const level = STATUS_FOR[error.code] >= 500 ? 'error' : 'warn';
        log[level]('http.api_error', { name, requestId, code: error.code, message: error.message });
        return fail(error.code, error.message, { requestId, details: error.details });
      }

      log.error('http.unhandled', { name, requestId, error });
      return fail('INTERNAL', 'Something went wrong on our side. Please try again.', { requestId });
    }
  };
}
