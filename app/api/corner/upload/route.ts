// ═══════════════════════════════════════════════════════════════════════════
// SHOT UPLOAD — docs/corner-map-spec.md §5.3, §7.
//
// The single write path into the shots bucket. Two things are non-negotiable
// and are enforced here rather than in the UI, because a client can always
// lie:
//
//   1. Every image goes through processShot(), which strips EXIF. There is no
//      branch around it.
//   2. Every shot needs a corner_id. An upload without one is rejected — there
//      is deliberately no "use my exact location" path, because a raw
//      coordinate is exactly what this product refuses to store.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  ACCEPTED_TYPES,
  MAX_UPLOAD_BYTES,
  UnsupportedImageError,
  processShot,
} from '@/lib/corner-map/image';
import { detectCaptionLang } from '@/lib/corner-map/format';

// sharp is a native module — this route cannot run on the edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = getSupabaseAdmin();
  if (!url || !anonKey || !admin) return bad('storage-not-configured', 503);

  // ── Identify the poster ────────────────────────────────────────────────
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) return bad('not-signed-in', 401);

  // A user-scoped client, so the shots INSERT below runs under RLS: the
  // policy re-checks auth.uid() = user_id *and* corner_can_capture(), which
  // is what actually enforces the under-18 rule (§7).
  const asUser = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: bearer } },
  });

  const { data: userData, error: userError } = await asUser.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return bad('not-signed-in', 401);

  // ── Read the upload ────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('bad-form');
  }

  const cornerId = String(form.get('corner_id') ?? '').trim();
  // §5.3: the user must pick a venue. No corner, no upload.
  if (!cornerId) return bad('corner-required');

  const file = form.get('file');
  if (!(file instanceof File)) return bad('file-required');
  if (file.size > MAX_UPLOAD_BYTES) return bad('file-too-large', 413);
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) return bad('unsupported-type', 415);

  // The corner has to exist — a client-supplied uuid is not a place.
  const { data: corner } = await admin
    .from('corners')
    .select('id')
    .eq('id', cornerId)
    .maybeSingle();
  if (!corner) return bad('unknown-corner', 404);

  // captured_at comes from the client clock at capture time (§4), not from
  // upload time — a photo taken in a tunnel and posted an hour later is still
  // an hour old. Clamped so a broken clock can't mint a permanently-LIVE shot.
  const rawCaptured = String(form.get('captured_at') ?? '');
  const parsed = rawCaptured ? new Date(rawCaptured) : new Date();
  const now = Date.now();
  const capturedAt = new Date(
    Number.isNaN(parsed.getTime()) ? now : Math.min(parsed.getTime(), now)
  );

  const caption = String(form.get('caption') ?? '').trim().slice(0, 140);

  // ── Strip and re-encode. Unconditional. ────────────────────────────────
  let processed;
  try {
    processed = await processShot(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof UnsupportedImageError) return bad('unsupported-image', 415);
    return bad('processing-failed', 500);
  }

  // ── Store ──────────────────────────────────────────────────────────────
  // Unguessable path, and no user id in it: storage paths get pasted into
  // logs and CDN traces, and a path is not a place to leak who posted what.
  const storagePath = `${cornerId}/${crypto.randomUUID()}.webp`;

  const { error: uploadError } = await admin.storage
    .from('shots')
    .upload(storagePath, processed.webp, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
  if (uploadError) return bad('upload-failed', 500);

  // §7: a face-heavy shot is held out of every feed rather than published and
  // retracted. The author still sees it, with the prompt.
  const status = processed.shouldHold ? 'held' : 'live';

  const { data: shot, error: insertError } = await asUser
    .from('shots')
    .insert({
      corner_id: cornerId,
      user_id: user.id,
      storage_path: storagePath,
      blurhash: processed.blurhash,
      width: processed.width,
      height: processed.height,
      captured_at: capturedAt.toISOString(),
      caption: caption || null,
      caption_lang: caption ? detectCaptionLang(caption) : null,
      status,
    })
    .select('id,corner_id,storage_path,blurhash,width,height,captured_at,caption,caption_lang,status')
    .single();

  if (insertError || !shot) {
    // Don't leave an orphan object in the bucket paying for storage forever.
    await admin.storage.from('shots').remove([storagePath]);
    // The RLS insert policy is also the under-18 gate, so a rejection here is
    // most likely a minor account rather than a malformed row.
    return bad(insertError?.message.includes('row-level security') ? 'capture-not-allowed' : 'insert-failed', 403);
  }

  return NextResponse.json({ shot, held: status === 'held' });
}
