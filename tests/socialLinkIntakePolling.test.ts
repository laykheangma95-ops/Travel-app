// ─────────────────────────────────────────────────────────────────────────────
// decidePollOutcome (lib/travel/importPollDecision.ts) — the pure decision at
// the center of SocialLinkIntake's poll loop
// (components/travel/SocialLinkIntake.tsx). It lives in a plain .ts module,
// not the component itself, because this repo's vitest config has no
// JSX/React plugin — importing a .tsx file into a test fails at transform
// time — and there is no @testing-library/react anywhere in the tree to
// drive the component through a browser-like DOM instead.
//
// This is the piece most worth pinning down in isolation: it decides, for
// every status GET /api/imports/:id can return plus "the response could not
// be read at all", whether the screen keeps waiting, gives up, or moves on —
// and it is easy to get subtly wrong (e.g. treating a parse failure as a
// terminal failure, or forgetting the timeout check on a status that isn't
// settled yet).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { decidePollOutcome, isProcessingQuotaError, jobFailedReason } from '@/lib/travel/importPollDecision';

describe('a settled job', () => {
  it('completed always means review, timeout or not', () => {
    expect(decidePollOutcome('completed', false)).toEqual({ kind: 'review' });
    expect(decidePollOutcome('completed', true)).toEqual({ kind: 'review' });
  });

  it('failed always means failed, timeout or not', () => {
    expect(decidePollOutcome('failed', false)).toEqual({ kind: 'failed' });
    expect(decidePollOutcome('failed', true)).toEqual({ kind: 'failed' });
  });

  it('needs_confirmation always means needsConfirmation, timeout or not', () => {
    expect(decidePollOutcome('needs_confirmation', false)).toEqual({ kind: 'needsConfirmation' });
    expect(decidePollOutcome('needs_confirmation', true)).toEqual({ kind: 'needsConfirmation' });
  });
});

describe('a job still in flight', () => {
  it('queued keeps polling before the deadline', () => {
    expect(decidePollOutcome('queued', false)).toEqual({ kind: 'continue' });
  });

  it('processing keeps polling before the deadline', () => {
    expect(decidePollOutcome('processing', false)).toEqual({ kind: 'continue' });
  });

  it('queued past the deadline gives up, rather than settling for the traveler', () => {
    expect(decidePollOutcome('queued', true)).toEqual({ kind: 'timeout' });
  });

  it('processing past the deadline gives up the same way', () => {
    expect(decidePollOutcome('processing', true)).toEqual({ kind: 'timeout' });
  });
});

describe('a response the client could not read', () => {
  it('a null status (network failure, unparsable body, a non-401 error status) is treated as not-yet-settled', () => {
    // Never surfaced as a failure on its own — a blip reading a job that is
    // still genuinely running must not be indistinguishable from the job
    // itself having failed. The deadline is still what ends the wait.
    expect(decidePollOutcome(null, false)).toEqual({ kind: 'continue' });
  });

  it('a null status past the deadline still gives up rather than polling forever', () => {
    expect(decidePollOutcome(null, true)).toEqual({ kind: 'timeout' });
  });
});

describe('jobFailedReason — which copy a failed job gets', () => {
  it('maps each closed-vocabulary code to its own reason', () => {
    expect(jobFailedReason('no_connector')).toBe('noConnector');
    expect(jobFailedReason('unsafe_url')).toBe('unsafeUrl');
    expect(jobFailedReason('stuck_timeout')).toBe('stuckTimeout');
  });

  it('falls back to the generic reason for connector_error and null', () => {
    // connector_error is a transient/unclassified failure — still honestly
    // "we could not read that link", not a specific cause worth its own copy.
    expect(jobFailedReason('connector_error')).toBe('generic');
    // null covers a failed job the older synchronous pipeline's plain
    // failImport() wrote, which predates error_code and never sets it.
    expect(jobFailedReason(null)).toBe('generic');
  });
});

describe('isProcessingQuotaError — telling the daily cap apart from the burst limiter', () => {
  it('recognizes the shape assertWithinProcessingQuota actually throws', () => {
    // lib/travel/importJobs.ts: new ApiError('RATE_LIMITED', '...', { limit: quota })
    // becomes this body via lib/http.ts's fail(code, message, { details: error.details }).
    const body = {
      error: {
        code: 'RATE_LIMITED',
        message: 'You have imported a lot of places today. Please try again tomorrow.',
        details: { limit: 40 },
      },
    };
    expect(isProcessingQuotaError(body)).toBe(true);
  });

  it('does not mistake the route wrapper\'s own burst limiter for the daily cap', () => {
    // lib/http.ts's route() pre-check: fail('RATE_LIMITED', '...', { requestId, headers })
    // — same code, same status, but no `details` at all.
    const body = {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' },
    };
    expect(isProcessingQuotaError(body)).toBe(false);
  });

  it('is false for a body with no error at all, or one that failed to parse', () => {
    expect(isProcessingQuotaError(null)).toBe(false);
    expect(isProcessingQuotaError(undefined)).toBe(false);
    expect(isProcessingQuotaError({})).toBe(false);
    expect(isProcessingQuotaError({ error: { code: 'NOT_FOUND', message: 'gone' } })).toBe(false);
  });

  it('is false for a details object that exists but carries no limit field', () => {
    const body = { error: { code: 'RATE_LIMITED', message: '...', details: { retryAfterSeconds: 5 } } };
    expect(isProcessingQuotaError(body)).toBe(false);
  });
});
