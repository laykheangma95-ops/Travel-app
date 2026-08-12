-- ═══════════════════════════════════════════════════════════════════════════
-- RLS policy tests — CLAUDE.md §5 Step 2
--
-- "A SQL test file asserting one permitted and one forbidden operation per
--  role", plus the two acceptance tests the step names:
--    · support cannot read cost_price
--    · nobody can modify audit_log
--
-- HOW TO RUN
--   Paste the whole file into the Supabase SQL editor and run it. It is wrapped
--   in BEGIN … ROLLBACK, so it creates test users, asserts against them, and
--   leaves nothing behind. Safe on production, though dev is the polite place.
--
--   Success looks like a single row reading "ALL TESTS PASSED".
--   Failure aborts on the first bad assertion and names it.
--
-- WHY IT SETS ROLES BY HAND
--   Postgres does not apply RLS to the table owner, so running these queries as
--   the dashboard's default role would pass everything and prove nothing. Each
--   block switches to `authenticated` and plants a JWT claim, which is what a
--   real signed-in staff member's request looks like.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(condition BOOLEAN, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok — %', label;
END;
$$;

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- Fixed UUIDs so the SET LOCAL blocks below can name them literally.

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', NOW(), NOW(), NOW()
  FROM (VALUES
    ('11111111-1111-1111-1111-111111111111'::UUID, 'test-viewer@domner.test'),
    ('22222222-2222-2222-2222-222222222222'::UUID, 'test-support@domner.test'),
    ('33333333-3333-3333-3333-333333333333'::UUID, 'test-ops@domner.test'),
    ('44444444-4444-4444-4444-444444444444'::UUID, 'test-finance@domner.test'),
    ('55555555-5555-5555-5555-555555555555'::UUID, 'test-content@domner.test'),
    ('66666666-6666-6666-6666-666666666666'::UUID, 'test-developer@domner.test'),
    ('77777777-7777-7777-7777-777777777777'::UUID, 'test-owner@domner.test')
  ) AS u(id, email)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff_users (user_id, email, role, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'test-viewer@domner.test',    'viewer',    TRUE),
  ('22222222-2222-2222-2222-222222222222', 'test-support@domner.test',   'support',   TRUE),
  ('33333333-3333-3333-3333-333333333333', 'test-ops@domner.test',       'ops',       TRUE),
  ('44444444-4444-4444-4444-444444444444', 'test-finance@domner.test',   'finance',   TRUE),
  ('55555555-5555-5555-5555-555555555555', 'test-content@domner.test',   'content',   TRUE),
  ('66666666-6666-6666-6666-666666666666', 'test-developer@domner.test', 'developer', TRUE),
  ('77777777-7777-7777-7777-777777777777', 'test-owner@domner.test',     'owner',     TRUE);

INSERT INTO public.destinations (id, slug, name_en, name_km)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'test-vietnam', 'Vietnam', 'វៀតណាម');

INSERT INTO public.suppliers (id, slug, name)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'test-gohub', 'GoHub');

INSERT INTO public.products (id, type, sku, name_en, name_km, destination_id,
                             supplier_id, cost_price, retail_price)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', 'esim', 'TEST-VN-3GB', 'Vietnam 3GB',
        'វៀតណាម 3GB', 'aaaaaaaa-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000002', 2.50, 9.99);

INSERT INTO public.orders (id, order_number, country, plan_name, duration_days,
                           data_gb_daily, price_usd, status, customer_email)
VALUES ('aaaaaaaa-0000-0000-0000-000000000004', 'DMN-TEST-00001', 'Vietnam',
        'Vietnam 3GB', 7, 1, 9.99, 'paid', 'buyer@domner.test');

INSERT INTO public.refunds (id, order_id, amount, requested_by)
VALUES ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000004',
        9.99, 'test-ops@domner.test');

-- ── viewer: dashboard only ───────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"test-viewer@domner.test","role":"authenticated"}';

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.staff_users WHERE email = 'test-viewer@domner.test') = 1,
  'viewer PERMITTED: reads their own staff row');

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.destinations) = 0,
  'viewer FORBIDDEN: cannot read destinations');

-- ── support: one customer at a time, never the list ──────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"test-support@domner.test","role":"authenticated"}';

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.staff_users WHERE email = 'test-support@domner.test') = 1,
  'support PERMITTED: reads their own staff row');

