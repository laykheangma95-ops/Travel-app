'use client';

// ─────────────────────────────────────────────────────────────────────────────
// "Save from social" — paste a link, and Domner reads it and shows what it
// found.
//
// PHASE 3 → PHASE 5. Through Phase 4 this screen stopped the moment
// POST /api/imports accepted a link: "we've got your link", full stop —
// nothing had read it yet, so the copy could not honestly say more. Phase 5
// closes that gap by chaining the pipeline that already existed but was never
// wired to a screen: intake → POST /api/imports/:id/process (claim + run the
// connector) → poll GET /api/imports/:id until it leaves 'processing' → the
// same review list and trip picker the synchronous /import pipeline already
// has (components/travel/PlaceImportReview.tsx). "We found the place" is now
// something this screen can honestly say, once it actually has.
//
// STAYS INSIDE /import/link. This is the same route, the same component, an
// in-place state transition — not a second page. Phase 5's plan reasoned that
// a separate page would only earn its keep if something made the in-place
// approach technically impossible, and nothing here does.
//
// NOT ImportPlacesView's own pipeline. That component still runs the
// synchronous /api/travel/extract pipeline for the platforms Domner can read
// today, unchanged. This one goes through the queued job Phase 3/4 built,
// which is what lets Xiaohongshu be recorded even though nothing can read it
// yet (it fails cleanly with `no_connector` once processed, rather than never
// being asked at all).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock3, HelpCircle, Link2, Loader2 } from 'lucide-react';
import { SignInLink } from '@/components/ui/SignInLink';
import { useLang } from '@/lib/i18n';
import { classifyLink, firstUrlIn, PLATFORM_LABEL, type LinkPlatform } from '@/lib/travel/socialLink';
import { AUTO_SELECT_CONFIDENCE, type PlaceCandidate } from '@/lib/travel/placeExtraction';
import { decidePollOutcome, jobFailedReason } from '@/lib/travel/importPollDecision';
import { COPY, type Translate } from './placeImportCopy';
import {
  DoneStage,
  ReviewStage,
  TripSheet,
  suggestedFrom,
  type ImportOutcome,
  type PlaceReviewResult,
  type ReviewRow,
} from './PlaceImportReview';

/** Every refusal POST /api/imports can name, mapped to one sentence each. */
type Refusal = 'invalid' | 'unsupported' | 'rateLimited' | 'unavailable' | 'server';

type Stage =
  | 'idle'
  | 'validating'
  | 'signIn'
  | 'refused'
  | 'working'
  | 'pollTimeout'
  | 'jobFailed'
  | 'needsConfirmation'
  | 'review'
  | 'done';

/** Server rejection codes → which sentence the traveler gets. */
const REFUSAL_FOR: Record<string, Refusal> = {
  empty: 'invalid',
  malformed: 'invalid',
  'too-long': 'invalid',
  'unsupported-protocol': 'unsupported',
  'credentials-in-url': 'unsupported',
  // The server does not distinguish these two to the client on purpose —
  // telling a prober which check they tripped is telling them how to probe.
  'blocked-port': 'unsupported',
  'private-host': 'unsupported',
};

/** How long the client keeps polling before it stops and says so — a little
 *  past POST /api/imports/:id/process's own 60s budget, so a legitimately
 *  slow connector run is not mistaken for one that will never answer. */
const POLL_TIMEOUT_MS = 70_000;
const POLL_INTERVAL_MS = 2_000;

interface JobSnapshotBody {
  status: 'queued' | 'processing' | 'needs_confirmation' | 'completed' | 'failed';
  outcome: 'ok' | 'no-places-found' | 'caption-unavailable' | 'link-unreadable' | null;
  candidateCount: number;
  candidates: PlaceCandidate[];
  preview: PlaceReviewResult['preview'];
  usedModel: boolean;
  errorCode: 'no_connector' | 'connector_error' | 'unsafe_url' | 'stuck_timeout' | null;
  errorMessage: string | null;
}

function toReviewRows(candidates: PlaceCandidate[]): ReviewRow[] {
  return candidates.map((candidate, index) => ({
    ...candidate,
    key: `${index}-${candidate.name}`,
    // A guess arrives un-ticked — the same rule the synchronous pipeline
    // uses, so a place found through either route behaves the same way.
    selected: candidate.confidence >= AUTO_SELECT_CONFIDENCE,
    editing: false,
  }));
}

