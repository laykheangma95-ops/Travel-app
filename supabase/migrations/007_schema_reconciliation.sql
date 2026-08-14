-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 007 — Step 1, schema reconciliation (additive half)
--
-- Apply after 006. Idempotent: safe to re-run.
--
-- WHAT THIS IS:
--   CLAUDE.md §5 Step 1 asks that the live database be brought to the §4 data
--   model. This migration does every part of that which can be done WITHOUT
--   touching a table the live checkout reads. Nothing here changes an existing
--   column, an existing constraint, or an existing row. The storefront cannot
--   tell this migration ran.
--
-- WHAT THIS DELIBERATELY DOES NOT DO — see §12 and docs/INVENTORY.md §8:
--   1. It does not rename esim_orders → orders. Twelve modules read that table
--      by name; the rename and the code change must land in one commit, and §6
--      requires the owner's explicit approval because it is the live purchase
--      path.
--   2. It does not convert money from DECIMAL(10,2) to integer minor units.
--      That is a data migration over every money column in esim_orders and
--      order_items, and it lands on checkout. §12 rule: until the owner
--      decides, the shipped behaviour stands. So every money column created
--      here is DECIMAL(10,2), matching the live convention. When the owner
--      chooses integer minor units, ONE later migration converts all tables
--      together rather than leaving the schema half-converted.
--   3. It does not create audit_log or its triggers. That is Step 2, which
--      owns the audit design; creating an empty table now would only constrain
--      it.
--   4. It does not enable the new order-number sequence. The generator is
--      defined and tested here but the application keeps calling
--      lib/utils.ts:generateOrderNumber() until the owner approves the switch
--      (that function emits DN-YYYY-NNNN, not the §4 DMN-YYYY-NNNNN, and
--      changing it changes checkout).
--
-- RLS POSTURE:
--   Every new table gets RLS enabled with NO policy. That is default deny —
--   service-role server code reaches them, the browser cannot. This satisfies
--   §2 rule 4 from the moment the table exists rather than leaving a window
--   where a new table is world-readable. Step 2 adds the per-role policies.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── §4 enums ─────────────────────────────────────────────────────────────────
--
-- Created as real Postgres enum types, as §4 specifies. They are NOT applied to
-- any existing column in this migration — esim_orders.status keeps its TEXT +
-- CHECK shape so no live row has to be validated or rewritten. New tables below
-- use the enums directly, which is what makes them the source of truth going
-- forward.
--
-- Note the deliberate gap: order_status here carries the full §4 set including
-- partially_failed and fulfilling, which the live TEXT check does not have. The
-- live column will adopt these when it is migrated with the rename.

