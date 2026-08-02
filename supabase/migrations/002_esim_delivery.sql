-- 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
-- eSIM QR delivery: customer chooses email, Telegram, or both.
-- Run after 001_auth_methods.sql. Safe to re-run.
--
-- DATA CLASSIFICATION: every table below holds customer contact data. It is
-- company-confidential and deliberately unreadable by the anon key. There is
-- no SELECT policy for customers on the link/log tables and no API route that
-- lists them — reads happen through the service role only.

-- 1. Delivery preference on the order ------------------------------------

ALTER TABLE esim_orders
  -- 'email' | 'telegram' | 'both'
  ADD COLUMN IF NOT EXISTS delivery_channel TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS customer_phone_country TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS delivered_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_telegram_at TIMESTAMPTZ;

ALTER TABLE esim_orders
  DROP CONSTRAINT IF EXISTS esim_orders_delivery_channel_check;
ALTER TABLE esim_orders
  ADD CONSTRAINT esim_orders_delivery_channel_check
  CHECK (delivery_channel IN ('email', 'telegram', 'both'));

-- 2. Telegram connect tokens ---------------------------------------------
-- A bot cannot message a phone number — Telegram exposes no such API. The
-- customer has to open the bot once so it learns their chat_id. We mint a
-- single-use token, put it in a t.me deep link on the confirmation page, and
-- the webhook trades it for the chat_id when they tap Start.

CREATE TABLE IF NOT EXISTS telegram_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL REFERENCES esim_orders(order_number) ON DELETE CASCADE,
  -- Stored hashed: the raw token is a bearer credential for one order's QR.
  token_hash TEXT NOT NULL UNIQUE,
  -- The number typed at checkout, E.164. Compared against the contact the
  -- customer shares in Telegram so a leaked link cannot redirect delivery.
  expected_phone TEXT,
  chat_id BIGINT,
  telegram_username TEXT,
  linked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_order ON telegram_links(order_number);
CREATE INDEX IF NOT EXISTS idx_telegram_links_chat ON telegram_links(chat_id);

ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
-- No policies by design: service role only.

-- 3. Delivery log ---------------------------------------------------------
-- One row per send attempt, so support can answer "did it actually go out?"
-- without guessing, and so a failed Telegram send can fall back to email.

CREATE TABLE IF NOT EXISTS esim_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL REFERENCES esim_orders(order_number) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'telegram')),
  succeeded BOOLEAN DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esim_deliveries_order ON esim_deliveries(order_number, created_at DESC);

ALTER TABLE esim_deliveries ENABLE ROW LEVEL SECURITY;
-- No policies by design: service role only.

-- 4. Guard against bulk extraction ---------------------------------------
-- The contact list is the asset. Revoke the blanket grants Supabase hands the
-- anon/authenticated roles so a leaked anon key cannot enumerate customers
-- even if an RLS policy is ever added to these tables by mistake.

REVOKE ALL ON telegram_links FROM anon, authenticated;
REVOKE ALL ON esim_deliveries FROM anon, authenticated;

-- Customers may read their own order (they already could), but never the
-- contact columns of anyone else's. esim_orders keeps its existing policies.
