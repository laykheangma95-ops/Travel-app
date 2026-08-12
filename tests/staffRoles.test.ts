import { afterEach, describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  isBootstrapAdmin,
  isStaffRole,
  mfaRequired,
  permissionsFor,
  roleHas,
  type Permission,
  type StaffRole,
} from '@/lib/staff';

// The regression this file exists to prevent: someone widens a role because a
// screen was inconvenient, and the call centre quietly gains the ability to
// export the customer list.

const ORIGINAL_ADMIN = process.env.ADMIN_EMAIL;
const ORIGINAL_MFA = process.env.STAFF_REQUIRE_MFA;

afterEach(() => {
  process.env.ADMIN_EMAIL = ORIGINAL_ADMIN;
  process.env.STAFF_REQUIRE_MFA = ORIGINAL_MFA;
});

describe('the role matrix', () => {
  it('gives every role an entry', () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('grants admin every permission', () => {
    expect([...permissionsFor('admin')].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('never grants a permission that is not in the permission list', () => {
    for (const role of STAFF_ROLES) {
      for (const permission of permissionsFor(role)) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });
});

describe('call centre containment', () => {
  it('lets support look up a single customer', () => {
    expect(roleHas('support', 'customers.lookup')).toBe(true);
  });

  it('does NOT let support browse the order list', () => {
    // orders.read is the browsable list, and it carries every customer's name,
    // email and phone. Granting it to support would make each agent a copy of
    // the contact dataset. See docs/LOCKED.md.
    expect(roleHas('support', 'orders.read')).toBe(false);
  });

  it('does NOT let support export the sales statement', () => {
    expect(roleHas('support', 'reports.export')).toBe(false);
  });

  it('does NOT let support refund, manage suppliers, or manage staff', () => {
    expect(roleHas('support', 'orders.refund')).toBe(false);
    expect(roleHas('support', 'suppliers.manage')).toBe(false);
    expect(roleHas('support', 'staff.manage')).toBe(false);
  });
});

describe('finance containment', () => {
  it('can export the statement', () => {
    expect(roleHas('finance', 'reports.export')).toBe(true);
  });

  it('cannot reach customer contact data at all', () => {
    // A bookkeeper needs money, not customers. This is why finance is not
    // ranked above or below support — their needs are opposites.
    expect(roleHas('finance', 'customers.lookup')).toBe(false);
    expect(roleHas('finance', 'orders.read')).toBe(false);
  });

  it('cannot move money out or change fulfilment', () => {
    expect(roleHas('finance', 'orders.refund')).toBe(false);
    expect(roleHas('finance', 'orders.fulfil')).toBe(false);
  });
});

describe('ops', () => {
  it('can fulfil orders and configure suppliers', () => {
    expect(roleHas('ops', 'orders.fulfil')).toBe(true);
    expect(roleHas('ops', 'suppliers.manage')).toBe(true);
    expect(roleHas('ops', 'orders.read')).toBe(true);
  });

  it('cannot refund or manage staff — those stay with admin', () => {
    expect(roleHas('ops', 'orders.refund')).toBe(false);
    expect(roleHas('ops', 'staff.manage')).toBe(false);
  });
});

describe('viewer', () => {
  it('can see the dashboard and nothing else', () => {
    expect(permissionsFor('viewer')).toEqual(['dashboard.view']);
  });
});

// `owner` and `admin` are one authority under two names — `admin` is the
// deprecated spelling kept alive because live staff rows carry it. Both, and
// only both, hold the dangerous permissions.
const OWNER_ROLES = ['owner', 'admin'];

describe('only the owner manages staff', () => {
  it('holds staff.manage for the owner alone', () => {
    const holders = STAFF_ROLES.filter((role) => roleHas(role, 'staff.manage'));
    expect(holders).toEqual(OWNER_ROLES);
  });

  it('holds orders.refund for the owner alone', () => {
    const holders = STAFF_ROLES.filter((role) => roleHas(role, 'orders.refund'));
    expect(holders).toEqual(OWNER_ROLES);
  });

  it('holds audit.read for the owner alone', () => {
    const holders = STAFF_ROLES.filter((role) => roleHas(role, 'audit.read'));
    expect(holders).toEqual(OWNER_ROLES);
  });
});

describe('the roles added for CLAUDE.md §3', () => {
  it('gives content destination copy and nothing else', () => {
    expect(permissionsFor('content')).toEqual(['dashboard.view', 'content.manage']);
  });

  it('gives developer no access to production data at all', () => {
    expect(permissionsFor('developer')).toEqual([]);
  });

  it('keeps support out of orders and refunds', () => {
    // The §12 #3 conflict, pinned. CLAUDE.md §3 would grant both; docs/LOCKED.md
    // is why this codebase does not. Changing this test is the deliberate act
    // that reverses that decision — it should never happen incidentally.
    expect(roleHas('support', 'orders.read')).toBe(false);
    expect(roleHas('support', 'orders.refund')).toBe(false);
    expect(roleHas('support', 'cost.view')).toBe(false);
  });

  it('gives ops the margin and price edits, but not product creation', () => {
    expect(roleHas('ops', 'cost.view')).toBe(true);
    expect(roleHas('ops', 'products.edit')).toBe(true);
    expect(roleHas('ops', 'products.manage')).toBe(false);
  });
});

describe('isStaffRole', () => {
  it('accepts the known roles and rejects anything else', () => {
    expect(isStaffRole('support')).toBe(true);
    expect(isStaffRole('superuser')).toBe(false);
    expect(isStaffRole('')).toBe(false);
  });
});

describe('isBootstrapAdmin', () => {
  it('recognises an allowlisted email, case- and space-insensitively', () => {
    process.env.ADMIN_EMAIL = 'Owner@Domner.com, second@domner.com';

    expect(isBootstrapAdmin('owner@domner.com')).toBe(true);
    expect(isBootstrapAdmin('  SECOND@domner.com ')).toBe(true);
    expect(isBootstrapAdmin('someone@else.com')).toBe(false);
  });

  it('fails closed when the allowlist is empty', () => {
    // A fresh deploy with no ADMIN_EMAIL must not have a wide-open panel.
    process.env.ADMIN_EMAIL = '';
    expect(isBootstrapAdmin('anyone@domner.com')).toBe(false);
  });

  it('returns false for a missing email rather than throwing', () => {
    process.env.ADMIN_EMAIL = 'owner@domner.com';
    expect(isBootstrapAdmin(null)).toBe(false);
    expect(isBootstrapAdmin(undefined)).toBe(false);
  });
});

describe('mfaRequired', () => {
  it('is off unless explicitly switched on', () => {
    // Shipping this on would lock out every existing account on deploy.
    delete process.env.STAFF_REQUIRE_MFA;
    expect(mfaRequired()).toBe(false);

    process.env.STAFF_REQUIRE_MFA = 'false';
    expect(mfaRequired()).toBe(false);
  });

  it('turns on for the literal string true', () => {
    process.env.STAFF_REQUIRE_MFA = 'TRUE';
    expect(mfaRequired()).toBe(true);
  });
});

describe('permission naming', () => {
  it('keeps every permission in a scope.action shape', () => {
    for (const permission of PERMISSIONS as readonly Permission[]) {
      expect(permission).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });

  it('escalates monotonically from viewer to admin along the ops ladder', () => {
    const ladder: StaffRole[] = ['viewer', 'support', 'ops'];
    for (let i = 1; i < ladder.length; i += 1) {
      const lower = permissionsFor(ladder[i - 1]!);
      const higher = permissionsFor(ladder[i]!);
      for (const permission of lower) {
        expect(higher).toContain(permission);
      }
    }
  });
});
