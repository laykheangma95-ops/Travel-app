-- Domner App — Supabase schema
-- Run in the Supabase SQL editor. Row Level Security enabled on every table.

-- Users profile (extends Supabase auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  passport_country TEXT DEFAULT 'KH',
  preferred_language TEXT DEFAULT 'km',
  telegram_username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- eSIM Orders
CREATE TABLE esim_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  order_number TEXT UNIQUE NOT NULL,
  country TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  data_gb_daily DECIMAL NOT NULL,
  price_usd DECIMAL NOT NULL,
  status TEXT DEFAULT 'pending',
  qr_code_url TEXT,
  payment_method TEXT,
  stripe_payment_id TEXT,
  aba_payment_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  device_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ
);

-- Saved Flights
CREATE TABLE saved_flights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  flight_number TEXT NOT NULL,
  flight_date DATE NOT NULL,
  departure_airport TEXT,
  arrival_airport TEXT,
  notify_gate_change BOOLEAN DEFAULT TRUE,
  notify_delay BOOLEAN DEFAULT TRUE,
  notify_boarding BOOLEAN DEFAULT TRUE,
  notify_landing BOOLEAN DEFAULT TRUE,
  share_token TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flight Share links (public tracking)
CREATE TABLE flight_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  saved_flight_id UUID REFERENCES saved_flights(id),
  share_token TEXT UNIQUE NOT NULL,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trip Plans
CREATE TABLE trip_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
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

-- Trip Checklist
CREATE TABLE trip_checklist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID REFERENCES trip_plans(id),
  user_id UUID REFERENCES profiles(id),
  category TEXT NOT NULL,
  item TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  is_required BOOLEAN DEFAULT TRUE,
  due_before_hours INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trip Memories (photos/journal)
CREATE TABLE trip_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID REFERENCES trip_plans(id),
  user_id UUID REFERENCES profiles(id),
  photo_url TEXT,
  caption TEXT,
  location TEXT,
  taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push Notification Subscriptions
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  fcm_token TEXT NOT NULL,
  device_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affiliates
CREATE TABLE affiliates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  telegram TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  commission_rate DECIMAL DEFAULT 0.30,
  total_clicks INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_earned_usd DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affiliate Clicks/Conversions
CREATE TABLE affiliate_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID REFERENCES affiliates(id),
  event_type TEXT NOT NULL,
  order_id UUID REFERENCES esim_orders(id),
  commission_usd DECIMAL,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Support Tickets
CREATE TABLE support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  order_id UUID REFERENCES esim_orders(id),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE esim_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Profiles: users manage their own row
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Orders: users see their own; inserts allowed for guests via service role
CREATE POLICY "orders_select_own" ON esim_orders FOR SELECT USING (auth.uid() = user_id);

-- Saved flights
CREATE POLICY "flights_all_own" ON saved_flights FOR ALL USING (auth.uid() = user_id);

-- Flight shares are publicly readable (live share links need no account)
CREATE POLICY "shares_public_read" ON flight_shares FOR SELECT USING (true);

-- Trips
CREATE POLICY "trips_all_own" ON trip_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "trips_public_read" ON trip_plans FOR SELECT USING (is_public = true);
CREATE POLICY "checklist_all_own" ON trip_checklist_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "memories_all_own" ON trip_memories FOR ALL USING (auth.uid() = user_id);

-- Push subscriptions
CREATE POLICY "push_all_own" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- Affiliates: applicants can see their own application
CREATE POLICY "affiliates_select_own" ON affiliates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "affiliates_insert_own" ON affiliates FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Support tickets
CREATE POLICY "tickets_all_own" ON support_tickets FOR ALL USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes
CREATE INDEX idx_orders_status ON esim_orders(status);
CREATE INDEX idx_orders_created ON esim_orders(created_at DESC);
CREATE INDEX idx_saved_flights_date ON saved_flights(flight_date);
CREATE INDEX idx_affiliate_events_affiliate ON affiliate_events(affiliate_id);
