-- Phase 4: a finished import stays finished.
--
-- WHAT WAS WRONG:
--   Phase 4 gave `place_imports.status` a price. `queued` became a claim on a
--   connector run and, where ANTHROPIC_API_KEY is set, on a model call. But
--   nothing stopped a traveler from writing that value themselves.
--
--   The Phase 4 review proved the attack against real policies: submit one
--   link (one quota unit), let it complete, then send a plain PostgREST
--   request with the anon key —
--
--     PATCH /rest/v1/place_imports?id=eq.<their own job>
--     { "status": "queued" }
--
--   — and process it again. Six model runs came out of one quota-counted row,
--   and the loop has no bound. The guard in 012 pins `user_id`, `created_at`
--   and `url_hash` on UPDATE; it never pinned `status`, because before Phase 4
--   `status` cost nothing and `queued` was inert.
--
--   This is the same shape as the four quota attacks 012's own header
--   enumerates, and its reasoning applies unchanged: a traveler holds the anon
--   key and can call PostgREST directly, so "our code never does that" is not
--   a control. The row has to be harder to lie to than the application is.
--
-- THE RULE: A TERMINAL STATUS IS ABSORBING.
--   Once a row reads `completed`, `failed` (or the deprecated `ready`), its
--   status may never change again — not to an open state, not to another
--   terminal one. Monotonicity, enforced by the database for every caller.
--
--   That single rule closes two separate findings:
--
--   BLOCKER 1 — the rewind above is refused, so a job can be claimed
--   (`queued` → `processing`) exactly once in its life. Model runs are then
--   bounded by the number of job rows, which is what the quota counts.
--
--   MEDIUM 1 — the reaper races an in-flight job, marks it `failed`, and the
--   connector then finishes and writes `completed`. The review reproduced the
--   result: a row reading `completed` while still carrying
--   `error_code = 'stuck_timeout'` and a cancellation message. Terminal now
--   means terminal, so the late completion is refused rather than resurrecting
--   a reaped job.
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   Exempt the service role. Nothing in Domner legitimately rewinds a finished
--   import — the reaper only moves `processing` → `failed`, and a traveler who
--   wants a link read again submits it again, which correctly costs an
--   allowance. A rule with no exception cannot be bypassed by a leaked service
--   key, and matches how 012 pins its columns for every caller. Operational
--   surgery on a stuck row remains possible the way any trigger is bypassed —
--   ALTER TABLE place_imports DISABLE TRIGGER place_imports_guard_trg — which
--   is deliberate, auditable, and not something an API call can reach.
--
-- EVERY OTHER TRANSITION THE APPLICATION MAKES IS UNAFFECTED:
--   queued      → processing   (importOrchestrator claim)      open → open
--   processing  → completed    (completeImport)                open → terminal
--   processing  → failed       (failImport / reaper)           open → terminal
--   INSERT of a replay row directly as `completed`             not an UPDATE
--   an UPDATE that leaves `status` untouched                   always allowed
--
-- This file only REPLACES the guard function. It adds no column, no index and
-- no policy, so a fresh database and an upgraded one converge on exactly the
-- same definition, and re-applying it is a no-op.

CREATE OR REPLACE FUNCTION public.place_imports_guard() RETURNS TRIGGER AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW();
  ELSE
    NEW.user_id    := OLD.user_id;
    NEW.created_at := OLD.created_at;
    NEW.url_hash   := OLD.url_hash;

    -- ── Phase 4: terminal is absorbing. ───────────────────────────────────
    IF OLD.status IN ('completed', 'failed', 'ready')
       AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'an import that has finished cannot change status again'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.reused_from_import_id IS NOT NULL THEN
    IF NEW.url_hash IS NULL THEN
      RAISE EXCEPTION 'an import with no link cannot be a replay'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM place_imports source
      WHERE source.id       = NEW.reused_from_import_id
        AND source.id      <> NEW.id
        AND source.user_id  = NEW.user_id
        AND source.url_hash = NEW.url_hash
        AND source.status  IN ('completed','ready')
    ) THEN
      RAISE EXCEPTION 'a replay must name a completed import of the same link by the same traveler'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Re-asserted rather than assumed. 012 created this trigger and nothing has
-- dropped it, but a guard function with no trigger attached is a silent no-op
-- — the exact failure mode that would make every test above pass while the
-- rule enforced nothing.
DROP TRIGGER IF EXISTS place_imports_guard_trg ON place_imports;
CREATE TRIGGER place_imports_guard_trg
  BEFORE INSERT OR UPDATE ON place_imports
  FOR EACH ROW EXECUTE FUNCTION public.place_imports_guard();
