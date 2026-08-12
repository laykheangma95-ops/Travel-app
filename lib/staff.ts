// ─────────────────────────────────────────────────────────────────────────────
// Staff roles and permissions.
//
// Authority is a permission, never a job title. Routes ask "may this caller
// export a report", not "is this caller finance" — so adding a role later is a
// line in one table here, and no route changes.
//
// THE ONE RULE WORTH REMEMBERING:
//   `support` does not have `orders.read`.
//
//   That looks like an oversight. It is the point. `orders.read` is the
//   browsable list, and that list carries every customer's name, email and
//   phone. A call-centre agent needs the customer who is on the phone right
//   now, which is `customers.lookup` — an exact-match resolve of an identifier
//   the caller already gave them. Handing them the list instead would make
//   every agent a copy of the contact dataset, which docs/LOCKED.md exists to
//   prevent.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from './supabase';
import { adminEmails } from './env';
import { log } from './logger';

export const STAFF_ROLES = [
  'viewer',
  'support',
  'ops',
  'finance',
  'content',
  'developer',
  'owner',
  /**
   * Deprecated alias of `owner`, kept because live rows carry it. Renaming in
   * place would have meant an UPDATE against production staff rows to fix a
   * word, with a lockout as the failure mode. `owner` is what new grants use;
   * `admin` keeps working forever.
   */
  'admin',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  /** See the dashboard tiles. */
  'dashboard.view',
  /** Browse the order list — includes customer contact details. */
  'orders.read',
  /** Attach an eSIM and mark an order fulfilled. */
  'orders.fulfil',
  /** Cancel or refund. Money leaves the business. */
  'orders.refund',
  /** Resolve ONE customer from an identifier they gave you. Not a list. */
  'customers.lookup',
  /** Download the sales statement. */
  'reports.export',
  /** Configure eSIM suppliers. */
  'suppliers.manage',
  /** Approve affiliates and their commission. */
  'affiliates.manage',
  /** Invite staff and change their roles. */
  'staff.manage',
  /** See cost_price and margin. The supplier's price, not the customer's. */
  'cost.view',
  /** Change a product's price or details. Not create or retire one. */
  'products.edit',
  /** Create, retire and restructure products. */
  'products.manage',
  /** Write Khmer destination content. No orders, no customers, no money. */
  'content.manage',
  /** Read the audit log. Owner only — it is the record of everyone else. */
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role → permissions.
 *
 * `support` and `finance` sit side by side rather than on one ladder, because
 * their needs are opposites: an agent needs customers and no money, a
 * bookkeeper needs money and no customers. Ranking them would force one to
 * carry access it has no business having.
 */
const OWNER_PERMISSIONS: readonly Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  viewer: ['dashboard.view'],

  /**
   * UNCHANGED, deliberately. CLAUDE.md §3 grants support `orders.read` and
   * refunds; this codebase does not, and that gap is a locked-area decision
   * (docs/LOCKED.md, docs/STAFF-ROLES.md) rather than an oversight. Widening it
   * needs the owner's sign-off on that specific change — see CLAUDE.md §12 #3.
   */
  support: ['dashboard.view', 'customers.lookup'],

  ops: [
    'dashboard.view',
    'customers.lookup',
    'orders.read',
    'orders.fulfil',
    'suppliers.manage',
    // §3 gives ops the margin and "edit only" on products: change a price, but
    // not create or retire a product.
    'cost.view',
    'products.edit',
  ],

  finance: ['dashboard.view', 'reports.export', 'cost.view'],

  /** §3: destination content and nothing else. No orders, customers or money. */
  content: ['dashboard.view', 'content.manage'],

  /**
   * §3: "no admin data access; dev/staging only, production read-only logs."
   * An empty list is the honest encoding of that — a developer signing in to
   * production admin gets a dashboard tile and no data.
   */
  developer: [],

  owner: OWNER_PERMISSIONS,

  /** Deprecated alias of owner. Same authority, kept for existing rows. */
  admin: OWNER_PERMISSIONS,
};