-- The §12 #3 conflict, asserted as shipped behaviour. If CLAUDE.md §3 is ever
-- adopted as written, THIS test is the one that has to change, deliberately.
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.orders) = 0,
  'support FORBIDDEN: cannot browse the order list (docs/LOCKED.md)');

-- Step 2 acceptance test: support cannot read cost_price. It cannot read the
-- products table at all, and products_public has no such column to read.
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.products) = 0,
  'support FORBIDDEN: cannot read products, so cannot read cost_price');

SELECT pg_temp.assert(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products_public'
       AND column_name IN ('cost_price', 'supplier_plan_ref')
  ),
  'products_public exposes neither cost_price nor supplier_plan_ref');

-- ── ops: fulfilment, margin, prices — but not the refund decision ────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"test-ops@domner.test","role":"authenticated"}';

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.orders) = 1,
  'ops PERMITTED: reads the order list');

WITH attempted AS (
  UPDATE public.refunds SET status = 'approved'
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005'
  RETURNING 1
)
SELECT pg_temp.assert((SELECT count(*) FROM attempted) = 0,
  'ops FORBIDDEN: cannot approve a refund (rule 10 — a human owner decides)');

-- ── finance: money, no customers, no product edits ───────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","email":"test-finance@domner.test","role":"authenticated"}';

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.refunds) = 1,
  'finance PERMITTED: reads refunds');

WITH attempted AS (
  UPDATE public.products SET retail_price = 0.01
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003'
  RETURNING 1
)
SELECT pg_temp.assert((SELECT count(*) FROM attempted) = 0,
  'finance FORBIDDEN: cannot change a price');

-- ── content: destinations, and nothing that carries money or people ──────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","email":"test-content@domner.test","role":"authenticated"}';

WITH attempted AS (
  UPDATE public.destinations SET intelligence_content_km = 'សាកល្បង'
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
  RETURNING 1
)
SELECT pg_temp.assert((SELECT count(*) FROM attempted) = 1,
  'content PERMITTED: writes Khmer destination content');

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.orders) = 0,
  'content FORBIDDEN: cannot read orders');

-- ── developer: no production data at all ─────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","email":"test-developer@domner.test","role":"authenticated"}';

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.staff_users WHERE email = 'test-developer@domner.test') = 1,
  'developer PERMITTED: reads their own staff row');

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.orders) = 0
  AND (SELECT count(*) FROM public.products) = 0
  AND (SELECT count(*) FROM public.destinations) = 0
  AND (SELECT count(*) FROM public.refunds) = 0,
  'developer FORBIDDEN: reaches no production data (§3)');

-- ── owner: everything, except rewriting history ──────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","email":"test-owner@domner.test","role":"authenticated"}';

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.audit_log) > 0,
  'owner PERMITTED: reads the audit log (the fixtures above wrote to it)');

DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.audit_log SET action = 'tampered' WHERE TRUE;
  EXCEPTION WHEN OTHERS THEN
    ok := TRUE;
  END;
  PERFORM pg_temp.assert(ok, 'owner FORBIDDEN: cannot modify the audit log (rule 5)');
END $$;

-- ── Rule 5, against the role that bypasses RLS ───────────────────────────────
-- The service role ignores every policy, so this is the assertion that actually
-- proves append-only. It passes because the guard is a trigger, not a policy.

RESET ROLE;

DO $$
DECLARE deleted_ok BOOLEAN := FALSE; updated_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    DELETE FROM public.audit_log WHERE TRUE;
  EXCEPTION WHEN OTHERS THEN
    deleted_ok := TRUE;
  END;
  PERFORM pg_temp.assert(deleted_ok,
    'NOBODY can DELETE from audit_log — not even the service role');

  BEGIN
    UPDATE public.audit_log SET action = 'tampered' WHERE TRUE;
  EXCEPTION WHEN OTHERS THEN
    updated_ok := TRUE;
  END;
  PERFORM pg_temp.assert(updated_ok,
    'NOBODY can UPDATE audit_log — not even the service role');
END $$;

-- ── The audit trigger actually fired ─────────────────────────────────────────
SELECT pg_temp.assert(
  (SELECT count(*) FROM public.audit_log
    WHERE entity_type = 'orders'
      AND entity_id = 'aaaaaaaa-0000-0000-0000-000000000004') >= 1,
  'inserting an order wrote an audit row');

SELECT pg_temp.assert(
  (SELECT count(*) FROM public.audit_log WHERE entity_type = 'products') >= 1,
  'inserting a product wrote an audit row');

SELECT 'ALL TESTS PASSED' AS result;

ROLLBACK;
