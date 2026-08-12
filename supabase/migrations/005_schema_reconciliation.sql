-- ═══════════════════════════════════════════════════════════════════════════
-- 005 — Schema reconciliation (CLAUDE.md §5 Step 1)
--
-- Brings the live database toward the §4 data model. Every statement here is
-- ADDITIVE or a rename with a compatibility shim. Nothing is dropped, nothing
-- is truncated, and no application code has to change on the day this applies.
--
-- THE THREE DECISIONS THIS MIGRATION ENCODES (owner-approved, CLAUDE.md §12):
--
--   1. esim_orders becomes `orders`, and a view keeps the old name working.
--      Rule 1 says an order is never eSIM-specific; rule 12 says the table
--      cannot be dropped because it holds live orders. A rename plus a view
--      satisfies both: the table is correct, and every existing query still
--      resolves. Read paths migrate to `orders` in a later, separate commit.
--
--   2. Money stays DECIMAL(10,2). §4 says "integer minor units, never floats"
--      — but Postgres DECIMAL is exact, not floating point, so the rounding
--      error that rule exists to prevent cannot occur. Converting would rewrite
--      every money column and every read path in the live checkout for no
--      correctness gain. New money columns below match the existing type.
--
--   3. Order numbers come from a sequence. The old generator was
--      'DN-' || year || random(1000..9999) — 9,000 values a year against a
--      UNIQUE constraint, so a collision is a customer's checkout failing.
--      next_order_number() cannot collide and emits the §4 format.
--
-- ROLLBACK: see the commented block at the foot of this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Enums ─────────────────────────────────────────────────────────────────
--
-- Created unconditionally-but-safely. New types referenced by new columns only;
-- no existing column changes type in this migration.

DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('esim', 'tour', 'hotel', 'flight', 'insurance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status_v2 AS ENUM (
    'pending_payment', 'paid', 'fulfilling', 'completed',
    'partially_failed', 'failed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fulfillment_status AS ENUM (
    'pending', 'processing', 'fulfilled', 'failed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refund_status AS ENUM (
    'pending_approval', 'approved', 'processing', 'completed', 'declined'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NOTE ON order_status_v2: orders.status is currently a TEXT column with a
-- CHECK constraint over ('pending','paid','fulfilled','cancelled','refunded').
-- Those values do not map one-to-one onto §4 — 'fulfilled' vs 'completed',
-- 'cancelled' has no §4 equivalent, and §4 adds 'fulfilling'/'partially_failed'
-- which the app cannot yet produce. Converting the column is a live-checkout
-- change and belongs to its own migration with its own approval, so the enum is
-- defined here and left unused. It is named _v2 so it cannot be mistaken for a
-- type the orders table already uses.

-- ── 2. esim_orders → orders, with a compatibility view ───────────────────────
--
-- RENAME carries everything with it: the primary key, every constraint, every
-- index, both triggers, and all RLS policies. Foreign keys in order_items,
-- order_events, support_tickets and affiliate_events re-point automatically —
-- they reference the table by OID, not by name.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'esim_orders'
               AND table_type = 'BASE TABLE')
  THEN
    ALTER TABLE public.esim_orders RENAME TO orders;
  END IF;
END $$;

-- Trigger name follows the table so nothing reads as a leftover.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'esim_orders_touch') THEN
    ALTER TRIGGER esim_orders_touch ON public.orders RENAME TO orders_touch;
  END IF;
END $$;

-- The shim. `security_invoker = true` is load-bearing and NOT optional: without
-- it the view would run with the owner's rights and silently BYPASS the RLS
-- policies on `orders`, turning a rename into a data leak. With it, every
-- policy applies exactly as it did before this migration.
--
-- A view that is a plain SELECT * over one table is auto-updatable in Postgres,
-- so INSERT/UPDATE/DELETE ... RETURNING all keep working through the old name.
DROP VIEW IF EXISTS public.esim_orders;
CREATE VIEW public.esim_orders WITH (security_invoker = true) AS
  SELECT * FROM public.orders;

COMMENT ON VIEW public.esim_orders IS
  'Compatibility shim for CLAUDE.md §5 Step 1. The real table is public.orders. '
  'Drop this view once no application code references esim_orders.';

