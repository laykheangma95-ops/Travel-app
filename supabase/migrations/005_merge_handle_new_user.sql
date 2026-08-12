-- ─────────────────────────────────────────────────────────────────────────────
-- Merge the two competing handle_new_user() definitions into one.
--
-- 0001_order_integrity_and_roles.sql and 001_auth_methods.sql both defined
-- public.handle_new_user(). Applied in filename order, "0001" sorts before
-- "001", so the auth version replaced the orders version and the guest-order
-- claim was silently lost: a customer who bought as a guest and then created
-- an account never saw that order in their dashboard.
--
-- This definition does both jobs. It is CREATE OR REPLACE only — the existing
-- trigger on auth.users keeps pointing at the same function, so nothing is
-- dropped and no data is touched.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- From 001_auth_methods.sql: the full profile row.
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

  -- From 0001_order_integrity_and_roles.sql: claim orders bought as a guest
  -- under this email, so they appear in the new account's dashboard.
  UPDATE public.esim_orders
     SET user_id = NEW.id
   WHERE user_id IS NULL
     AND LOWER(customer_email) = LOWER(NEW.email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates the profile row on signup and claims matching guest orders. '
  'Supersedes the two conflicting definitions in 0001 and 001.';
