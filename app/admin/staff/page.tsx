'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useSession } from '@/hooks/useSession';
import { cn } from '@/lib/utils';

// Staff management. Every action here re-checks 'staff.manage' server-side;
// this screen only decides what to paint.

const ROLES = ['viewer', 'support', 'ops', 'finance', 'admin'] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Viewer',
  support: 'Call centre',
  ops: 'Operations',
  finance: 'Finance',
  admin: 'Administrator',
};

const ROLE_BLURB: Record<Role, string> = {
  viewer: 'Read-only dashboard. A safe starting point for a new hire.',
  support:
    'Looks up one customer at a time from an order number, email or phone. Cannot browse the customer list or export anything.',
  ops: 'Everything the call centre can do, plus the order list, marking orders fulfilled, and supplier configuration.',
  finance: 'Sales statements and Excel exports. Sees revenue and margin, and no customer contact details.',
  admin: 'Full access, including refunds and managing staff. Give this sparingly.',
};

const ROLE_TONE: Record<Role, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  viewer: 'neutral',
  support: 'info',
  ops: 'success',
  finance: 'info',
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

/** What the server did about the account behind the invitation. */
interface InviteResult {
  status: 'invited' | 'linked' | 'already_linked' | 'email_failed';
  message: string;
}

export default function AdminStaffPage() {
  const { user, viaBootstrap } = useSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // An invitation whose email did not send is not an error — the person is on
  // the team — but it is not a success either. It gets its own tone so it is
  // not mistaken for "done".
  const [warning, setWarning] = useState<string | null>(null);
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
      setWarning(null);
      try {
        const res = await fetch('/api/admin/staff', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, fullName: fullName || undefined, role }),
        });
        const payload = (await res.json()) as {
          invite?: InviteResult;
          error?: { message?: string };
        };
        if (!res.ok) throw new Error(payload.error?.message ?? 'Could not add that person.');

        // The server says what actually happened to the account — invited,
        // linked to one they already had, or saved with no mail sent. Repeating
        // a hopeful sentence of our own here is how the old screen managed to
        // report success for an address that could not sign in.
        const line = `${email} added as ${ROLE_LABEL[role]}.`;
        const detail = payload.invite?.message ?? '';
        if (payload.invite?.status === 'email_failed') {
          setWarning(`${line} ${detail}`.trim());
        } else {
          setNotice(`${line} ${detail}`.trim());
        }

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

  /**
   * Re-send the invitation, or attach an account that was never linked.
   *
   * The second case is the one that looks like nothing is wrong: they sign in
   * successfully and the panel is empty, because authority is matched on the
   * linked account and not on the email address.
   */
  const resendInvite = useCallback(
    async (member: StaffMember) => {
      setSaving(member.email);
      setError(null);
      setNotice(null);
      setWarning(null);
      try {
        const res = await fetch('/api/admin/staff/invite', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: member.email }),
        });
        const payload = (await res.json()) as {
          invite?: InviteResult;
          error?: { message?: string };
        };
        if (!res.ok) {
          throw new Error(payload.error?.message ?? 'Could not send that invitation.');
        }

        const message = payload.invite?.message ?? `Invitation sent to ${member.email}.`;
        if (payload.invite?.status === 'email_failed') setWarning(message);
        else setNotice(message);

        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not send that invitation.');
      } finally {
        setSaving(null);
      }
    },
    [load]
  );

  const update = useCallback(
    async (member: StaffMember, patch: { role?: Role; isActive?: boolean }) => {
      setSaving(member.email);
      setError(null);
      setNotice(null);
      setWarning(null);
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
              Add someone by the email address they will sign in with. We email them an invitation
              and they set their own password from the link — there is no separate staff login, and
              nobody here ever needs to know their password. If they already have an account with
              us, no email is sent: their access simply switches on.
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
              {ROLES.map((option) => (
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

      {(error || warning || notice) && (
        <div
          role="status"
          className={cn(
            'rounded-btn border px-4 py-3 text-sm',
            error
              ? 'border-red-200 bg-red-50 text-red-700'
              : warning
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          )}
        >
          {error ?? warning ?? notice}
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
                    {/* `hasSignedUp` is really "is this row attached to an
                        account". Until it is, this person cannot sign in — so
                        the line says that rather than the softer "invited". */}
                    {!member.hasSignedUp && (
                      <span className="text-amber-700">
                        No account yet — they cannot sign in until they accept the invitation
                      </span>
                    )}
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
                    {ROLES.map((option) => (
                      <option key={option} value={option}>
                        {ROLE_LABEL[option]}
                      </option>
                    ))}
                  </select>

                  {/* Offered for anyone still unattached, not just fresh
                      invitations: every row created before invitations were
                      sent at all is sitting in exactly this state. */}
                  {!member.hasSignedUp && member.isActive && (
                    <Button
                      variant="secondary"
                      disabled={saving === member.email}
                      onClick={() => void resendInvite(member)}
                    >
                      {saving === member.email ? (
                        <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                      ) : (
                        <Mail size={16} aria-hidden="true" />
                      )}
                      Send invitation
                    </Button>
                  )}

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
