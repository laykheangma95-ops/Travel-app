// ─────────────────────────────────────────────────────────────────────────────
// POST /api/imports — "here is a link, write it down".
//
// The intake endpoint. It records that a traveler wants a link processed and
// hands back the job id. It does not fetch the link, does not read the post and
// does not know what is in it — that is the connector layer, which does not
// exist yet.
//
// NOT /api/travel/extract. That endpoint runs the whole synchronous pipeline
// for the platforms Domner can already read, and is unchanged. This one accepts
// a link from any supported platform — including Xiaohongshu, which nothing can
// read yet — and queues it.
//
// THE BROWSER NEVER FETCHES ANYTHING REMOTE. A URL arrives as a string, is
// validated server-side, and is stored. No part of this asks a client to
// resolve, preview or follow it.
//
// `user_id` is never read from the body. There is no field for it, `.strict()`
// would refuse one, and the id comes from requireUser().
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { getSupabase } from '@/lib/supabase';
import { createImportFromUrl, type IntakeRejection } from '@/lib/travel/importIntake';
import { MAX_URL_LENGTH } from '@/lib/travel/urlSafety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One field. `.strict()`, so a client sending `userId`, `platform` or `status`
 * is refused rather than quietly ignored — a body that is silently dropped
 * teaches the next developer that the field is supported.
 */
const intakeRequest = z
  .object({
    url: z.string().trim().min(1).max(MAX_URL_LENGTH),
  })
  .strict();

/**
 * What the traveler is told, per refusal. The codes are stable and the client
 * switches on them; the sentences live in the UI, in both languages.
 *
 * `private-host` and `blocked-port` deliberately share the client's
 * "unsupported link" state: distinguishing them would tell whoever is probing
 * exactly which check they tripped.
 */
const REJECTION_STATUS: Record<IntakeRejection, { code: 'BAD_REQUEST' | 'SERVICE_UNAVAILABLE'; message: string }> = {
  empty: { code: 'BAD_REQUEST', message: 'Paste a link to import.' },
  'too-long': { code: 'BAD_REQUEST', message: 'That link is too long.' },
  malformed: { code: 'BAD_REQUEST', message: 'That does not look like a link.' },
  'unsupported-protocol': { code: 'BAD_REQUEST', message: 'We can only take web links.' },
  'credentials-in-url': { code: 'BAD_REQUEST', message: 'We cannot take a link with a username in it.' },
  'blocked-port': { code: 'BAD_REQUEST', message: 'We cannot take that link.' },
  'private-host': { code: 'BAD_REQUEST', message: 'We cannot take that link.' },
  unavailable: { code: 'SERVICE_UNAVAILABLE', message: 'Imports are unavailable right now.' },
};

export const POST = route(
  async (request) => {
    // requireUser first: a signed-out caller gets 401, not the 503 that a
    // missing session client would otherwise produce.
    const user = await requireUser(request);

    if (!getSupabase()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Imports are unavailable right now.');
    }
    const supabase = supabaseFromRequest(request);
    if (!supabase) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Imports are unavailable right now.');
    }

    const parsed = intakeRequest.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      throw new ApiError('BAD_REQUEST', 'Paste a link to import.');
    }

    const result = await createImportFromUrl(supabase, user.id, parsed.data.url);

    if (!result.ok) {
      const { code, message } = REJECTION_STATUS[result.code];
      throw new ApiError(code, message, { reason: result.code });
    }

    return ok({
      importId: result.importId,
      platform: result.platform,
      status: result.status,
      reused: result.reused,
      alreadyQueued: result.alreadyQueued,
    });
  },
  // The same bucket every other travel write uses. It is a per-instance
  // courtesy limit, not a spending cap — the cap is the daily quota counted in
  // the database by assertWithinQuota, which a traveler cannot backdate,
  // delete or mark as a replay (migration 012).
  { rateLimit: 'tripWrite', name: 'travel.imports.create' }
);
