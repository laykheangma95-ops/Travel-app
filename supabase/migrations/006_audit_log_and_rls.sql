-- ═══════════════════════════════════════════════════════════════════════════
-- 006 — Audit log + RLS (CLAUDE.md §5 Step 2)
--
-- Requires 005 to have been applied first: it references `orders`, `products`,
-- `refunds` and the enums created there.
--
-- WHAT THIS DOES NOT DO, AND WHY:
--
--   It does not loosen a single existing policy. Every policy below is either
--   on a table created in 005 (which had none — default deny) or an ADDITIONAL
--   permissive policy on a live table. The customer-facing policies that let
--   someone read their own order are untouched, so the public site cannot
--   regress from this file.
--
--   It does not give `support` access to orders or refunds. CLAUDE.md §3 says
--   it should; docs/LOCKED.md and docs/STAFF-ROLES.md say it deliberately does
--   not, because the order list is the customer contact dataset. That conflict
--   (§12 #3) is the owner's to resolve on that specific change, and a general
--   go-ahead is explicitly not authorisation. Shipped behaviour stands.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The role vocabulary ───────────────────────────────────────────────────
--
-- §3 wants owner/ops/support/finance/content/developer. Shipped was
-- viewer/support/ops/finance/admin. Widening the CHECK adds the missing roles
-- without an UPDATE against live staff rows: `admin` stays valid forever as the
-- deprecated spelling of `owner`, so nobody is renamed and nobody is locked out.

ALTER TABLE public.staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;

ALTER TABLE public.staff_users ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('viewer', 'support', 'ops', 'finance', 'content', 'developer', 'owner', 'admin'));

-- ── 2. Role helpers ──────────────────────────────────────────────────────────
--
-- SECURITY DEFINER because staff_users' own RLS restricts a caller to their own
-- row; a policy calling this needs to resolve the role regardless of which
-- table is being read. STABLE so the planner calls it once per statement.
--
-- Note what these functions cannot see: the ADMIN_EMAIL break-glass allowlist
-- is application configuration, not data, so the owner's emergency access works
-- through the service role (which bypasses RLS entirely) rather than through
-- these helpers. That is the intended split — see lib/staff.ts.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
    FROM public.staff_users
   WHERE user_id = auth.uid()
     AND is_active = TRUE
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_role() IS
  'The caller''s staff role, or NULL if they are not active staff. Deactivated '
  'accounts resolve to NULL, so revoking access is immediate rather than '
  'waiting for a session to expire.';

CREATE OR REPLACE FUNCTION public.current_user_is(VARIADIC roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = ANY(roles), FALSE);
$$;

