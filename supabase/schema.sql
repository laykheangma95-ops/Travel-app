-- ═══════════════════════════════════════════════════════════════════════════
-- Domner App — canonical Supabase schema (v2)
--
-- Run in the Supabase SQL editor on a fresh project. For an existing project,
-- apply supabase/migrations/ in order instead — this file will conflict.
--
-- Design rules enforced here:
--   1. Every order carries its line items, its money breakdown, and (when the
--      buyer was signed in) a user_id. An order with no owner is unreadable by
--      any customer, which is what made "My eSIMs" permanently empty before.
--   2. Admin is a database role (profiles.role), not an env-var comparison.
--   3. No table is blanket-readable. Public share links go through a
--      SECURITY DEFINER function that takes the token, so nobody can list every
--      token in the table.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  passport_country TEXT DEFAULT 'KH',
  preferred_language TEXT DEFAULT 'km' CHECK (preferred_language IN ('km', 'en')),
  telegram_username TEXT,
  avatar_url TEXT,
  -- 'customer' | 'support' | 'admin'. Authorization reads this, never an env var.
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'support', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Orders ───────────────────────────────────────────────────────────────────

CREATE TABLE esim_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  order_number TEXT UNIQUE NOT NULL,

  -- Denormalized summaries for list views and emails.
  country TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  data_gb_daily DECIMAL NOT NULL,

  -- Money. Every figure is computed server-side in lib/pricing.ts.
  subtotal_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
  price_usd DECIMAL(10, 2) NOT NULL,
  -- What the supplier charged us. NULL means unknown — the sales report counts
  -- those orders separately rather than inventing a margin for them.
  cost_usd DECIMAL(10, 2) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  discount_code TEXT,
  referral_code TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')),

  -- Fulfilment. provider_* fields are filled by the eSIM supplier integration.
  qr_code_url TEXT,
  esim_iccid TEXT,
  esim_activation_code TEXT,
  provider_name TEXT,
  provider_order_id TEXT,

  payment_method TEXT CHECK (payment_method IN ('stripe', 'aba')),
  stripe_payment_id TEXT,
  aba_payment_id TEXT,

  -- Guards a double-submitted checkout from creating two orders and two charges.
  idempotency_key TEXT UNIQUE,

  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  device_type TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ
);

-- One row per plan in the order. Without this an order is an unauditable string.
CREATE TABLE order_items (
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

-- Append-only audit trail. Every status change, who or what caused it.
CREATE TABLE order_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES esim_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Flights ──────────────────────────────────────────────────────────────────

CREATE TABLE saved_flights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  -- Lets a signed-out traveler still register alerts, claimed on sign-up.
  guest_email TEXT,
  flight_number TEXT NOT NULL,
  flight_date DATE NOT NULL,
  departure_airport TEXT,
  arrival_airport TEXT,
  notify_gate_change BOOLEAN DEFAULT TRUE,
  notify_delay BOOLEAN DEFAULT TRUE,
  notify_boarding BOOLEAN DEFAULT TRUE,
  notify_landing BOOLEAN DEFAULT TRUE,
  share_token TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, flight_number, flight_date)
);