-- Mirrors the privileges the base table already carries. RLS on `orders` is
-- what actually restricts access; these grants only make the view reachable
-- through PostgREST the same way the table was.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.esim_orders TO anon, authenticated, service_role;

-- ── 3. orders: the columns §4 asks for ───────────────────────────────────────

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS travel_start_date DATE;

COMMENT ON COLUMN public.orders.travel_start_date IS
  'Departure date. Drives the Step 7 pre-departure setup-instructions job.';

-- ── 4. Order numbers from a sequence ─────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq AS BIGINT START 1;

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'DMN-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.order_number_seq')::TEXT, 5, '0');
$$;

COMMENT ON FUNCTION public.next_order_number() IS
  'Collision-proof order number in the §4 format DMN-YYYY-NNNNN. Replaces a '
  'random 4-digit generator that could produce a duplicate and fail a checkout. '
  'The counter does not reset each year; uniqueness matters more than a tidy '
  'number, and the UNIQUE constraint on orders.order_number is the guarantee.';

GRANT EXECUTE ON FUNCTION public.next_order_number() TO anon, authenticated, service_role;

-- Belt and braces: an INSERT that omits order_number now gets a safe one
-- instead of failing. The application still supplies it explicitly.
ALTER TABLE public.orders
  ALTER COLUMN order_number SET DEFAULT public.next_order_number();

-- Existing numbers use the 'DN-' prefix and the new ones use 'DMN-', so the
-- two generations cannot collide and no backfill of historic numbers is needed.

-- ── 5. order_items: this is the actual fix for rule 1 ────────────────────────
--
-- The table name was never the substance of rule 1 — this is. An order line
-- that carries its own product_type and its own fulfillment_status can hold a
-- tour next to an eSIM. Until now both facts lived on the order.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_type public.product_type NOT NULL DEFAULT 'esim';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS fulfillment_status public.fulfillment_status NOT NULL DEFAULT 'pending';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS supplier_reference TEXT;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS fulfillment_payload JSONB;

COMMENT ON COLUMN public.order_items.fulfillment_payload IS
  'Supplier response for THIS line — QR, ICCID, activation code, APN. The '
  'equivalent columns on orders are the eSIM-era single-item shape and are '
  'deprecated by this column, not yet removed. Removal is a later migration.';

-- Backfill: every existing line is an eSIM (the only thing ever sold), and its
-- fulfilment state is the state of its parent order. Done as one UPDATE per
-- terminal state rather than a join expression, so the intent is legible in a
-- migration review.
UPDATE public.order_items i
   SET fulfillment_status = 'fulfilled'
  FROM public.orders o
 WHERE i.order_id = o.id
   AND o.status = 'fulfilled'
   AND i.fulfillment_status = 'pending';

UPDATE public.order_items i
   SET fulfillment_status = 'refunded'
  FROM public.orders o
 WHERE i.order_id = o.id
   AND o.status = 'refunded'
   AND i.fulfillment_status = 'pending';

-- 'pending' (the column default) is already correct for pending, paid and
-- cancelled orders: none of them has a delivered eSIM.

