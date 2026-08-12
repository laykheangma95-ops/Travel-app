'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useSession } from '@/hooks/useSession';
import { cn } from '@/lib/utils';

// Staff management. Every action here re-checks 'staff.manage' server-side;
// this screen only decides what to paint.

// Mirrors lib/staff.ts. Duplicated rather than imported because that module
// reaches for the service-role client, and this is a 'use client' component
// (CLAUDE.md §11). The server is the authority either way — every action here
// re-checks 'staff.manage'.
const ROLES = [
  'viewer',
  'support',
  'ops',
  'finance',
  'content',
  'developer',
  'owner',
  'admin',
] as const;
type Role = (typeof ROLES)[number];

// `admin` is the deprecated name for `owner`. Existing rows still carry it, so
// it stays in ROLES to render, but it is never offered for a new grant.
const ASSIGNABLE_ROLES = ROLES.filter((role) => role !== 'admin');

const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Viewer',
  support: 'Call centre',
  ops: 'Operations',
  finance: 'Finance',
  content: 'Content',
  developer: 'Developer',
  owner: 'Owner',
  admin: 'Administrator (old name for Owner)',
};

const ROLE_BLURB: Record<Role, string> = {
  viewer: 'Read-only dashboard. A safe starting point for a new hire.',
  support:
    'Looks up one customer at a time from an order number, email or phone. Cannot browse the customer list or export anything.',
  ops: 'Everything the call centre can do, plus the order list, marking orders fulfilled, supplier configuration, and product prices.',
  finance: 'Sales statements and Excel exports. Sees revenue and margin, and no customer contact details.',
  content: 'Khmer destination content only. No orders, customers, money or suppliers.',
  developer: 'No access to production data. For engineers working in dev and staging.',
  owner: 'Full access, including refunds, staff and the audit log. Give this sparingly.',
  admin: 'The old name for Owner. Same access. Pick Owner for new people.',
};

const ROLE_TONE: Record<Role, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  viewer: 'neutral',
  support: 'info',
  ops: 'success',
  finance: 'info',
  content: 'info',
  developer: 'neutral',
  owner: 'warning',
  admin: 'warning',
};

interface StaffMember {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
  mfaEnrolled: boolean;
  hasSignedUp: boolean;
  invitedBy: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export default function AdminStaffPage() {
  const { user, viaBootstrap } = useSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('support');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/staff', { credentials: 'include' });
      const payload = (await res.json()) as {
        staff?: StaffMember[];
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(payload.error?.message ?? 'Could not load the staff list.');
      setStaff(payload.staff ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the staff list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setSaving('invite');
      setError(null);
      setNotice(null);
      try {
        const res = await fetch('/api/admin/staff', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, fullName: fullName || undefined, role }),
        });
        const payload = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) throw new Error(payload.error?.message ?? 'Could not add that person.');

        setNotice(
          `${email} added as ${ROLE_LABEL[role]}. They get access once they sign up with that email address.`
        );
        setEmail('');
        setFullName('');
        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not add that person.');
      } finally {
        setSaving(null);
      }
    },
    [email, fullName, role, load]
  );

  const update = useCallback(
    async (member: StaffMember, patch: { role?: Role; isActive?: boolean }) => {
      setSaving(member.email);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch('/api/admin/staff', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: member.email, ...patch }),
        });
        const payload = (await res.json()) as { error?: { message?: string } };
        if (!res.ok) throw new Error(payload.error?.message ?? 'Could not apply that change.');
        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not apply that change.');
      } finally {
        setSaving(null);
      }
    },
    [load]
  );

  const isSelf = (member: StaffMember) =>
    member.email.toLowerCase() === (user?.email ?? '').toLowerCase();

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-accent" size={20} aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Staff &amp; access</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              Add someone by the email address they will sign in with. They pick up their access
              automatically the first time they sign up with it — there is no separate staff login.
            </p>
            {viaBootstrap && (
              <p className="mt-2 rounded-btn bg-amber-50 px-3 py-2 text-xs text-amber-900">
                You are signed in through the <code>ADMIN_EMAIL</code> override rather than a staff
                record. That access always works, which is why it exists — but add yourself below so
                your actions are attributed to a real row.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-ink">Add a staff member</h3>
        <form onSubmit={invite} className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-secondary">Email address</span>
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="agent@domnerapp.com"
              />
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-secondary">Name (optional)</span>
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Sokha"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-ink-secondary">Access level</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ASSIGNABLE_ROLES.map((option) => (
                <label
                  key={option}
                  className={cn(
                    'cursor-pointer rounded-card border p-3 transition-colors',
                    role === option
                      ? 'border-secondary bg-surface-2'
                      : 'border-line hover:border-secondary'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value={option}
                      checked={role === option}
                      onChange={() => setRole(option)}
                      className="accent-secondary"
                    />
                    <span className="text-sm font-medium text-ink">{ROLE_LABEL[option]}</span>
                  </span>
                  <span className="mt-1 block pl-6 text-xs text-ink-secondary">
                    {ROLE_BLURB[option]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" disabled={saving === 'invite' || !email.trim()}>
            {saving === 'invite' ? (
              <>
                <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                Adding…
              </>
            ) : (
              <>
                <UserPlus size={16} aria-hidden="true" />
                Add staff member
              </>
            )}
          </Button>
        </form>
      </Card>

      {(error || notice) && (
        <div
          role="status"
          className={cn(
            'rounded-btn border px-4 py-3 text-sm',
            error
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          )}
        >
          {error ?? notice}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h3 className="text-sm font-semibold text-ink">
            Team {staff.length > 0 && <span className="text-ink-secondary">({staff.length})</span>}
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-10" aria-busy="true">
            <Loader2 className="animate-spin text-ink-muted" size={20} aria-label="Loading" />
          </div>
        ) : staff.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-ink-secondary">
            No staff records yet. You are getting in through <code>ADMIN_EMAIL</code>.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {staff.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-sm font-medium text-ink">
                    {member.fullName ?? member.email}
                    {isSelf(member) && <span className="ml-2 text-xs text-ink-secondary">(you)</span>}
                  </p>
                  <p className="text-xs text-ink-secondary">{member.email}</p>
                  <p className="mt-1 flex flex-wrap gap-2 text-xs text-ink-secondary">
                    {!member.hasSignedUp && <span>Invited — not signed up yet</span>}
                    {member.hasSignedUp && !member.mfaEnrolled && <span>No second factor</span>}
                  </p>
                </div>

                <Badge tone={member.isActive ? ROLE_TONE[member.role] : 'neutral'}>
                  {ROLE_LABEL[member.role]}
                </Badge>

                {!member.isActive && <Badge tone="danger">Deactivated</Badge>}

                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${member.id}`}>
                    Role for {member.email}
                  </label>
                  <select
                    id={`role-${member.id}`}
                    value={member.role}
                    disabled={isSelf(member) || saving === member.email}
                    onChange={(event) => void update(member, { role: event.target.value as Role })}
                    className="rounded-btn border border-line bg-white px-3 py-2 text-sm text-ink disabled:opacity-50"
                  >
                    {ASSIGNABLE_ROLES.map((option) => (
                      <option key={option} value={option}>
                        {ROLE_LABEL[option]}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="secondary"
                    disabled={isSelf(member) || saving === member.email}
                    onClick={() => void update(member, { isActive: !member.isActive })}
                  >
                    {member.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
