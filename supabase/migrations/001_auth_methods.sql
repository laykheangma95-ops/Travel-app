-- 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
-- Auth: multiple sign-in methods + optional, verify-later phone.
-- Run after schema.sql. Safe to re-run.

-- 1. Profile columns -------------------------------------------------------

ALTER TABLE profiles
  -- Verification is a timestamp, not a boolean, so we always know *when* a
  -- number was proven — useful when a support agent has to judge a recovery
  -- request months later.
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_country TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  -- Which providers this account can sign in with: google, apple, email,
  -- phone. Kept so the UI can say "you signed up with Google" instead of
  -- showing a password prompt that will never work.
  ADD COLUMN IF NOT EXISTS auth_providers TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_verified
  ON profiles (phone) WHERE phone_verified_at IS NOT NULL;

-- 2. Recovery codes --------------------------------------------------------
-- Offline fallback for a traveller who has lost access to both their inbox
-- and their SIM. Codes are stored hashed; we only ever show them once.

CREATE TABLE IF NOT EXISTS recovery_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id);

ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;

-- Read-only to the owner, so the UI can show how many codes are left unused.
-- Issuing and spending codes goes through the service role.
DROP POLICY IF EXISTS "recovery_codes_select_own" ON recovery_codes;
CREATE POLICY "recovery_codes_select_own" ON recovery_codes
  FOR SELECT USING (auth.uid() = user_id);

-- 3. OTP attempt log -------------------------------------------------------
-- Rate limiting and SMS-pumping defence. Every send is recorded with the
-- destination country so we can cut off traffic to high-cost ranges we do not
-- serve — that fraud drains real money fast on a public signup endpoint.

CREATE TABLE IF NOT EXISTS otp_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'voice', 'whatsapp', 'telegram')),
  -- Hashed so the log is not itself a directory of customer phone numbers.
  destination_hash TEXT NOT NULL,
  destination_country TEXT,
  ip_hash TEXT,
  succeeded BOOLEAN DEFAULT FALSE,
  cost_usd DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_attempts_dest ON otp_attempts(destination_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_attempts_ip ON otp_attempts(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_attempts_country ON otp_attempts(destination_country, created_at DESC);

ALTER TABLE otp_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- 4. Keep the profile in step with auth.users -----------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, full_name, email, phone, passport_country, preferred_language,
    email_verified_at, phone_verified_at, auth_providers
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mirror confirmations back onto the profile so app code never has to read
-- auth.users directly.
CREATE OR REPLACE FUNCTION public.sync_user_verification()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email,
      email_verified_at = NEW.email_confirmed_at,
      phone = COALESCE(NEW.phone, phone),
      phone_verified_at = NEW.phone_confirmed_at
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_verified ON auth.users;
CREATE TRIGGER on_auth_user_verified
  AFTER UPDATE OF email_confirmed_at, phone_confirmed_at, email, phone ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_verification();
