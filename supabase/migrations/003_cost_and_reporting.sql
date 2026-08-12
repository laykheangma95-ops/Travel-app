-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 003 — supplier cost, so margin is answerable
--
-- Apply after 0001. Idempotent: safe to re-run.
--
-- WHY:
--   Until now an order stored what the customer paid (price_usd) but not what
--   the plan cost us. That means the database cannot answer "what did we make
--   on this order", and no financial statement built on top of it can show
--   COGS, gross profit or margin — only revenue. Adding the cost at checkout
--   time is what turns the orders table into something you can run a business
--   from.
--
--   cost_usd is NULLABLE on purpose. Historical orders genuinely do not know
--   their cost, and back-filling a guess would put invented numbers into a
--   financial statement. NULL means "unknown", the report counts those rows
--   separately, and margin is reported only over the orders that can support
--   it. A visibly incomplete number beats a confidently wrong one.
--
-- NOTE ON TYPES:
--   DECIMAL(10,2), matching every other money column here. Postgres DECIMAL is
--   exact — this is not the float that the "no floats in the money path" rule
--   warns about. Application code still does its arithmetic in integer cents.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Supplier cost ────────────────────────────────────────────────────────────

ALTER TABLE esim_orders ADD COLUMN IF NOT EXISTS cost_usd DECIMAL(10, 2);

COMMENT ON COLUMN esim_orders.cost_usd IS
  'What we paid the supplier for this order, in USD. NULL means unknown — '
  'never back-fill it with an estimate; the sales report reports unknown-cost '
  'orders separately rather than inventing a margin.';

-- Cost is never negative. A negative cost would silently inflate margin.
DO $$ BEGIN
  ALTER TABLE esim_orders ADD CONSTRAINT esim_orders_cost_non_negative
    CHECK (cost_usd IS NULL OR cost_usd >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Reporting indexes ────────────────────────────────────────────────────────
--
-- The sales report filters on settled money over a date range. Without these
-- it is a sequential scan of every order that has ever existed, which gets
-- slower every month precisely as the report gets more useful.

CREATE INDEX IF NOT EXISTS idx_orders_paid_at
  ON esim_orders(paid_at DESC)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_paid_at
  ON esim_orders(status, paid_at DESC);

-- ── Support console lookup ───────────────────────────────────────────────────
--
-- The call-center lookup matches an exact phone number. idx_orders_email
-- already covers the email case (0001); this is its phone counterpart.
-- Deliberately not a trigram index: exact match only, so the column cannot be
-- used to enumerate customers by prefix.

CREATE INDEX IF NOT EXISTS idx_orders_phone ON esim_orders(customer_phone);

COMMIT;
