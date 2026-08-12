-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004 — staff accounts and roles
--
-- Apply after 003. Idempotent: safe to re-run.
--
-- WHY:
--   Admin access was a single env allowlist: your email was in ADMIN_EMAIL or
--   it was not, and being in it meant everything — reading every customer's
--   contact details, spending supplier money, exporting the sales statement.
--   That is fine for one founder and wrong the moment a second person needs a
--   login. A call-centre agent needs to look up the customer who is on the
--   phone. They do not need the revenue report, and they must not be able to
--   page through the customer list.
--
--   So authority moves into a table, with a role per person.
--
-- ADMIN_EMAIL DOES NOT GO AWAY. It stays as break-glass owner access that
-- works even if this table is empty, misconfigured, or someone removes their
-- own admin row by mistake. A permission system you can lock yourself out of
-- is one you will end up disabling in a hurry at the worst moment.
--
-- ROLES, ordered by blast radius:
--   viewer   — read the dashboard. A new hire's starting point.
--   support  — call centre: look up one customer at a time. No list, no export.
--   ops      — fulfilment: browse orders, mark fulfilled, configure suppliers.
--   finance  — the sales statement and exports. No customer contact data.
--   admin    — everything, including managing staff.
--
--   support and finance are deliberately NOT on one ladder. A bookkeeper needs
--   money and no customers; an agent needs customers and no money. Ranking
--   them would force one of them to hold access they should not have.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Staff ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Set once the invited person signs up. NULL means invited but not yet
  -- joined, which is why email carries the invitation rather than user_id.
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,

  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('viewer', 'support', 'ops', 'finance', 'admin')),

  -- Revoking access is a flag, not a delete: the audit trail must keep
  -- pointing at a real row after someone leaves.
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Mirrors whether the account has enrolled a second factor. Enforcement is
  -- controlled by STAFF_REQUIRE_MFA so it can be switched on once everyone has
  -- enrolled, instead of locking the team out the day it ships.
  mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE,

  invited_by TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE staff_users IS
  'Who may use /admin and with what authority. No row means no access. '
  'ADMIN_EMAIL remains a break-glass override for the owner.';

CREATE INDEX IF NOT EXISTS idx_staff_email ON staff_users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_staff_user  ON staff_users(user_id);

-- Emails are matched case-insensitively everywhere; store them folded so the
-- unique constraint means what it looks like it means.
CREATE OR REPLACE FUNCTION public.staff_normalise_email()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email = LOWER(TRIM(NEW.email));
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staff_users_normalise ON staff_users;
CREATE TRIGGER staff_users_normalise
  BEFORE INSERT OR UPDATE ON staff_users
  FOR EACH ROW EXECUTE FUNCTION public.staff_normalise_email();

-- ── Audit ────────────────────────────────────────────────────────────────────
--
-- Append-only. Who granted whom what, and when. Changing someone's authority
-- is exactly the kind of act that needs to be reconstructable afterwards.

CREATE TABLE IF NOT EXISTS staff_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_role TEXT,
  to_role TEXT,
  actor TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_events_email
  ON staff_events(staff_email, created_at DESC);

-- ── Linking a signup to its invitation ───────────────────────────────────────
--
-- Staff are invited by email before they have an account. When they sign up,
-- attach the auth user to the waiting row.

CREATE OR REPLACE FUNCTION public.link_staff_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.staff_users
     SET user_id = NEW.id, updated_at = NOW()
   WHERE user_id IS NULL
     AND email = LOWER(NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_link_staff ON auth.users;
CREATE TRIGGER on_auth_user_created_link_staff
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_staff_on_signup();

-- Attach any already-registered users to rows created for them.
UPDATE staff_users s
   SET user_id = u.id
  FROM auth.users u
 WHERE s.user_id IS NULL AND LOWER(u.email) = s.email;

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- One narrow read: a signed-in user may read THEIR OWN staff row, and nothing
-- else. That is what lets middleware.ts decide whether to serve /admin using
-- only the caller's own session — no service key at the edge.
--
-- Listing all staff, and every write, stays service-role only and goes through
-- /api/admin/staff, which checks the staff.manage permission. There is
-- deliberately no policy granting a broader SELECT: an agent should not be
-- able to enumerate their colleagues, their roles, or their email addresses.

ALTER TABLE staff_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_own" ON staff_users;
CREATE POLICY "staff_read_own" ON staff_users
  FOR SELECT USING (auth.uid() = user_id);

-- staff_events has RLS enabled and NO policy at all: service role only.

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Seeding your first admin. ADMIN_EMAIL already grants you access, so this is
-- only needed to give someone else authority:
--
--   INSERT INTO staff_users (email, full_name, role, invited_by)
--   VALUES ('agent@domnerapp.com', 'Call centre', 'support', 'owner')
--   ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, is_active = TRUE;
--
-- Or use /admin/staff, which writes the audit row for you.
-- ═══════════════════════════════════════════════════════════════════════════
