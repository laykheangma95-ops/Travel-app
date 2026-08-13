// GET / PUT /api/notifications/preferences — YOU → Notifications.
//
// Writes through the caller's session client, so RLS guarantees a traveler can
// only ever change their own row. The route validates the shape; the database
// enforces the ownership.

import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { ApiError, ok, readJson, route } from '@/lib/http';
import { requireUser, supabaseFromRequest } from '@/lib/serverAuth';
import {
  PREFERENCE_KEYS,
  defaultPreferences,
  withDefaults,
  type NotificationPreferences,
} from '@/lib/notifications/preferences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    if (!getSupabase()) return ok({ preferences: defaultPreferences, persisted: false });

    const user = await requireUser(request);
    const supabase = supabaseFromRequest(request);
    if (!supabase) return ok({ preferences: defaultPreferences, persisted: false });

    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // No row yet is normal — it means "never opened this screen", and the
    // defaults are what the engine is already using.
    return ok({ preferences: withDefaults(data as Partial<NotificationPreferences> | null) });
  },
  { rateLimit: 'session', name: 'notifications.preferences.get' }
);

// Only the keys that exist may be written. An unknown key is a bug or an
// attempt to set a column that is not a preference, so the body is rejected
// rather than partially applied.
const switchSchema = z.object(
  Object.fromEntries(PREFERENCE_KEYS.map((key) => [key, z.boolean().optional()])) as Record<
    (typeof PREFERENCE_KEYS)[number],
    z.ZodOptional<z.ZodBoolean>
  >
);

const putSchema = switchSchema.extend({
  push_enabled: z.boolean().optional(),
  quiet_hours_start: z.number().int().min(0).max(23).nullable().optional(),
  quiet_hours_end: z.number().int().min(0).max(23).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
});

export const PUT = route(
  async (request) => {
    const user = await requireUser(request);
    const supabase = supabaseFromRequest(request);
    if (!supabase) return ok({ ok: true, persisted: false });

    const parsed = putSchema.strict().safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      throw new ApiError('BAD_REQUEST', 'Those notification settings are not valid.');
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...parsed.data }, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) throw new ApiError('INTERNAL', 'Could not save your notification settings.');

    return ok({ preferences: withDefaults(data as Partial<NotificationPreferences>) });
  },
  { rateLimit: 'notifications', name: 'notifications.preferences.put' }
);