-- `owner` and `admin` are the same authority under two names, so every policy
-- that means "the owner" has to accept both. This function is the one place
-- that knows it.
CREATE OR REPLACE FUNCTION public.current_user_is_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is('owner', 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is(TEXT[])    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_owner()    TO authenticated, service_role;

-- ── 3. audit_log ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor  ON public.audit_log(actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_time   ON public.audit_log(created_at DESC);

COMMENT ON TABLE public.audit_log IS
  'Append-only record of every change to orders, order_items, refunds, products '
  'and profiles. Contains customer contact details inside before/after for order '
  'rows, which is why it is readable by the owner alone — see the note in 006.';

-- ── 4. Append-only, enforced twice ───────────────────────────────────────────
--
-- Rule 5 says no UPDATE or DELETE policy for any role, including owner. RLS
-- alone is not enough to keep that promise: the service role BYPASSES RLS, and
-- every server write in this codebase uses the service role. A missing policy
-- would stop a signed-in user and nothing else.
--
-- A trigger is not bypassable by the service role. So the guarantee is a
-- trigger, and the absent policies are the second layer.

CREATE OR REPLACE FUNCTION public.audit_log_is_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log is append-only (CLAUDE.md §2 rule 5). % is not permitted on this table.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_is_immutable();

DROP TRIGGER IF EXISTS audit_log_no_delete ON public.audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_is_immutable();

-- TRUNCATE skips row triggers entirely, so it needs its own statement-level one.
DROP TRIGGER IF EXISTS audit_log_no_truncate ON public.audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_is_immutable();

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Read: owner only. §3 gives "view audit log" to the owner alone, and the
-- before/after payloads carry customer contact data — so this policy is also
-- what keeps the audit log from becoming a second copy of the contact dataset
-- (docs/LOCKED.md). The one role that can read it is the one whose approval
-- that document requires.
DROP POLICY IF EXISTS "audit_log_owner_read" ON public.audit_log;
CREATE POLICY "audit_log_owner_read" ON public.audit_log
  FOR SELECT USING (public.current_user_is_owner());

-- No INSERT policy either: rows arrive from the SECURITY DEFINER trigger below,
-- never from a client.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM anon, authenticated;

-- ── 5. The audit trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_uid   UUID := auth.uid();
  actor_mail  TEXT := NULLIF(auth.jwt() ->> 'email', '');
  entity      TEXT := TG_TABLE_NAME;
  row_id      TEXT;
BEGIN
  -- Server-side work runs under the service role with no JWT, so there is no
  -- actor to name. Recording 'system' is honest; inventing a user is not.
  IF actor_uid IS NULL AND actor_mail IS NULL THEN
    actor_mail := 'system';
  END IF;

  row_id := CASE TG_OP
    WHEN 'DELETE' THEN (to_jsonb(OLD) ->> 'id')
    ELSE (to_jsonb(NEW) ->> 'id')
  END;

  INSERT INTO public.audit_log (
    actor_id, actor_email, actor_role, action, entity_type, entity_id, before, after
  ) VALUES (
    actor_uid,
    actor_mail,
    public.current_user_role(),
    lower(TG_OP),
    entity,
    row_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- AFTER, not BEFORE: an audit row for a change that then failed its own
-- constraints would be a lie. AFTER triggers only fire on statements that stuck.
DROP TRIGGER IF EXISTS orders_audit ON public.orders;
CREATE TRIGGER orders_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS order_items_audit ON public.order_items;
CREATE TRIGGER order_items_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS refunds_audit ON public.refunds;
CREATE TRIGGER refunds_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS products_audit ON public.products;
CREATE TRIGGER products_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS profiles_audit ON public.profiles;
CREATE TRIGGER profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- ── 6. cost_price, and the thing RLS cannot do ───────────────────────────────
--
-- Step 2's acceptance test is "support cannot read cost_price". RLS cannot
-- deliver that: it filters ROWS, not COLUMNS. A policy that lets someone read a
-- product row lets them read every column of it, cost_price included.
--
-- So the guarantee is built from the two mechanisms that can express it:
--
--   1. This view, which simply has no cost column. Anything client-side or
--      public reads products_public and cannot ask for what is not there.
--   2. requirePermission(request, 'cost.view') in the API layer, which is where
--      staff reads actually happen — every admin read goes through the service
--      role, which bypasses RLS anyway, so the route is the real boundary
--      (docs/STAFF-ROLES.md says the same thing about /api/admin/*).
--
-- Writing a policy here and calling cost_price protected would have been the
-- comfortable option and a false one.

CREATE OR REPLACE VIEW public.products_public
WITH (security_invoker = true) AS
  SELECT id, type, sku, name_en, name_km, destination_id,
         retail_price, currency, is_active, sales_paused, created_at, updated_at
    FROM public.products
   WHERE is_active = TRUE
     AND sales_paused = FALSE;

COMMENT ON VIEW public.products_public IS
  'Products without cost_price or supplier_plan_ref. The catalogue the browser '
  'is allowed to see. Never add a cost or supplier column to this view.';

GRANT SELECT ON public.products_public TO anon, authenticated, service_role;

-- ── 7. Policies on the tables created in 005 ─────────────────────────────────
--
-- All nine arrived default-deny. Everything here is a grant, not a loosening.

-- Catalogue: readable by staff who have business with it. `content` gets
-- destinations and nothing else; `developer` appears nowhere by design.
DROP POLICY IF EXISTS "products_staff_read" ON public.products;
CREATE POLICY "products_staff_read" ON public.products
  FOR SELECT USING (public.current_user_is('owner', 'admin', 'ops', 'finance'));

DROP POLICY IF EXISTS "products_write" ON public.products;
CREATE POLICY "products_write" ON public.products
  FOR UPDATE USING (public.current_user_is('owner', 'admin', 'ops'))
  WITH CHECK (public.current_user_is('owner', 'admin', 'ops'));

-- Creating and retiring a product is the owner's, per §3 ("ops: edit only").
DROP POLICY IF EXISTS "products_owner_insert" ON public.products;
CREATE POLICY "products_owner_insert" ON public.products
  FOR INSERT WITH CHECK (public.current_user_is_owner());

-- Named explicitly rather than "any staff": `developer` must reach no
-- production data at all (§3), and `viewer` is a dashboard-only starting point.
-- A predicate of "role IS NOT NULL" would have quietly included both.
DROP POLICY IF EXISTS "destinations_staff_read" ON public.destinations;
CREATE POLICY "destinations_staff_read" ON public.destinations
  FOR SELECT USING (public.current_user_is('owner', 'admin', 'ops', 'finance', 'content'));

DROP POLICY IF EXISTS "destinations_content_write" ON public.destinations;
CREATE POLICY "destinations_content_write" ON public.destinations
  FOR UPDATE USING (public.current_user_is('owner', 'admin', 'content'))
  WITH CHECK (public.current_user_is('owner', 'admin', 'content'));

DROP POLICY IF EXISTS "suppliers_staff_read" ON public.suppliers;
CREATE POLICY "suppliers_staff_read" ON public.suppliers
  FOR SELECT USING (public.current_user_is('owner', 'admin', 'ops', 'finance'));

DROP POLICY IF EXISTS "suppliers_write" ON public.suppliers;
CREATE POLICY "suppliers_write" ON public.suppliers
  FOR ALL USING (public.current_user_is('owner', 'admin', 'ops'))
  WITH CHECK (public.current_user_is('owner', 'admin', 'ops'));

-- Money.
DROP POLICY IF EXISTS "payments_staff_read" ON public.payments;
CREATE POLICY "payments_staff_read" ON public.payments
  FOR SELECT USING (public.current_user_is('owner', 'admin', 'ops', 'finance'));

DROP POLICY IF EXISTS "refunds_staff_read" ON public.refunds;
CREATE POLICY "refunds_staff_read" ON public.refunds
  FOR SELECT USING (public.current_user_is('owner', 'admin', 'ops', 'finance'));

-- Requesting a refund is not approving one. Step 5 puts anything over the cap
-- into pending_approval regardless of who asked, and rule 10 means no code path
-- moves money without a human.
DROP POLICY IF EXISTS "refunds_request" ON public.refunds;
CREATE POLICY "refunds_request" ON public.refunds
  FOR INSERT WITH CHECK (public.current_user_is('owner', 'admin', 'ops'));

-- Deciding a refund is the owner's alone.
DROP POLICY IF EXISTS "refunds_owner_decide" ON public.refunds;
CREATE POLICY "refunds_owner_decide" ON public.refunds
  FOR UPDATE USING (public.current_user_is_owner())
  WITH CHECK (public.current_user_is_owner());

DROP POLICY IF EXISTS "fulfillment_attempts_staff_read" ON public.fulfillment_attempts;
CREATE POLICY "fulfillment_attempts_staff_read" ON public.fulfillment_attempts
  FOR SELECT USING (public.current_user_is('owner', 'admin', 'ops'));

DROP POLICY IF EXISTS "access_grants_owner" ON public.access_grants;
CREATE POLICY "access_grants_owner" ON public.access_grants
  FOR ALL USING (public.current_user_is_owner())
  WITH CHECK (public.current_user_is_owner());

-- `customers` gets NO policy, on purpose. A SELECT policy for support would be
-- exactly the bulk read of the contact dataset that docs/LOCKED.md forbids —
-- one query returning every customer's name, email and phone. Lookups stay
-- service-role only, through /api/admin/support, which resolves ONE customer
-- from an identifier the caller already has. `product_esim_details` likewise
-- stays server-only; it is joined, never browsed.

-- ── 8. Staff reads on the live order tables ──────────────────────────────────
--
-- ADDITIONAL policies. The existing customer-facing ones — a signed-in person
-- reading their own order — are untouched, and Postgres ORs permissive policies
-- together, so nothing a customer could see before is lost.
--
-- `support` is absent from both, which is the §12 #3 conflict left standing.

DROP POLICY IF EXISTS "orders_staff_read" ON public.orders;
CREATE POLICY "orders_staff_read" ON public.orders
  FOR SELECT USING (public.current_user_is('owner', 'admin', 'ops', 'finance'));

DROP POLICY IF EXISTS "order_items_staff_read" ON public.order_items;
CREATE POLICY "order_items_staff_read" ON public.order_items
  FOR SELECT USING (public.current_user_is('owner', 'admin', 'ops', 'finance'));

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   DROP TRIGGER IF EXISTS orders_audit      ON public.orders;
--   DROP TRIGGER IF EXISTS order_items_audit ON public.order_items;
--   DROP TRIGGER IF EXISTS refunds_audit     ON public.refunds;
--   DROP TRIGGER IF EXISTS products_audit    ON public.products;
--   DROP TRIGGER IF EXISTS profiles_audit    ON public.profiles;
--
-- Leave audit_log itself in place: it is the record of what happened, and the
-- immutability triggers mean even this rollback cannot erase it. Dropping the
-- table is a deliberate act that has to be typed out by hand, which is the
-- intent.
-- ═══════════════════════════════════════════════════════════════════════════
