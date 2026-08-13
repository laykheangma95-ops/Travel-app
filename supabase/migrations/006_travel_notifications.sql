-- ═══════════════════════════════════════════════════════════════════════════
-- 006 — Travel OS notifications
--
-- Adds the storage the Domner Inbox, the notification priority engine and web
-- push need. Additive only: no table is dropped, no column is removed, and the
-- one existing table touched here (push_subscriptions) keeps every row and
-- every column it already had.
--
-- WHY push_subscriptions IS EXTENDED RATHER THAN REPLACED:
--   It already holds Firebase Cloud Messaging tokens for the flight-alert job.
--   The W3C Push API gives a browser an *endpoint URL* plus two keys instead of
--   a single token, so the row shape differs — but it is the same concept (one
--   device that agreed to hear from us) and splitting it in two would mean
--   every send path has to remember to check both tables. One table, one
--   `provider` column, one place to unsubscribe.
--
--   fcm_token loses its NOT NULL because a web-push row has no FCM token. The
--   new CHECK keeps the table honest: a row must carry one credential or the
--   other, never neither.
--
-- Apply after 005_restore_guest_order_claim.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Push subscriptions: make room for the standard Web Push API ───────────

ALTER TABLE push_subscriptions
  ALTER COLUMN fcm_token DROP NOT NULL;

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'fcm'
    CHECK (provider IN ('fcm', 'webpush')),
  -- The Push API subscription. `endpoint` is the per-device URL the push
  -- service hands out; p256dh and auth are the client's public key and shared
  -- secret used to encrypt the payload. None of the three is a bearer
  -- credential for anything except delivering a notification to that device.
  ADD COLUMN IF NOT EXISTS endpoint TEXT,
  ADD COLUMN IF NOT EXISTS p256dh TEXT,
  ADD COLUMN IF NOT EXISTS auth_secret TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS lang TEXT CHECK (lang IS NULL OR lang IN ('km', 'en')),
  -- A push service returns 404/410 when a subscription dies (app uninstalled,
  -- browser data cleared). Recording that lets the sender stop retrying without
  -- deleting history mid-send.
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing rows predate `provider`; they are all FCM by definition.
UPDATE push_subscriptions SET provider = 'fcm' WHERE provider IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_credential_present'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_credential_present
      CHECK (
        (provider = 'fcm'     AND fcm_token IS NOT NULL) OR
        (provider = 'webpush' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth_secret IS NOT NULL)
      );
  END IF;
END $$;

-- One row per device. The endpoint is the device's identity for web push, the
-- same way fcm_token already is for FCM.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_endpoint
  ON push_subscriptions (endpoint) WHERE endpoint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_user_active
  ON push_subscriptions (user_id) WHERE is_active;

DROP TRIGGER IF EXISTS push_subscriptions_touch ON push_subscriptions;
CREATE TRIGGER push_subscriptions_touch
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 2. Notification preferences ──────────────────────────────────────────────
--
-- One row per traveler, created on first visit to YOU → Notifications. Every
-- category is individually controllable (§11 of the product brief) and the
-- defaults are deliberately conservative: the two categories that can annoy —
-- discovery and local information — start OFF. A traveler has to ask for
-- marketing; they should never have to ask us to stop.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Master switch. FALSE silences push entirely without losing the per-category
  -- choices underneath, so turning push back on restores what they picked.
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Flights
  flight_gate_changes BOOLEAN NOT NULL DEFAULT TRUE,
  flight_delays       BOOLEAN NOT NULL DEFAULT TRUE,
  flight_boarding     BOOLEAN NOT NULL DEFAULT TRUE,
  flight_check_in     BOOLEAN NOT NULL DEFAULT TRUE,

  -- Trips
  trip_reminders      BOOLEAN NOT NULL DEFAULT TRUE,
  trip_itinerary      BOOLEAN NOT NULL DEFAULT TRUE,
  trip_hotel          BOOLEAN NOT NULL DEFAULT TRUE,

  -- eSIM
  esim_activation     BOOLEAN NOT NULL DEFAULT TRUE,
  esim_data_usage     BOOLEAN NOT NULL DEFAULT TRUE,
  esim_low_data       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Travel context
  travel_weather      BOOLEAN NOT NULL DEFAULT TRUE,
  travel_local_info   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Discovery
  discover_deals        BOOLEAN NOT NULL DEFAULT FALSE,
  discover_destinations BOOLEAN NOT NULL DEFAULT FALSE,
  discover_suggestions  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Local hours during which levels 3 and 4 are held back. Level 1 (a gate
  -- change while you are asleep in a transit hotel) always goes through —
  -- that is the whole point of a critical notification.
  quiet_hours_start SMALLINT CHECK (quiet_hours_start IS NULL OR quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end   SMALLINT CHECK (quiet_hours_end   IS NULL OR quiet_hours_end   BETWEEN 0 AND 23),
  timezone TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS notification_preferences_touch ON notification_preferences;
CREATE TRIGGER notification_preferences_touch
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 3. The inbox ─────────────────────────────────────────────────────────────
--
-- Every notification the traveler could see, whether or not a push went out.
-- The inbox is the record; push is one delivery channel for it. That ordering
-- matters: a traveler who denied browser permission, or who is on iOS Safari
-- without the app installed, still sees their gate change in Domner Updates.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Matches lib/notifications/catalog.ts. Kept as TEXT with a CHECK rather than
  -- an enum so adding a kind is a one-line migration, not an enum rewrite.
  category TEXT NOT NULL CHECK (category IN ('flights', 'trips', 'esim', 'travel', 'discover', 'account')),
  kind TEXT NOT NULL,

  -- 1 critical · 2 important · 3 useful · 4 discovery. Drives whether we push
  -- immediately, bundle, or only ever show it in the inbox.
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),

  title TEXT NOT NULL,
  body TEXT,
  -- Where tapping it lands. Never '/' — a notification that opens the homepage
  -- has thrown away the context that made it worth sending.
  deep_link TEXT NOT NULL,

  -- What this is about, so the inbox can group and the UI can render the right
  -- capsule. entity_id is deliberately TEXT: a flight number is not a UUID.
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- The anti-spam key. "SQ123 gate change to B12" produces the same dedupe_key
  -- however many times the poller sees it, and the unique index below turns a
  -- duplicate into a no-op instead of a second buzz in someone's pocket.
  dedupe_key TEXT,

  read_at TIMESTAMPTZ,
  -- Push delivery state. NULL pushed_at + push_attempts > 0 means we tried and
  -- could not reach any device.
  pushed_at TIMESTAMPTZ,
  push_attempts SMALLINT NOT NULL DEFAULT 0,
  push_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Time-critical notifications stop being useful. An expired boarding call is
  -- noise in the inbox a week later.
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_inbox
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id) WHERE read_at IS NULL;

-- ── 4. RLS — default deny, own rows only ─────────────────────────────────────

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_own" ON notification_preferences;
CREATE POLICY "notif_prefs_own" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Read your own inbox. There is deliberately no INSERT policy: notifications
-- are written by the server (service role) from the priority engine. A browser
-- that could insert here could forge a "your flight is cancelled" card.
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Marking as read is the only client-side write. USING and WITH CHECK both pin
-- user_id so a row can never be moved to another account.
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- push_subscriptions already carries "push_all_own" from the base schema, which
-- covers the new columns. Left as it is.
