// ─────────────────────────────────────────────────────────────────────────────
// The GoHub exchange log.
//
// WHY THIS EXISTS:
//   When a customer says "I paid and got nothing", the only thing that settles
//   it is the raw exchange: what we sent, what came back, and when. Reproducing
//   it later is impossible — the order is already in whatever state it is in.
//   So every request and every response is recorded as it happens.
//
//   The API key never appears in a log line. Nor does a full email address.
//
// WHERE IT GOES:
//   By default, one structured line per exchange through lib/logger, which the
//   platform's log drain already collects and which works on a read-only
//   filesystem. Set GOHUB_API_LOG_PATH to also append JSONL to a file locally.
//
//   To send it to a `gohub_api_log` table instead, call `setApiLogSink()` once
//   at startup with a writer. Nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

import { log, redactEmail } from '@/lib/logger';

export interface GohubApiLogEntry {
  /** Correlates the request and response rows, and any error thrown from them. */
  requestId: string;
  direction: 'request' | 'response';
  method: string;
  path: string;
  /** Attempt number, so a retried call is legible rather than duplicated. */
  attempt: number;
  status?: number;
  envelopeStatus?: number;
  durationMs?: number;
  /** Redacted. Never contains the API key. */
  headers?: Record<string, string>;
  body?: unknown;
  error?: string;
  at: string;
}

export type ApiLogSink = (entry: GohubApiLogEntry) => void;

const MAX_BODY_CHARS = 8_000;

let sink: ApiLogSink | null = null;

/** Swap the destination — a Supabase writer, a queue, whatever. */
export function setApiLogSink(next: ApiLogSink | null): void {
  sink = next;
}

export function recordApiLog(entry: GohubApiLogEntry): void {
  const safe = { ...entry, body: truncate(redactBody(entry.body)) };

  if (sink) {
    try {
      sink(safe);
    } catch (error) {
      log.warn('gohub.api_log_sink_failed', { requestId: entry.requestId, error });
    }
  }

  log.info('gohub.api', safe as unknown as Record<string, unknown>);
  appendToFile(safe);
}

/** Headers minus the credential. The partner id is not secret; the key is. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = name.toLowerCase() === 'x-authorization' ? '[redacted]' : value;
  }
  return out;
}

/**
 * Customer contact details are the one thing in an order payload we must not
 * write out in full — the log is far more widely readable than the orders table.
 */
function redactBody(body: unknown): unknown {
  if (body === null || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(redactBody);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (lower.includes('email') && typeof value === 'string') {
      out[key] = redactEmail(value);
    } else if (lower.includes('phone') && typeof value === 'string') {
      out[key] = maskPhone(value);
    } else {
      out[key] = redactBody(value);
    }
  }
  return out;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 2 ? '***' : `***${digits.slice(-2)}`;
}

function truncate(body: unknown): unknown {
  if (typeof body !== 'string') {
    // Objects are serialized by the logger; guard the pathological case only.
    const serialized = safeStringify(body);
    if (serialized.length <= MAX_BODY_CHARS) return body;
    return `${serialized.slice(0, MAX_BODY_CHARS)}…[truncated]`;
  }
  return body.length <= MAX_BODY_CHARS ? body : `${body.slice(0, MAX_BODY_CHARS)}…[truncated]`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * Optional local JSONL sink. Off unless GOHUB_API_LOG_PATH is set, because a
 * production deployment has a read-only filesystem and a failed write must
 * never take an order down.
 */
function appendToFile(entry: GohubApiLogEntry): void {
  const path = process.env.GOHUB_API_LOG_PATH?.trim();
  if (!path) return;

  void import('node:fs')
    .then((fs) => {
      fs.appendFileSync(path, `${JSON.stringify(entry)}\n`);
    })
    .catch((error) => {
      log.warn('gohub.api_log_file_failed', { path, error });
    });
}
