// ─────────────────────────────────────────────────────────────────────────────
// Turning a staff invitation into an account they can actually sign in with.
//
// THE BUG THIS EXISTS TO FIX:
//   /admin/staff wrote a row to `staff_users` and stopped there. That row is
//   authority, not an account — nothing was created in `auth.users` and no mail
//   was ever sent. The invited person then went to /sign-in with the address
//   they had been given and got:
//
//     · password path  → "Invalid login credentials" (there is no account)
//     · email-code path → Supabase refuses, because sign-in sends
//                         shouldCreateUser: false and there is nobody to sign in
//
//   From their side the panel had "added" them and the login was broken. Adding
//   someone now provisions the account and sends the mail, so the address in
//   the invitation is an address that works.
//
// TWO CASES, BOTH COMMON HERE:
//   1. Brand new address → invite it. Supabase creates the auth user and mails
//      a link; the link lands on /reset-password where they set a password.
//   2. The address already has an account — very likely, because staff buy
//      eSIMs like everyone else. There is nothing to invite: they already have
//      a working password. All that is missing is the link between their auth
//      user and the waiting staff row, so we make it and tell the admin they
//      can sign in right now with the password they already have.
//
// WHY WE LINK user_id OURSELVES:
//   Migration 004 installs an AFTER INSERT trigger on auth.users that attaches
//   a new signup to a waiting staff row, and that still does its job. It cannot
//   help case 2 — the insert happened months ago. `resolveStaff()` matches on
//   user_id and nothing else, so an unlinked row is a staff member who signs in
//   fine and then holds no authority at all.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//   · No listUsers() sweep. Finding one address by paging every user in the
//     project is a bulk read of the customer contact dataset, which
//     docs/LOCKED.md exists to prevent. generateLink resolves exactly one
//     address and returns nothing about anyone else.
//   · No password is ever set here. Staff choose their own on /reset-password.
//   · Nothing in lib/auth.ts or the sign-in pages is touched: this changes how
//     the account comes into existence, not how anyone signs in.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import { appUrl } from './env';
import { log } from './logger';

export type InviteStatus =
  /** New account created and the invitation email sent. */
  | 'invited'
  /** They already had an account; it is now linked and works immediately. */
  | 'linked'
  /** Already linked before we got here — nothing to do. */
  | 'already_linked'
  /** The staff row is saved, but the account/email step failed. */
  | 'email_failed';

export interface InviteResult {
  status: InviteStatus;
  /** Plain-language line for the admin who pressed the button. */
  message: string;
  /** Present on 'email_failed' — the underlying cause, for the admin only. */
  reason?: string;
}

/** Where the invitation link lands. /reset-password is the only page that can set a password. */
function inviteRedirect(): string {
  return `${appUrl()}/reset-password`;
}

function looksAlreadyRegistered(message: string | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return (
    text.includes('already been registered') ||
    text.includes('already registered') ||
    text.includes('already exists') ||
    text.includes('email_exists')
  );
}

/**
 * The id of the auth user behind an email, or null if there is no account.
 *
 * `generateLink` returns the user without sending anything — it hands back a
 * link we then throw away. A magiclink for an address with no account is an
 * error, which is exactly the signal we want, and it never touches more than
 * the single address asked about.
 */
async function findAuthUserId(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (error || !data?.user) return null;
    return data.user.id;
  } catch (cause) {
    log.warn('staff.lookup_failed', { email, cause });
    return null;
  }
}

/** Attaches an auth user to the staff row waiting on that email. */
async function linkStaffRow(
  supabase: SupabaseClient,
  email: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('staff_users')
    .update({ user_id: userId })
    .eq('email', email)
    .is('user_id', null);

  if (error) {
    log.error('staff.link_failed', { email, error });
    return false;
  }
  return true;
}

/**
 * Makes the invited address a sign-in-able account.
 *
 * Call this AFTER the `staff_users` row is written, so the migration-004
 * trigger has a row to attach a brand new signup to.
 *
 * Never throws: the staff row is already saved by this point, and losing that
 * write because an SMTP server was down would be the worse failure. A failed
 * email comes back as `email_failed` with a line the admin can act on.
 */
export async function provisionStaffAccount(
  email: string,
  options: { alreadyLinked?: boolean } = {}
): Promise<InviteResult> {
  const address = email.trim().toLowerCase();

  if (options.alreadyLinked) {
    return {
      status: 'already_linked',
      message: `${address} already has an account and can sign in as usual.`,
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      status: 'email_failed',
      message: `${address} was saved, but no invitation could be sent — Supabase is not configured on this deployment.`,
      reason: 'supabase_unconfigured',
    };
  }

  // Case 2 first. Inviting an address that already has an account fails, and
  // the fix for that failure is a link, not a retry.
  const existingId = await findAuthUserId(supabase, address);
  if (existingId) {
    const linked = await linkStaffRow(supabase, address, existingId);
    return linked
      ? {
          status: 'linked',
          message: `${address} already had an account, so no invitation was needed. They can sign in now with their existing password and will see the panel straight away.`,
        }
      : {
          status: 'email_failed',
          message: `${address} already has an account, but linking it to this staff record failed. Try the change again.`,
          reason: 'link_failed',
        };
  }

  // Case 1: no account yet. Create it and mail the link.
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(address, {
    redirectTo: inviteRedirect(),
  });

  if (error) {
    // A race, or a Supabase version that answers the lookup differently than
    // the invite. Either way the account exists — link it.
    if (looksAlreadyRegistered(error.message)) {
      const raced = await findAuthUserId(supabase, address);
      if (raced && (await linkStaffRow(supabase, address, raced))) {
        return {
          status: 'linked',
          message: `${address} already had an account. It is linked now — they can sign in with their existing password.`,
        };
      }
    }

    log.error('staff.invite_email_failed', { email: address, error });
    return {
      status: 'email_failed',
      // Named plainly: the admin needs to know the person is on the list but
      // has not been told, so they can pass the address on by hand.
      message: `${address} was added, but the invitation email could not be sent. Ask them to create an account at /sign-up using exactly this address — their access will attach automatically.`,
      reason: error.message,
    };
  }

  const newUserId = data?.user?.id;
  if (newUserId) {
    // Belt and braces alongside the trigger. Harmless when it already ran:
    // the update is scoped to rows with a null user_id.
    await linkStaffRow(supabase, address, newUserId);
  }

  log.info('staff.invited', { email: address });
  return {
    status: 'invited',
    message: `Invitation sent to ${address}. They set a password from the link in that email, then sign in normally.`,
  };
}
