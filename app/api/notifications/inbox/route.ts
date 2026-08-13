// ─────────────────────────────────────────────────────────────────────────────
// The Domner Inbox.
//
//   GET   — the caller's notifications, newest first, already grouped by day
//   PATCH — mark one, or all, as read
//
// Reads through the caller's session client so RLS is the boundary, not this
// route's own filtering. Expired cards are dropped from the response rather than
// deleted: an expired boarding call is noise today but still useful history if
// anyone ever needs to explain what a traveler was told.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    if (!getSupabase()) return ok({ notifications: [], unread: 0, unconfigured: true });

    const user = await requireUser(request);
    const supabase = supabaseFromRequest(request);
    if (!supabase) return ok({ notifications: [], unread: 0 });

    const url = new URL(request.url);
    const categoryParam = url.searchParams.get('category');
    const category =
      categoryParam && (NOTIFICATION_CATEGORIES as readonly string[]).includes(categoryParam)
        ? categoryParam
        : null;

    let query = supabase
      .from('notifications')
      .select(
        'id, category, kind, level, title, body, deep_link, entity_type, entity_id, metadata, read_at, created_at, expires_at'
      )
      .eq('user_id', user.id)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(80);

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw new ApiError('INTERNAL', 'Could not load your updates.');

    const notifications = data ?? [];
    const unread = notifications.filter((row) => row.read_at === null).length;

    return ok({ notifications, unread });
  },
  { rateLimit: 'session', name: 'notifications.inbox' }
);

const patchSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ all: z.literal(true) }),
]);

export const PATCH = route(
  async (request) => {
    const user = await requireUser(request);
    const supabase = supabaseFromRequest(request);
    if (!supabase) return ok({ ok: true, persisted: false });

    const parsed = patchSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Send an id, or all: true.');

    const readAt = new Date().toISOString();
    let query = supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', user.id)
      .is('read_at', null);

    if ('id' in parsed.data) query = query.eq('id', parsed.data.id);

    const { error } = await query;
    if (error) throw new ApiError('INTERNAL', 'Could not update your updates.');

    return ok({ ok: true, readAt });
  },
  { rateLimit: 'notifications', name: 'notifications.mark_read' }
);
