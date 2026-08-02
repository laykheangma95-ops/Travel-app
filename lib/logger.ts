// ─────────────────────────────────────────────────────────────────────────────
// Structured logging.
//
// One line of JSON per event so Vercel's log drain, Datadog or BetterStack can
// filter on `event` and `level` without regex-parsing prose. Never log a full
// email, phone number, card detail or auth token — helpers below redact.
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: unknown;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/** `sokha@example.com` → `s***a@example.com`. Enough to correlate, not to identify. */
export function redactEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? local.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

/** Keeps the last two digits only — enough to match a support ticket to an order. */
export function redactPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 2 ? '***' : `***${digits.slice(-2)}`;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;

  const record = {
    level,
    event,
    ts: new Date().toISOString(),
    ...fields,
  };

  const line = JSON.stringify(record, (_key, value) =>
    value instanceof Error ? { name: value.name, message: value.message } : value
  );

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

/** Correlates every log line and the error envelope for a single request. */
export function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
}