DO $$ BEGIN
  CREATE TYPE product_type AS ENUM ('esim', 'tour', 'hotel', 'flight', 'insurance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending_payment', 'paid', 'fulfilling', 'completed',
    'partially_failed', 'failed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fulfillment_status AS ENUM (
    'pending', 'processing', 'fulfilled', 'failed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM (
    'pending_approval', 'approved', 'processing', 'completed', 'declined'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_role carries the §3 six-role vocabulary. It is NOT applied to
-- staff_users.role, which ships five different roles (viewer/support/ops/
-- finance/admin) — §12 conflict 2, owner's decision, shipped behaviour stands.
-- The type exists so access_grants below can reference the target vocabulary
-- without pre-empting that decision.
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'owner', 'ops', 'support', 'finance', 'content', 'developer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Catalogue ────────────────────────────────────────────────────────────────
--
-- The catalogue is static content in data/ today. These tables are the target
-- shape; nothing reads them yet, so creating them is inert. Step 6's sales-pause
-- toggle is impossible until products are database rows — this is what unblocks
-- it.

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Free-form per-supplier settings (endpoints, whitelisted IPs, quirks).
  -- Never credentials: those stay in env vars on the worker VM (§10).
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN suppliers.config IS
  'Non-secret supplier settings only. API keys and tokens live in environment '
  'variables on the worker, never in a database row that admin UI can read.';

CREATE TABLE IF NOT EXISTS destinations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_km TEXT NOT NULL,
  -- The Khmer-language destination briefing shown to travelers. Long-form.
  intelligence_content_km TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Step 6: hides every product for this destination from the public site.
  sales_paused BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type product_type NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_km TEXT NOT NULL,
  destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  -- The supplier's own identifier for this plan, used at fulfilment time.
  supplier_plan_ref TEXT,
  -- DECIMAL(10,2) to match the live money convention. See the header note 2.
  cost_price DECIMAL(10, 2) CHECK (cost_price IS NULL OR cost_price >= 0),
  retail_price DECIMAL(10, 2) NOT NULL CHECK (retail_price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Step 6: per-product kill switch, separate from is_active so that pausing
  -- sales during a supplier outage is reversible without losing the product's
  -- retired/live state.
  sales_paused BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN products.cost_price IS
  'What the supplier charges us. §3 withholds this from the support role — '
  'the Step 2 policies must not expose this column to support.';

-- eSIM-specific attributes, split out so products stays product-type agnostic
-- (§2 rule 1). A tour or hotel gets its own sibling table, never a nullable
-- column bolted onto products.
CREATE TABLE IF NOT EXISTS product_esim_details (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  data_amount_mb INTEGER CHECK (data_amount_mb IS NULL OR data_amount_mb > 0),
  validity_days INTEGER CHECK (validity_days IS NULL OR validity_days > 0),
  -- Networks the eSIM roams onto, for the coverage answer support gives most.
  coverage_networks TEXT[],
  apn TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Customers ────────────────────────────────────────────────────────────────
--
-- Today buyer identity is denormalized onto esim_orders (customer_name,
-- customer_email, customer_phone) and a signed-in buyer also has a profiles
-- row. This table is the §4 target: one row per person who has ever bought,
-- signed in or not. It is NOT backfilled here — backfilling means reading every
-- order's PII and deduplicating it, which changes what "my orders" resolves to
-- and therefore needs the same approval as the rename.

CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- NULL for a guest who never created an account.
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  full_name TEXT,
  preferred_language TEXT CHECK (preferred_language IS NULL OR preferred_language IN ('km', 'en')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email
  ON customers (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers (user_id);

-- ── Payments ─────────────────────────────────────────────────────────────────
--
-- Payment facts live on esim_orders today as stripe_payment_id / aba_payment_id
-- / payment_method. That shape cannot represent a retry, a partial capture, or
-- an unmatched payment — all three of which Step 9 reconciliation has to report
-- on. One row per attempt is the §4 model.
--
-- order_id is nullable ON PURPOSE: an unmatched payment is a payment we
-- received and cannot tie to an order. That is exactly the exception type
-- Step 9 must surface, and a NOT NULL column would make it unrecordable.

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES esim_orders(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'aba')),
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  -- §4: transaction and settlement currency are stored separately. An ABA
  -- payment taken in USD and settled in KHR needs both, or the reconciliation
  -- in Step 9 silently compares different currencies.
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  settlement_amount DECIMAL(10, 2) CHECK (settlement_amount IS NULL OR settlement_amount >= 0),
  settlement_currency TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref
  ON payments (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_unmatched
  ON payments (created_at DESC) WHERE order_id IS NULL;

-- ── Refunds ──────────────────────────────────────────────────────────────────
--
-- Step 5 builds the workflow. This is only the table it will need.
--
-- §2 rule 10: never auto-refund. Nothing in this schema executes a refund —
-- status starts at pending_approval and only a human moves it. There is
-- deliberately no default that lands on 'approved'.

CREATE TABLE IF NOT EXISTS refunds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES esim_orders(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  reason TEXT,
  root_cause TEXT,
  status refund_status NOT NULL DEFAULT 'pending_approval',
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  -- The provider's refund reference once the money actually moves.
  provider_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE refunds IS
  'A refund REQUEST, not a refund execution. §2 rule 10: no code path may move '
  'this to a terminal state without a human decision recorded in decided_by.';

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_queue
  ON refunds (created_at DESC) WHERE status = 'pending_approval';

-- ── Fulfilment attempts ──────────────────────────────────────────────────────
--
-- Every call to a supplier, successful or not. lib/fulfilment.ts already
-- retries and fails over between suppliers, but the attempt history is only in
-- logs — so "how many times did we try this order" is unanswerable after the
-- log window closes. Step 4's fulfilment history panel and Step 6's stuck-order
-- tiles both read this.

CREATE TABLE IF NOT EXISTS fulfillment_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES esim_orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  status fulfillment_status NOT NULL DEFAULT 'pending',
  supplier_reference TEXT,
  error_code TEXT,
  error_message TEXT,
  -- The supplier's response, kept verbatim so an escalation package can quote
  -- it rather than paraphrasing it.
  response_payload JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_attempts_order
  ON fulfillment_attempts (order_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillment_attempts_failed
  ON fulfillment_attempts (started_at DESC) WHERE status = 'failed';

-- ── Access grants ────────────────────────────────────────────────────────────
--
-- §4 identity. A time-boxed elevation: giving an agent one order's detail for
-- one shift without making them a permanent role holder. Nothing grants
-- anything yet — Step 3 decides how these are honoured.

CREATE TABLE IF NOT EXISTS access_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_email TEXT NOT NULL,
  granted_role user_role,
  entity_type TEXT,
  entity_id TEXT,
  granted_by TEXT NOT NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_grants_active
  ON access_grants (LOWER(staff_email))
  WHERE revoked_at IS NULL;

-- ── order_items: the four missing §4 columns ─────────────────────────────────
--
-- This is the one existing table this migration touches, and it touches it only
-- by ADDING nullable/defaulted columns. Every read path uses `select('*')`
-- (lib/orders.ts:338, :364), so extra columns arrive harmlessly; no insert in
-- the codebase lists these columns, so no write path changes.
--
-- product_type is what makes an order line able to describe a tour or a hotel
-- (§2 rule 1). Existing rows are all eSIM plans, so backfilling them to 'esim'
-- is a statement of fact, not a guess — which is why this backfill is safe and
-- the customers backfill above is not.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_type product_type;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfillment_status fulfillment_status;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supplier_reference TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfillment_payload JSONB;
-- Links a line to the catalogue once products are populated. Nullable forever
-- for historical lines whose plan no longer exists.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Backfill. Every existing line item is an eSIM plan — the table's own columns
-- (plan_id, data_gb_daily, tier) say so.
UPDATE order_items SET product_type = 'esim' WHERE product_type IS NULL;

-- Fulfilment state per line did not exist before, so it cannot be reconstructed
-- per line. It is derived from the parent order's status, which is the most
-- truthful mapping available: a fulfilled order's lines were fulfilled.
UPDATE order_items oi
   SET fulfillment_status = CASE o.status
         WHEN 'fulfilled' THEN 'fulfilled'::fulfillment_status
         WHEN 'refunded'  THEN 'refunded'::fulfillment_status
         WHEN 'cancelled' THEN 'failed'::fulfillment_status
         ELSE 'pending'::fulfillment_status
       END
  FROM esim_orders o
 WHERE o.id = oi.order_id
   AND oi.fulfillment_status IS NULL;

-- Any orphan line (no parent order) defaults to pending rather than being left
-- NULL, so the NOT NULL below cannot fail on a row the join missed.
UPDATE order_items SET fulfillment_status = 'pending' WHERE fulfillment_status IS NULL;

-- Now that every row has a value, lock both columns down — WITH defaults.
--
-- The defaults are load-bearing, not decoration. lib/orders.ts:153 inserts line
-- items without naming these columns, so NOT NULL without a default would
-- reject every new line item and break checkout on the first purchase after
-- this deploys. Verified: that insert fails with
-- "null value in column product_type violates not-null constraint".
--
-- DEFAULT 'esim' is truthful rather than merely convenient — eSIM is the only
-- product the storefront sells today. It is a compatibility bridge with a
-- defined end: when the catalogue becomes multi-type, checkout starts passing
-- product_type explicitly and this default is dropped in that same migration,
-- so a tour can never silently record itself as an eSIM.
ALTER TABLE order_items ALTER COLUMN product_type SET DEFAULT 'esim';
ALTER TABLE order_items ALTER COLUMN product_type SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN fulfillment_status SET DEFAULT 'pending';
ALTER TABLE order_items ALTER COLUMN fulfillment_status SET NOT NULL;

COMMENT ON COLUMN order_items.product_type IS
  'What kind of thing this line sells. The column that makes §2 rule 1 true at '
  'the line level even while the parent table is still named esim_orders.';

CREATE INDEX IF NOT EXISTS idx_order_items_unfulfilled
  ON order_items (order_id) WHERE fulfillment_status IN ('pending', 'processing');

-- ── Order number sequence ────────────────────────────────────────────────────
--
-- §4 specifies DMN-YYYY-NNNNN. The application currently generates
-- DN-YYYY-NNNN from Math.random() (lib/utils.ts:15), which is both the wrong
-- format and collision-prone — 9000 possible values per year, with a UNIQUE
-- constraint on order_number, so a collision is a failed checkout.
--
-- This defines the correct generator. It is NOT wired in: switching checkout
-- over to it is a code change on the live purchase path and needs the owner's
-- approval. Defining it now means the switch is a one-line change later.

CREATE SEQUENCE IF NOT EXISTS order_number_seq AS BIGINT START WITH 1;

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS TEXT AS $$
  SELECT 'DMN-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD((NEXTVAL('public.order_number_seq'))::TEXT, 5, '0');
$$ LANGUAGE sql VOLATILE SET search_path = public;

COMMENT ON FUNCTION public.next_order_number() IS
  'The §4 order number generator. Not yet called by the application — '
  'lib/utils.ts:generateOrderNumber() still owns checkout until the owner '
  'approves the switch. Sequence-based, so it cannot collide.';

-- FROM PUBLIC, not "FROM anon, authenticated". Postgres grants EXECUTE on new
-- functions to PUBLIC by default, and revoking from a role that inherits it
-- through PUBLIC leaves the privilege in place — verified: after revoking from
-- anon and authenticated alone, has_function_privilege() still returned true
-- for both. Without this a signed-in browser could burn sequence numbers at
-- will. service_role is granted back explicitly because server code calls this.
REVOKE EXECUTE ON FUNCTION public.next_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_number() TO service_role;

-- ── updated_at triggers ──────────────────────────────────────────────────────
--
-- touch_updated_at() already exists (schema.sql:399) and is attached to
-- esim_orders and profiles. §5 Step 1 asks for it on the rest. Attached to
-- every new table with an updated_at column, plus staff_users, which has the
-- column but never had the trigger.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'suppliers', 'destinations', 'products', 'product_esim_details',
    'customers', 'payments', 'refunds', 'staff_users',
    'push_subscriptions', 'notification_preferences'
  ] LOOP
    -- Only if the table exists and does not already have the trigger.
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t)
       AND NOT EXISTS (SELECT 1 FROM pg_trigger
                        WHERE tgname = t || '_touch'
                          AND tgrelid = ('public.' || t)::regclass) THEN
      EXECUTE FORMAT(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
        t || '_touch', t
      );
    END IF;
  END LOOP;
END $$;

-- ── RLS: default deny on everything new ──────────────────────────────────────
--
-- Enabled with no policies. Server code using the service role reaches these
-- tables; the browser gets nothing. Step 2 writes the per-role policies — and
-- must remember that products.cost_price is hidden from support (§3).

ALTER TABLE suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_esim_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_grants        ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification — run after applying. Every row should read OK.
--
--   SELECT 'enums' AS check, COUNT(*) || ' of 5' AS result
--     FROM pg_type WHERE typname IN
--       ('product_type','order_status','fulfillment_status','refund_status','user_role');
--
--   SELECT 'new tables' AS check, COUNT(*) || ' of 9' AS result
--     FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN
--       ('suppliers','destinations','products','product_esim_details','customers',
--        'payments','refunds','fulfillment_attempts','access_grants');
--
--   SELECT 'order_items backfilled' AS check,
--          COUNT(*) FILTER (WHERE product_type IS NULL) || ' nulls (want 0)' AS result
--     FROM order_items;
--
--   SELECT 'order number' AS check, public.next_order_number() AS result;
--
--   -- No existing order changed:
--   SELECT 'orders untouched' AS check, COUNT(*) || ' orders' AS result FROM esim_orders;
-- ═══════════════════════════════════════════════════════════════════════════
