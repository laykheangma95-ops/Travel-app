-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0001 — order integrity, admin roles, share-link lockdown
--
-- Apply to a project already running the v1 schema. Idempotent: safe to re-run.
-- A fresh project should run supabase/schema.sql instead.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Profiles: email + role ───────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('customer', 'support', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill emails from auth.users so guest-order claiming works.
UPDATE profiles p
   SET email = LOWER(u.email)
  FROM auth.users u
 WHERE u.id = p.id AND p.email IS DISTINCT FROM LOWER(u.email);

-- ── Orders: money breakdown, fulfilment, idempotency ─────────────────────────

ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS subtotal_usd DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS discount_usd DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS discount_code TEXT;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS esim_iccid TEXT;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS esim_activation_code TEXT;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS provider_name TEXT;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS provider_order_id TEXT;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE esim_orders ADD CONSTRAINT esim_orders_idempotency_key_key UNIQUE (idempotency_key);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

UPDATE esim_orders SET subtotal_usd = price_usd WHERE subtotal_usd = 0;

-- ── New tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES esim_orders(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  country_slug TEXT NOT NULL,
  country_name TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  tier TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  data_gb_daily DECIMAL NOT NULL,
  unit_price_usd DECIMAL(10, 2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_usd DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES esim_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_flights ADD COLUMN IF NOT EXISTS guest_email TEXT;
ALTER TABLE flight_shares ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE affiliate_events ADD COLUMN IF NOT EXISTS ip_hash TEXT;

-- ── Helper functions ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT AS $$
  SELECT LOWER(NULLIF(auth.jwt() ->> 'email', ''));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.get_flight_share(token TEXT)
RETURNS TABLE (flight_number TEXT, flight_date DATE, departure_airport TEXT, arrival_airport TEXT)
AS $$
  UPDATE public.flight_shares
     SET views = views + 1
   WHERE share_token = token
     AND (expires_at IS NULL OR expires_at > NOW());

  SELECT sf.flight_number, sf.flight_date, sf.departure_airport, sf.arrival_airport
    FROM public.flight_shares fs
    JOIN public.saved_flights sf ON sf.id = fs.saved_flight_id
   WHERE fs.share_token = token
     AND (fs.expires_at IS NULL OR fs.expires_at > NOW());
$$ LANGUAGE sql SECURITY DEFINER VOLATILE SET search_path = public;

-- Atomic click counter — replaces the application-side read-then-write that
-- lost counts whenever two clicks overlapped.
CREATE OR REPLACE FUNCTION public.increment_affiliate_clicks(affiliate_id UUID)
RETURNS VOID AS $$
  UPDATE public.affiliates
     SET total_clicks = total_clicks + 1
   WHERE id = affiliate_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.increment_affiliate_clicks(UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS esim_orders_touch ON esim_orders;
CREATE TRIGGER esim_orders_touch
  BEFORE UPDATE ON esim_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS profiles_touch ON profiles;
CREATE TRIGGER profiles_touch
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'role can only be changed by an admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profiles_no_role_escalation ON profiles;
CREATE TRIGGER profiles_no_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- Signup now records the email and claims matching guest orders.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', LOWER(NEW.email))
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.esim_orders
     SET user_id = NEW.id
   WHERE user_id IS NULL
     AND LOWER(customer_email) = LOWER(NEW.email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- Replace the blanket share read that exposed every token in the table.
DROP POLICY IF EXISTS "shares_public_read" ON flight_shares;
DROP POLICY IF EXISTS "shares_owner_manage" ON flight_shares;
CREATE POLICY "shares_owner_manage" ON flight_shares FOR ALL USING (
  EXISTS (
    SELECT 1 FROM saved_flights sf
    WHERE sf.id = flight_shares.saved_flight_id AND sf.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "orders_select_own" ON esim_orders;
CREATE POLICY "orders_select_own" ON esim_orders FOR SELECT USING (
  auth.uid() = user_id
  OR (user_id IS NULL AND LOWER(customer_email) = public.current_user_email())
  OR public.is_admin()
);

DROP POLICY IF EXISTS "order_items_select_own" ON order_items;
CREATE POLICY "order_items_select_own" ON order_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM esim_orders o
    WHERE o.id = order_items.order_id
      AND (
        auth.uid() = o.user_id
        OR (o.user_id IS NULL AND LOWER(o.customer_email) = public.current_user_email())
        OR public.is_admin()
      )
  )
);

DROP POLICY IF EXISTS "order_events_admin_read" ON order_events;
CREATE POLICY "order_events_admin_read" ON order_events FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "affiliates_select_own" ON affiliates;
CREATE POLICY "affiliates_select_own" ON affiliates FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "affiliates_insert_own" ON affiliates;
CREATE POLICY "affiliates_insert_own" ON affiliates FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "affiliates_admin_write" ON affiliates;
CREATE POLICY "affiliates_admin_write" ON affiliates FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "affiliate_events_admin" ON affiliate_events;
CREATE POLICY "affiliate_events_admin" ON affiliate_events FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "flights_admin" ON saved_flights;
CREATE POLICY "flights_admin" ON saved_flights FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "tickets_admin" ON support_tickets;
CREATE POLICY "tickets_admin" ON support_tickets FOR SELECT USING (public.is_admin());

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_user           ON esim_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email          ON esim_orders(LOWER(customer_email));
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment ON esim_orders(stripe_payment_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order     ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order    ON order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_flights_user    ON saved_flights(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code       ON affiliates(referral_code);

COMMIT;

-- After applying, promote yourself:
--   UPDATE profiles SET role = 'admin' WHERE email = 'you@domnerapp.com';