CREATE TABLE flight_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  saved_flight_id UUID REFERENCES saved_flights(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,
  views INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trips ────────────────────────────────────────────────────────────────────

CREATE TABLE trip_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  travelers INTEGER DEFAULT 1,
  budget TEXT,
  interests TEXT[],
  generated_itinerary JSONB,
  cover_image_url TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  share_token TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trip_checklist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID REFERENCES trip_plans(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  item TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  is_required BOOLEAN DEFAULT TRUE,
  due_before_hours INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trip_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID REFERENCES trip_plans(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url TEXT,
  caption TEXT,
  location TEXT,
  taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Notifications ────────────────────────────────────────────────────────────

CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  device_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Affiliates ───────────────────────────────────────────────────────────────

CREATE TABLE affiliates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  telegram TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  commission_rate DECIMAL DEFAULT 0.30,
  total_clicks INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_earned_usd DECIMAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE affiliate_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID REFERENCES affiliates(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('click', 'signup', 'order')),
  order_id UUID REFERENCES esim_orders(id) ON DELETE SET NULL,
  commission_usd DECIMAL,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Support ──────────────────────────────────────────────────────────────────

CREATE TABLE support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  order_id UUID REFERENCES esim_orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper functions
-- ═══════════════════════════════════════════════════════════════════════════

-- Authorization predicate used by every admin policy. SECURITY DEFINER so it
-- can read profiles without tripping the profiles policies (which would
-- otherwise recurse).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- The signed-in user's email, used to attach guest orders placed before signup.
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT AS $$
  SELECT LOWER(NULLIF(auth.jwt() ->> 'email', ''));
$$ LANGUAGE sql STABLE;

-- Public share lookup. The table itself is NOT readable by anon — callers must
-- present a token, so nobody can enumerate every share link.
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

-- Atomic click counter. A read-then-write from the application loses counts
-- whenever two clicks overlap, which under-reports affiliate commission.
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

CREATE TRIGGER esim_orders_touch
  BEFORE UPDATE ON esim_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER profiles_touch
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create a profile on signup, carrying the email so guest orders can be
-- matched to the account later.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', LOWER(NEW.email))
  ON CONFLICT (id) DO NOTHING;

  -- Claim any guest orders placed with this email before the account existed.
  UPDATE public.esim_orders
     SET user_id = NEW.id
   WHERE user_id IS NULL
     AND LOWER(customer_email) = LOWER(NEW.email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
--
-- Default posture: deny. The service role key used by trusted server code
-- bypasses RLS entirely, so these policies govern the browser only.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE esim_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_flights         ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_shares         ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_checklist_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_memories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets       ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_select_own"   ON profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_insert_own"   ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
-- Deliberately column-blind: role escalation is blocked by the trigger below,
-- because Postgres policies cannot restrict which columns an UPDATE touches.
CREATE POLICY "profiles_update_own"   ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'role can only be changed by an admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER profiles_no_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- Orders: the buyer sees their own (by id, or by the email they checked out
-- with), admins see everything. Writes are server-side only.
CREATE POLICY "orders_select_own" ON esim_orders FOR SELECT USING (
  auth.uid() = user_id
  OR (user_id IS NULL AND LOWER(customer_email) = public.current_user_email())
  OR public.is_admin()
);

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

CREATE POLICY "order_events_admin_read" ON order_events FOR SELECT USING (public.is_admin());

-- Flights
CREATE POLICY "flights_all_own"  ON saved_flights FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flights_admin"    ON saved_flights FOR SELECT USING (public.is_admin());

-- flight_shares has RLS on and NO permissive select policy on purpose: public
-- reads go through get_flight_share(token), which cannot be enumerated.
CREATE POLICY "shares_owner_manage" ON flight_shares FOR ALL USING (
  EXISTS (
    SELECT 1 FROM saved_flights sf
    WHERE sf.id = flight_shares.saved_flight_id AND sf.user_id = auth.uid()
  )
);

-- Trips
CREATE POLICY "trips_all_own"      ON trip_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "trips_public_read"  ON trip_plans FOR SELECT USING (is_public = TRUE);
CREATE POLICY "checklist_all_own"  ON trip_checklist_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "memories_all_own"   ON trip_memories FOR ALL USING (auth.uid() = user_id);

-- Push
CREATE POLICY "push_all_own" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- Affiliates
CREATE POLICY "affiliates_select_own" ON affiliates FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "affiliates_insert_own" ON affiliates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "affiliates_admin_write" ON affiliates FOR UPDATE USING (public.is_admin());
CREATE POLICY "affiliate_events_admin" ON affiliate_events FOR SELECT USING (public.is_admin());

-- Support
CREATE POLICY "tickets_all_own"   ON support_tickets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tickets_admin"     ON support_tickets FOR SELECT USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_orders_status         ON esim_orders(status);
CREATE INDEX idx_orders_created        ON esim_orders(created_at DESC);
CREATE INDEX idx_orders_paid_at        ON esim_orders(paid_at DESC) WHERE paid_at IS NOT NULL;
CREATE INDEX idx_orders_status_paid_at ON esim_orders(status, paid_at DESC);
CREATE INDEX idx_orders_phone          ON esim_orders(customer_phone);
CREATE INDEX idx_orders_user           ON esim_orders(user_id);
CREATE INDEX idx_orders_email          ON esim_orders(LOWER(customer_email));
CREATE INDEX idx_orders_stripe_payment ON esim_orders(stripe_payment_id);
CREATE INDEX idx_order_items_order     ON order_items(order_id);
CREATE INDEX idx_order_events_order    ON order_events(order_id, created_at DESC);
CREATE INDEX idx_saved_flights_date    ON saved_flights(flight_date);
CREATE INDEX idx_saved_flights_user    ON saved_flights(user_id);
CREATE INDEX idx_affiliate_events_aff  ON affiliate_events(affiliate_id, created_at DESC);
CREATE INDEX idx_affiliates_code       ON affiliates(referral_code);

-- ═══════════════════════════════════════════════════════════════════════════
-- Promoting your first admin (run once, with your own email):
--   UPDATE profiles SET role = 'admin' WHERE email = 'you@domnerapp.com';
-- ═══════════════════════════════════════════════════════════════════════════
