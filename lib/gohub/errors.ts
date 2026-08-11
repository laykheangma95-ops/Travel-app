// ─────────────────────────────────────────────────────────────────────────────
// Typed GoHub failures.
//
// The distinction that matters is RETRYABLE vs PERMANENT. Retrying a 400 just
// produces the same 400 three times more slowly; retrying a 430 is worse — it
// is the supplier telling us the order already exists, and hammering it looks
// like a double-purchase attempt.
//
// So: 500s and transport failures retry. 400, 401, 404, 409 and 430 never do.
// ─────────────────────────────────────────────────────────────────────────────

export interface GohubErrorContext {
  status?: number;
  /** The `statusCode` from the response envelope, which need not match HTTP. */
  envelopeStatus?: number;
  method?: string;
  path?: string;
  /** Correlates with the row written to the API log. */
  requestId?: string;
  body?: string;
}

export class GohubError extends Error {
  readonly status: number | undefined;
  readonly envelopeStatus: number | undefined;
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly requestId: string | undefined;
  readonly body: string | undefined;
  /** True when another attempt could plausibly succeed. */
  readonly retryable: boolean = false;

  constructor(message: string, context: GohubErrorContext = {}) {
    super(message);
    this.name = 'GohubError';
    this.status = context.status;
    this.envelopeStatus = context.envelopeStatus;
    this.method = context.method;
    this.path = context.path;
    this.requestId = context.requestId;
    this.body = context.body;
  }
}

/** 401 — wrong or missing X-Partner / X-Authorization. Never retried. */
export class GohubAuthError extends GohubError {
  constructor(message = 'Unauthorized', context: GohubErrorContext = {}) {
    super(message, context);
    this.name = 'GohubAuthError';
  }
}

/** 404 — unknown item, order or ICCID. Never retried. */
export class GohubNotFoundError extends GohubError {
  constructor(message = 'Resource not found', context: GohubErrorContext = {}) {
    super(message, context);
    this.name = 'GohubNotFoundError';
  }
}

/** 400 / 405 / 422 — the request itself is wrong. Never retried. */
export class GohubValidationError extends GohubError {
  constructor(message = 'Invalid request', context: GohubErrorContext = {}) {
    super(message, context);
    this.name = 'GohubValidationError';
  }
}

/**
 * 409 / 430 — already handled.
 *
 * This is a SUCCESS signal wearing an error's clothes: the order exists. The
 * caller should look it up by `partnerOrderReference`, not create another one.
 */
export class GohubDuplicateError extends GohubError {
  constructor(message = 'The request has already been handled', context: GohubErrorContext = {}) {
    super(message, context);
    this.name = 'GohubDuplicateError';
  }
}

/** 5xx. Retryable. */
export class GohubServerError extends GohubError {
  override readonly retryable = true;

  constructor(message = 'GoHub server error', context: GohubErrorContext = {}) {
    super(message, context);
    this.name = 'GohubServerError';
  }
}

/**
 * Timed out or the connection failed.
 *
 * Retryable, but note what it does NOT tell us: whether GoHub processed the
 * request. A timed-out POST /orders may well have created an order, which is
 * exactly why every order carries a `partnerOrderReference` we can search for.
 */
export class GohubTimeoutError extends GohubError {
  override readonly retryable = true;

  constructor(message = 'GoHub request timed out', context: GohubErrorContext = {}) {
    super(message, context);
    this.name = 'GohubTimeoutError';
  }
}

/** A 2xx we could not parse, or an envelope missing its `data`. Not retryable. */
export class GohubProtocolError extends GohubError {
  constructor(message = 'Unexpected GoHub response', context: GohubErrorContext = {}) {
    super(message, context);
    this.name = 'GohubProtocolError';
  }
}

/** Maps an HTTP status onto the right error class. */
export function errorForStatus(
  status: number,
  message: string,
  context: GohubErrorContext
): GohubError {
  if (status === 401 || status === 403) return new GohubAuthError(message, context);
  if (status === 404) return new GohubNotFoundError(message, context);
  if (status === 409 || status === 430) return new GohubDuplicateError(message, context);
  if (status >= 500) return new GohubServerError(message, context);
  if (status >= 400) return new GohubValidationError(message, context);
  return new GohubProtocolError(message, context);
}
