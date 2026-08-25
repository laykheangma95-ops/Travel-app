// ─────────────────────────────────────────────────────────────────────────────
// What a GET /api/imports/:id poll response means for the screen — pulled out
// of components/travel/SocialLinkIntake.tsx as a plain, framework-free
// function so it can be unit tested directly (this repo's vitest config has
// no JSX/React plugin; importing a .tsx file into a test fails at transform
// time, and there is no @testing-library/react here to drive the component
// itself through a DOM). The component is the only real caller.
// ─────────────────────────────────────────────────────────────────────────────

export type JobPollStatus = 'queued' | 'processing' | 'needs_confirmation' | 'completed' | 'failed';

export type JobErrorCode = 'no_connector' | 'connector_error' | 'unsafe_url' | 'stuck_timeout' | null;

/** Which `jobFailed` copy the client shows. `connector_error`, and a failed
 *  job with no code at all (the older synchronous pipeline's plain
 *  failImport()), keep the generic sentence — a transient or unclassified
 *  failure is still honestly "we could not read that link". */
export type JobFailedReason = 'noConnector' | 'unsafeUrl' | 'stuckTimeout' | 'generic';

export function jobFailedReason(code: JobErrorCode): JobFailedReason {
  switch (code) {
    case 'no_connector':
      return 'noConnector';
    case 'unsafe_url':
      return 'unsafeUrl';
    case 'stuck_timeout':
      return 'stuckTimeout';
    default:
      return 'generic';
  }
}

export type PollDecision =
  | { kind: 'continue' }
  | { kind: 'timeout' }
  | { kind: 'review' }
  | { kind: 'failed' }
  | { kind: 'needsConfirmation' };

/**
 * `status` is null for a response the client could not read at all — a
 * network failure, an unparsable body, or a non-401 error status. That is
 * treated exactly like "not settled yet", not like a failure: a blip reading
 * a job that is still genuinely running must not be indistinguishable from
 * the job itself having failed. The deadline, not the read failure, is what
 * ends the wait.
 */
export function decidePollOutcome(status: JobPollStatus | null, deadlineExceeded: boolean): PollDecision {
  if (status === 'completed') return { kind: 'review' };
  if (status === 'failed') return { kind: 'failed' };
  if (status === 'needs_confirmation') return { kind: 'needsConfirmation' };
  return deadlineExceeded ? { kind: 'timeout' } : { kind: 'continue' };
}
