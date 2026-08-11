import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { fail } from './envelope';

/**
 * Every endpoint requires all three headers. A missing or wrong credential
 * returns exactly `{ "statusCode": 401, "message": "Unauthorized" }` — no hint
 * about which header was wrong, which is what the real API does.
 *
 * `Content-Type: application/json` is required even on GETs. That is unusual,
 * and it is the single most likely thing to break a client that assumes GETs
 * carry no content type — so the mock enforces it.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const partner = header(req, 'x-partner');
  const key = header(req, 'x-authorization');
  const contentType = header(req, 'content-type');

  if (partner !== config.partnerId || key !== config.apiKey) {
    fail(res, 401, 'Unauthorized');
    return;
  }

  if (!contentType || !contentType.toLowerCase().includes('application/json')) {
    fail(res, 401, 'Unauthorized');
    return;
  }

  next();
}

/** Terminal handler for a path that exists under a different verb. */
export function methodNotAllowed(_req: Request, res: Response): void {
  fail(res, 405, 'Method not allowed');
}

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