/** Shown in the staff screen so the person granting access sees the trade-off. */
export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  viewer: 'Read-only dashboard. A safe starting point for a new hire.',
  support:
    'Call centre. Looks up one customer at a time from an order number, email or phone. Cannot browse the customer list or export anything.',
  ops: 'Fulfilment. Everything support can do, plus the order list, marking orders fulfilled, supplier configuration, product prices and margin.',
  finance:
    'Sales statements and Excel exports. Sees revenue and margin, and no customer contact details at all.',
  content:
    'Khmer destination content. No access to orders, customers, money or suppliers.',
  developer:
    'No access to production data. For engineers who work in dev and staging.',
  owner: 'Full access, including refunds, staff and the audit log. Give this sparingly.',
  admin: 'Full access. Deprecated name for Owner — pick Owner for new people.',
};

/** Roles offered when granting access. `admin` is deprecated, so it is not listed. */
export const ASSIGNABLE_ROLES: readonly StaffRole[] = STAFF_ROLES.filter(
  (role) => role !== 'admin'
);

export function permissionsFor(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHas(role: StaffRole, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

/** The resolved authority of the caller. */
export interface StaffIdentity {
  email: string;
  role: StaffRole;
  permissions: readonly Permission[];
  isActive: boolean;
  mfaEnrolled: boolean;
  /**
   * True when this identity came from the ADMIN_EMAIL allowlist rather than
   * staff_users — the owner's break-glass access.
   */
  viaBootstrap: boolean;
}

export interface StaffRecord {
  id: string;
  email: string;
  fullName: string | null;
  role: StaffRole;
  isActive: boolean;
  mfaEnrolled: boolean;
  hasSignedUp: boolean;
  invitedBy: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

/** True when the email is on the ADMIN_EMAIL break-glass allowlist. */
export function isBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = adminEmails();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

function bootstrapIdentity(email: string): StaffIdentity {
  return {
    email: email.toLowerCase(),
    role: 'admin',
    permissions: permissionsFor('admin'),
    isActive: true,
    // Break-glass access predates any MFA policy on purpose — see requireMfa().
    mfaEnrolled: true,
    viaBootstrap: true,
  };
}

/**
 * Resolves a signed-in user to their authority, or null if they have none.
 *
 * ADMIN_EMAIL wins first and unconditionally. If the staff table is empty,
 * unreachable, or the owner deleted their own row by accident, the owner still
 * gets in. Every other account needs an active row.
 */
export async function resolveStaff(
  userId: string,
  email: string | null | undefined
): Promise<StaffIdentity | null> {
  if (isBootstrapAdmin(email)) {
    return bootstrapIdentity(email!);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('staff_users')
    .select('email, role, is_active, mfa_enrolled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Fail closed. An unreadable staff table must not mean "everyone is admin".
    log.error('staff.resolve_failed', { userId, error });
    return null;
  }

  if (!data) return null;

  const row = data as {
    email: string;
    role: string;
    is_active: boolean;
    mfa_enrolled: boolean;
  };

  if (!isStaffRole(row.role)) {
    log.error('staff.unknown_role', { userId, role: row.role });
    return null;
  }

  return {
    email: row.email,
    role: row.role,
    permissions: permissionsFor(row.role),
    isActive: row.is_active,
    mfaEnrolled: row.mfa_enrolled,
    viaBootstrap: false,
  };
}

/**
 * Whether a second factor is required of staff.
 *
 * Off by default and switched on with STAFF_REQUIRE_MFA=true. Shipping it on
 * would lock out every existing account the moment it deployed; the honest
 * sequence is enrol first, enforce second. The staff screen shows who has
 * enrolled so you can see when it is safe to flip.
 */
export function mfaRequired(): boolean {
  return (process.env.STAFF_REQUIRE_MFA ?? '').trim().toLowerCase() === 'true';
}

/** Records a change of authority. Append-only; failures never block the change. */
export async function recordStaffEvent(event: {
  staffEmail: string;
  eventType: string;
  fromRole?: StaffRole | null;
  toRole?: StaffRole | null;
  actor: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from('staff_events').insert({
    staff_email: event.staffEmail.toLowerCase(),
    event_type: event.eventType,
    from_role: event.fromRole ?? null,
    to_role: event.toRole ?? null,
    actor: event.actor,
    detail: event.detail ?? null,
  });

  if (error) log.warn('staff.event_write_failed', { error });
}