CREATE INDEX IF NOT EXISTS idx_order_items_fulfillment
  ON public.order_items(fulfillment_status)
  WHERE fulfillment_status IN ('pending', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_order_items_product_type
  ON public.order_items(product_type);

-- ── 6. Catalogue tables ──────────────────────────────────────────────────────
--
-- Created EMPTY and deliberately so. Products and destinations live in
-- data/*.ts today and the public site reads them from there. Seeding these
-- tables while the site still reads the files would create two sources of truth
-- that drift apart silently. They exist now because Step 2 needs something to
-- write policies against and Step 6's per-product sales pause is impossible
-- without them; populating them and cutting the site over is its own step.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.destinations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_km TEXT NOT NULL,
  region TEXT,
  flag TEXT,
  -- The Khmer travel-intelligence copy that makes a destination page worth
  -- reading. Owned by the `content` role once §3's roles are reconciled.
  intelligence_content_km TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sales_paused BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type public.product_type NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_km TEXT NOT NULL,
  destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_plan_ref TEXT,
  -- Money as DECIMAL(10,2), matching the existing schema. See the header.
  cost_price DECIMAL(10, 2) CHECK (cost_price IS NULL OR cost_price >= 0),
  retail_price DECIMAL(10, 2) NOT NULL CHECK (retail_price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Step 6: flipping this hides the product from the public site immediately,
  -- without deleting it or losing its order history.
  sales_paused BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.products.cost_price IS
  'What the supplier charges us. Never exposed to the support role — see §3.';

CREATE TABLE IF NOT EXISTS public.product_esim_details (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  data_amount_mb INTEGER,
  validity_days INTEGER,
  coverage_networks TEXT[],
  apn TEXT,
  is_daily BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_products_type_active ON public.products(type, is_active);
CREATE INDEX IF NOT EXISTS idx_products_destination ON public.products(destination_id);

-- ── 7. Transaction tables ────────────────────────────────────────────────────
--
-- Also empty on purpose. Backfilling `payments` and `customers` from the
-- existing orders is possible, but the live checkout still writes payment and
-- contact fields onto the order row — so a backfilled table would be correct
-- for one moment and quietly wrong from the next order onward. A table that is
-- honestly empty beats one that is subtly stale. They get wired up when the
-- read paths move off the compatibility view.

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  phone_country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL CHECK (gateway IN ('stripe', 'aba')),
  gateway_reference TEXT,
  -- §4: transaction currency and settlement currency are stored separately. An
  -- ABA payment can be charged in USD and settle in KHR; collapsing them makes
  -- the Step 9 reconciliation impossible to get right.
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  settlement_amount DECIMAL(10, 2),
  settlement_currency TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  reason TEXT,
  root_cause TEXT,
  -- Step 5 default. Nothing may write 'approved' directly: at or under the cap
  -- the server approves it, over the cap only the owner can, and rule 10 means
  -- no code path ever moves money without a human.
  status public.refund_status NOT NULL DEFAULT 'pending_approval',
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  gateway_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fulfillment_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status public.fulfillment_status NOT NULL DEFAULT 'processing',
  error_code TEXT,
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.access_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status) WHERE status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_fulfillment_attempts_item ON public.fulfillment_attempts(order_item_id);

-- ── 8. RLS on every new table ────────────────────────────────────────────────
--
-- §5 Step 1 says "RLS not yet enabled", meaning the POLICY work belongs to
-- Step 2. Taken literally it would be dangerous: a new table in the `public`
-- schema of a Supabase project is reachable through PostgREST with the anon
-- key the moment it exists. A table with RLS enabled and no policy is
-- default-deny — unreachable by anon and authenticated, service role only.
-- That is rule 4 satisfied and Step 2's work left untouched.

ALTER TABLE public.suppliers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_esim_details  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillment_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_grants         ENABLE ROW LEVEL SECURITY;

-- ── 9. updated_at triggers ───────────────────────────────────────────────────
--
-- public.touch_updated_at() already exists (schema.sql, migration 0001).

DROP TRIGGER IF EXISTS suppliers_touch ON public.suppliers;
CREATE TRIGGER suppliers_touch BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS destinations_touch ON public.destinations;
CREATE TRIGGER destinations_touch BEFORE UPDATE ON public.destinations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS products_touch ON public.products;
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS customers_touch ON public.customers;
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS refunds_touch ON public.refunds;
CREATE TRIGGER refunds_touch BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 10. Tell PostgREST the schema moved ──────────────────────────────────────
-- Without this the API keeps serving a cached schema and the new view is a 404
-- until the next restart.

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (run top to bottom; safe while the app still calls esim_orders)
--
--   DROP VIEW IF EXISTS public.esim_orders;
--   ALTER TABLE public.orders RENAME TO esim_orders;
--   ALTER TRIGGER orders_touch ON public.esim_orders RENAME TO esim_orders_touch;
--   ALTER TABLE public.esim_orders ALTER COLUMN order_number DROP DEFAULT;
--
-- The new tables and the order_items columns can be left in place: they are
-- additive, nothing reads them yet, and dropping them is what would risk data.
-- ═══════════════════════════════════════════════════════════════════════════
