-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005 — one handle_new_user(), not two
--
-- Apply after 004. Idempotent: safe to re-run.
--
-- THE CONFLICT THIS RESOLVES:
--   public.handle_new_user() was defined twice, in two different migrations,
--   both with CREATE OR REPLACE:
--
--     0001_order_integrity_and_roles.sql  — writes (id, full_name, email) and
--                                           claims matching guest orders
--     001_auth_methods.sql                — writes the full profile including
--                                           verification and auth_providers,
--                                           and claims nothing
--
--   Postgres has no opinion here: the last one applied wins, silently. And
--   "0001_" sorts BEFORE "001_" lexicographically ('0' < '1' at the third
--   character), so on every ordered run it is 001_auth_methods that lands
--   last. The guest-order claim from 0001 is overwritten and lost.
--
--   Neither migration is wrong. Nothing errors. The database simply ends up
--   with the half of the behaviour that was written first.
--
-- WHAT BREAKS WITHOUT THIS:
--   Someone buys an eSIM as a guest, then creates an account with the same
--   email address. Their order still carries user_id = NULL, so the RLS policy
--   "orders_select_own" matches it only on the email fallback, and "My eSIMs"
--   shows nothing they can act on. That orphaned-order bug is exactly what
--   0001 was written to fix, and 001 undid it without either author noticing.
--
-- THE FIX:
--   Define the function once, as the union of both: the full profile insert
--   from 001, then the guest-order claim from 0001. This migration is the only
--   definition that runs after both, so it is the one that stands.
--
--   The earlier definitions are deliberately left in place. They have already
--   been applied to the live database and rewriting applied migration files
--   would put the file history out of step with what the database actually
--   ran. Later-wins is a property of the ordering, so the correction belongs
--   in a later file.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- The full profile, from 001_auth_methods.sql.
  INSERT INTO public.profiles (
    id, full_name, email, phone, passport_country, preferred_language,
    email_verified_at, phone_verified_at, auth_providers
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    LOWER(NEW.email),
    COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone'),
    COALESCE(NEW.raw_user_meta_data->>'passport_country', 'KH'),
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'km'),
    NEW.email_confirmed_at,
    NEW.phone_confirmed_at,
    CASE
      WHEN NEW.raw_app_meta_data->>'provider' IS NOT NULL
        THEN ARRAY[NEW.raw_app_meta_data->>'provider']
      ELSE ARRAY[]::TEXT[]
    END
  )
  ON CONFLICT (id) DO NOTHING;

  -- The guest-order claim, from 0001_order_integrity_and_roles.sql.
  -- Matched on email only, and only for orders nobody owns yet, so signing up
  -- can never take an order away from an account that already holds it.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.esim_orders
       SET user_id = NEW.id
     WHERE user_id IS NULL
       AND LOWER(customer_email) = LOWER(NEW.email);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 001_auth_methods.sql dropped `SET search_path` when it redefined the
-- function. A SECURITY DEFINER function without a pinned search_path can be
-- steered by the caller's search_path, so it is restored above and asserted
-- here rather than left to inspection.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'handle_new_user'
      AND pronamespace = 'public'::regnamespace
      AND 'search_path=public' = ANY(proconfig)
  ) THEN
    RAISE EXCEPTION 'handle_new_user() must pin search_path (SECURITY DEFINER)';
  END IF;
END $$;

-- Back-fill the orders that were orphaned while the claim was missing. Same
-- match rule as the trigger: unowned orders only, email equality only.
UPDATE public.esim_orders o
   SET user_id = u.id
  FROM auth.users u
 WHERE o.user_id IS NULL
   AND o.customer_email IS NOT NULL
   AND LOWER(o.customer_email) = LOWER(u.email);

COMMIT;