export function SocialLinkIntake({ initialUrl = '' }: { initialUrl?: string }) {
  const { lang, t: globalT } = useLang();
  const t: Translate = useCallback((key) => COPY[key][lang], [lang]);

  const [url, setUrl] = useState(initialUrl);
  const [stage, setStage] = useState<Stage>('idle');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<LinkPlatform | null>(null);
  const [result, setResult] = useState<PlaceReviewResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobErrorCode, setJobErrorCode] = useState<JobSnapshotBody['errorCode']>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [tripSheetOpen, setTripSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Every poll cycle gets its own token. A stage reset (Send another, retry)
  // bumps it, so a timer scheduled by an earlier cycle finds its token stale
  // and does nothing instead of clobbering a screen the traveler has since
  // moved past.
  const pollToken = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      pollToken.current += 1;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const detected = useMemo(() => {
    const link = firstUrlIn(url);
    return link ? classifyLink(link) : null;
  }, [url]);

  const resetToIdle = useCallback(() => {
    pollToken.current += 1;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setUrl('');
    setStage('idle');
    setRefusal(null);
    setImportId(null);
    setPlatform(null);
    setResult(null);
    setRows([]);
    setError(null);
    setJobErrorCode(null);
    setOutcome(null);
    setTripSheetOpen(false);
  }, []);

  // `jobPlatform` is threaded through as a parameter rather than read from
  // `platform` state: startWorking calls poll() synchronously in the same
  // tick as setPlatform(), and a useCallback closure only sees state as of
  // the render that created it — reading state here would show the PREVIOUS
  // job's platform (or null, on the first import) instead of this one's.
  const poll = useCallback((id: string, token: number, deadline: number, jobPlatform: LinkPlatform) => {
    void (async () => {
      let response: Response | null = null;
      let body: JobSnapshotBody | null = null;
      try {
        response = await fetch(`/api/imports/${id}`, { credentials: 'include' });
        if (response.ok) body = await response.json().catch(() => null);
      } catch {
        // response/body stay null — decidePollOutcome treats that the same
        // as "not settled yet", which is the honest reading of a network
        // blip on a job we cannot currently prove has finished or not.
      }

      if (!live.current || pollToken.current !== token) return;

      if (response?.status === 401) {
        setStage('signIn');
        return;
      }

      const decision = decidePollOutcome(body?.status ?? null, Date.now() >= deadline);

      switch (decision.kind) {
        case 'continue':
          pollTimer.current = setTimeout(() => poll(id, token, deadline, jobPlatform), POLL_INTERVAL_MS);
          return;
        case 'timeout':
          setStage('pollTimeout');
          return;
        case 'failed':
          setJobErrorCode(body?.errorCode ?? null);
          setStage('jobFailed');
          return;
        case 'needsConfirmation':
          setStage('needsConfirmation');
          return;
        case 'review': {
          // decidePollOutcome only returns 'review' when status is
          // 'completed', which only happens when body parsed successfully.
          const completed = body as JobSnapshotBody;
          const reviewResult: PlaceReviewResult = {
            outcome: completed.outcome ?? 'no-places-found',
            platform: jobPlatform,
            preview: completed.preview,
            capabilities: { model: completed.usedModel, geocoding: true },
          };
          setResult(reviewResult);
          setRows(toReviewRows(completed.candidates));
          setStage('review');
          return;
        }
      }
    })();
  }, []);

  const startWorking = useCallback(
    (id: string, initialStatus: string, linkPlatform: LinkPlatform) => {
      pollToken.current += 1;
      const token = pollToken.current;
      setImportId(id);
      setPlatform(linkPlatform);
      setStage('working');

      const deadline = Date.now() + POLL_TIMEOUT_MS;

      void (async () => {
        // A reused (already-completed) job has nothing left to run — polling
        // alone reads it back on the first request. Everything else (a fresh
        // 'queued' job, or one already 'processing'/'needs_confirmation' from
        // an earlier attempt) is worth an attempt to claim and run: calling
        // process on a job that is not 'queued' is a harmless no-op on the
        // server (processImport reports 'already-processing' and changes
        // nothing), so there is no branch to get wrong here.
        if (initialStatus !== 'completed') {
          try {
            const response = await fetch(`/api/imports/${id}/process`, {
              method: 'POST',
              credentials: 'include',
            });
            if (response.status === 401 && live.current && pollToken.current === token) {
              setStage('signIn');
              return;
            }
            // Any other non-OK response (rate limit, quota, a transient
            // failure) is not fatal here — the poll loop below reads the
            // job's real status regardless of whether this request itself
            // succeeded, and reports the truth either way.
          } catch {
            // Same reasoning: network failure calling process() does not mean
            // the job failed. Poll and find out.
          }
        }

        if (!live.current || pollToken.current !== token) return;
        poll(id, token, deadline, linkPlatform);
      })();
    },
    [poll]
  );

  const submit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setStage('validating');
    setRefusal(null);
    try {
      const response = await fetch('/api/imports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      if (!live.current) return;

      if (response.status === 401) {
        setStage('signIn');
        return;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const code = payload?.error?.code;
        const reason = payload?.error?.details?.reason as string | undefined;
        setRefusal(
          code === 'RATE_LIMITED'
            ? 'rateLimited'
            : code === 'SERVICE_UNAVAILABLE'
              ? 'unavailable'
              : (reason && REFUSAL_FOR[reason]) || 'server'
        );
        setStage('refused');
        return;
      }

      const acceptedPlatform = (payload?.platform ?? 'web') as LinkPlatform;
      startWorking(payload.importId as string, payload.status as string, acceptedPlatform);
    } catch {
      if (!live.current) return;
      setRefusal(navigator.onLine === false ? 'unavailable' : 'server');
      setStage('refused');
    }
  }, [url, startWorking]);

  const save = useCallback(
    async (target: { tripId?: string; destination: string; newTrip?: boolean; title?: string }) => {
      const selected = rows.filter((row) => row.selected);
      if (!selected.length) return;
      setSaving(true);
      setError(null);
      try {
        const response = await fetch('/api/travel/places/import', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            places: selected.map((row) => ({
              name: row.name,
              description: row.description,
              category: row.category,
              lat: row.lat,
              lng: row.lng,
            })),
            ...target,
            ...(importId ? { importId } : {}),
          }),
        });
        const body = (await response.json().catch(() => null)) as
          | (ImportOutcome & { error?: { message?: string } })
          | null;
        if (!response.ok || !body?.tripId) throw new Error(body?.error?.message ?? '');
        setOutcome(body);
        setTripSheetOpen(false);
        setStage('done');
      } catch (caught) {
        setError(
          caught instanceof Error && caught.message
            ? caught.message
            : lang === 'km'
              ? 'មិនអាចរក្សាទុកបានទេ។ សូមព្យាយាមម្តងទៀត។'
              : 'We could not save those. Please try again.'
        );
      } finally {
        setSaving(false);
      }
    },
    [rows, importId, lang]
  );

  const selected = rows.filter((row) => row.selected);

  if (stage === 'signIn') {
    return (
      <div className="night-card rounded-card p-5">
        <h2 className="font-display text-lg text-white">{globalT('intake.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/65">{globalT('intake.signInHint')}</p>
        <SignInLink
          returnTo="/import/link"
          className="liquid-glass-accent liquid-press mt-4 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep"
        >
          {globalT('intake.signIn')}
        </SignInLink>
      </div>
    );
  }

  if (stage === 'working') {
    return (
      <div className="night-card rounded-card p-5 text-center" role="status" aria-live="polite">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-gold-light/25 bg-gold-light/10 text-gold-light motion-safe:animate-pulse">
          <Loader2 size={22} aria-hidden="true" className="motion-safe:animate-spin" />
        </span>
        <h2 className="mt-4 font-display text-lg text-white">{globalT('intake.processing')}</h2>
        {platform && (
          <p className="mt-1 text-sm text-white/55">{PLATFORM_LABEL[platform][lang]}</p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-white/45">{globalT('intake.processingHint')}</p>
      </div>
    );
  }

  if (stage === 'pollTimeout') {
    return (
      <div className="night-card rounded-card p-5 text-center" role="status">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.06] text-white/60">
          <Clock3 size={20} aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm leading-relaxed text-white/70">{globalT('intake.pollTimeout')}</p>
        <button
          type="button"
          className="v3-save mt-4"
          onClick={() => {
            if (!importId || !platform) return;
            const token = pollToken.current;
            poll(importId, token, Date.now() + POLL_TIMEOUT_MS, platform);
            setStage('working');
          }}
        >
          {globalT('intake.checkAgain')}
        </button>
      </div>
    );
  }

  if (stage === 'jobFailed') {
    const reason = jobFailedReason(jobErrorCode);
    const title =
      reason === 'generic'
        ? globalT('intake.jobFailed')
        : globalT(`intake.jobFailed.${reason}` as Parameters<typeof globalT>[0]);
    const hint =
      reason === 'generic'
        ? globalT('intake.jobFailedHint')
        : globalT(`intake.jobFailedHint.${reason}` as Parameters<typeof globalT>[0]);
    return (
      <div className="night-card rounded-card p-5 text-center" role="alert">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.06] text-white/60">
          <AlertTriangle size={20} aria-hidden="true" />
        </span>
        <h2 className="mt-3 font-display text-lg text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{hint}</p>
        <button type="button" className="v3-save mt-4" onClick={resetToIdle}>
          {t('tryAgain')}
        </button>
      </div>
    );
  }

  if (stage === 'needsConfirmation') {
    return (
      <div className="night-card rounded-card p-5 text-center" role="status">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.06] text-white/60">
          <HelpCircle size={20} aria-hidden="true" />
        </span>
        <h2 className="mt-3 font-display text-lg text-white">{globalT('intake.needsConfirmation')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{globalT('intake.needsConfirmationHint')}</p>
        <button type="button" className="v3-save mt-4" onClick={resetToIdle}>
          {t('tryAgain')}
        </button>
      </div>
    );
  }

  if (stage === 'review' && result) {
    return (
      <>
        <ReviewStage
          lang={lang}
          t={t}
          result={result}
          rows={rows}
          setRows={setRows}
          error={error}
          onRetry={resetToIdle}
        />

        {selected.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-primary-deep/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setTripSheetOpen(true)}
              className="liquid-glass-accent liquid-press mx-auto flex min-h-[3.25rem] w-full max-w-2xl items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {t('addToPlan')} · {selected.length}
            </button>
          </div>
        )}

        {tripSheetOpen && (
          <TripSheet
            lang={lang}
            t={t}
            suggestedDestination={suggestedFrom(rows)}
            count={selected.length}
            saving={saving}
            error={error}
            onClose={() => setTripSheetOpen(false)}
            onChoose={save}
            initialTripId={null}
          />
        )}
      </>
    );
  }

  if (stage === 'done' && outcome) {
    return <DoneStage lang={lang} t={t} outcome={outcome} onAgain={resetToIdle} />;
  }

  const busy = stage === 'validating';

  return (
    <div className="night-card rounded-card p-5">
      <h2 className="font-display text-lg text-white">{globalT('intake.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-white/60">{globalT('intake.subtitle')}</p>

      <label htmlFor="intake-url" className="sr-only">
        {globalT('intake.placeholder')}
      </label>
      <input
        id="intake-url"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        className="mt-4 w-full rounded-btn border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        placeholder={globalT('intake.placeholder')}
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
          if (stage === 'refused') setStage('idle');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        disabled={busy}
      />

      {detected && (
        <p className="mt-2 text-xs text-white/50" aria-live="polite">
          {PLATFORM_LABEL[detected.platform]?.en}
        </p>
      )}

      <p className="v3-save-row">
        <button
          type="button"
          className="v3-save"
          onClick={() => void submit()}
          disabled={busy || !url.trim()}
        >
          {busy ? (
            <Loader2 size={15} aria-hidden="true" className="v3-save-spin" />
          ) : (
            <Link2 size={15} aria-hidden="true" />
          )}
          {busy ? globalT('intake.working') : globalT('intake.action')}
        </button>
      </p>

      {stage === 'refused' && refusal && (
        <p className="v3-save-error" role="alert">
          {globalT(`intake.error.${refusal}` as Parameters<typeof globalT>[0])}
        </p>
      )}
    </div>
  );
}
