'use client';

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE — docs/corner-map-spec.md §5.3, §7.
//
// The venue picker is mandatory and there is no "use my exact location"
// button anywhere on this screen. That absence is the feature: a shot belongs
// to a place, and the only way to say which place is to name it.
//
// The client also converts HEIC before upload, because sharp's prebuilt
// libvips can't decode it. That is a convenience, not a safety boundary — the
// EXIF strip that matters happens server-side in lib/corner-map/image.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Check, Search, ShieldCheck } from 'lucide-react';
import { DEFAULT_RADIUS_M, fetchNearbyCorners, searchCorners } from '@/lib/corner-map/api';
import { cornerName } from '@/lib/corner-map/format';
import type { CornerWithHeat } from '@/lib/corner-map/types';
import { getSupabase } from '@/lib/supabase';
import { useLang } from '@/lib/i18n';

const FALLBACK: [number, number] = [104.9282, 11.5564]; // Phnom Penh
const CAPTION_MAX = 140;

type Phase = 'pick' | 'compose' | 'posting' | 'done' | 'held';

/** Matches MAX_EDGE in lib/corner-map/image.ts — the server resizes to the
 *  same bound, so sending anything larger is pure upload time. */
const MAX_EDGE = 1600;

/**
 * Downscale and re-encode to WebP in the browser, before upload.
 *
 * Two reasons, both load-bearing:
 *  1. Vercel rejects request bodies over ~4.5 MB at the platform edge, and a
 *     modern phone photo is routinely 3–8 MB. Uploading originals would 413
 *     with no error message we control.
 *  2. This is a Cambodian mobile audience. A 1600px WebP is a few hundred KB
 *     instead of several MB, which is the difference between posting a shot
 *     and giving up on it.
 *
 * It also handles HEIC, which sharp's prebuilt libvips cannot decode — Safari
 * decodes it natively into the canvas here. None of this is a safety boundary:
 * the EXIF strip that counts still happens server-side, unconditionally.
 */
async function normalizeForUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85)
  );
  if (!blob) throw new Error('encode-failed');

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
    type: 'image/webp',
  });
}

export default function CapturePage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [nearby, setNearby] = useState<CornerWithHeat[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CornerWithHeat[] | null>(null);
  const [corner, setCorner] = useState<CornerWithHeat | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setSignedIn(false);
      return;
    }
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  // Nearest corners for the picker. The coordinate is used to *rank venues*
  // and is never uploaded with the shot.
  useEffect(() => {
    const load = ([lng, lat]: [number, number]) =>
      fetchNearbyCorners(lat, lng, DEFAULT_RADIUS_M)
        .then(setNearby)
        .catch(() => setNearby([]));

    if (!navigator.geolocation) {
      void load(FALLBACK);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => void load([pos.coords.longitude, pos.coords.latitude]),
      () => void load(FALLBACK),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
    );
  }, []);

  // Debounced venue search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const id = setTimeout(() => {
      searchCorners(q)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const venues = results ?? nearby;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError(null);
    try {
      const normalized = await normalizeForUpload(picked);
      setFile(normalized);
      setPreview(URL.createObjectURL(normalized));
      // The client clock at capture, per §4. `lastModified` is when the photo
      // was taken for a library pick; a fresh camera shot is effectively now.
      setCapturedAt(new Date(Math.min(picked.lastModified || Date.now(), Date.now())));
      setPhase('compose');
    } catch {
      setError(t('corner.capture.failed'));
    }
  };

  const post = async () => {
    if (!file || !corner) return;
    const supabase = getSupabase();
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setError(t('corner.capture.signIn'));
      return;
    }

    setPhase('posting');
    setError(null);

    const body = new FormData();
    body.append('file', file);
    body.append('corner_id', corner.id);
    body.append('captured_at', (capturedAt ?? new Date()).toISOString());
    if (caption.trim()) body.append('caption', caption.trim());

    try {
      const res = await fetch('/api/corner/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(
          json.error === 'capture-not-allowed'
            ? t('corner.capture.minor')
            : t('corner.capture.failed')
        );
        setPhase('compose');
        return;
      }

      // §7: held shots get the prompt, not a silent success.
      if (json.held) {
        setPhase('held');
        return;
      }
      setPhase('done');
      router.push('/map');
    } catch {
      setError(t('corner.capture.failed'));
      setPhase('compose');
    }
  };

  const canPost = Boolean(file && corner) && phase !== 'posting';

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-dusk px-4 pb-10 pt-4">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/map"
          aria-label={t('corner.back')}
          className="rounded-full bg-slab p-2.5 text-paper"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <h1 className="corner-label font-corner-display text-lg text-paper">
          {t('corner.capture')}
        </h1>
      </header>

      {signedIn === false && (
        <p className="corner-label mb-4 rounded-xl bg-slab px-4 py-3 text-sm text-dust">
          {t('corner.capture.signIn')}
        </p>
      )}

      {phase === 'held' ? (
        // The §7 prompt, verbatim. Not an error — a redirection.
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <p className="corner-label max-w-xs text-base text-paper">{t('corner.capture.held')}</p>
          <button
            type="button"
            onClick={() => {
              setPhase('pick');
              setFile(null);
              setPreview(null);
              setCorner(null);
              setCaption('');
            }}
            className="corner-label rounded-xl bg-paper px-5 py-3 text-sm text-dusk"
          >
            {t('corner.capture.retake')}
          </button>
        </div>
      ) : (
        <>
          {/* ── The photo ────────────────────────────────────────────── */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="sr-only"
          />

          {preview ? (
            <div className="relative mb-3 overflow-hidden rounded-2xl bg-slab">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img src={preview} alt="" className="max-h-[46vh] w-full object-cover" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mb-3 flex aspect-[4/5] max-h-[46vh] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ash/40 bg-slab text-ash"
            >
              <Camera size={28} aria-hidden="true" />
              <span className="corner-label px-6 text-center text-sm">
                {t('corner.capture.choose')}
              </span>
            </button>
          )}

          {preview && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="corner-label mb-5 self-start text-xs text-ash underline underline-offset-4"
            >
              {t('corner.capture.retake')}
            </button>
          )}

          {/* ── The venue picker. Required. ──────────────────────────── */}
          <section className="mb-5">
            <h2 className="corner-label mb-1 text-sm font-medium text-paper">
              {t('corner.capture.venue')}
            </h2>
            <p className="corner-label mb-3 text-xs text-ash">{t('corner.capture.venueHint')}</p>

            <div className="mb-2 flex items-center gap-2 rounded-xl bg-slab px-3 py-2.5">
              <Search size={16} className="shrink-0 text-ash" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('corner.capture.venueSearch')}
                aria-label={t('corner.capture.venueSearch')}
                className="min-w-0 flex-1 bg-transparent text-sm text-paper placeholder:text-ash focus:outline-none"
              />
            </div>

            {venues.length === 0 ? (
              <p className="corner-label px-1 py-3 text-sm text-ash">
                {t('corner.capture.noVenues')}
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto rounded-xl bg-slab/60">
                {venues.map((c) => {
                  const name = cornerName(c, lang);
                  const chosen = corner?.id === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setCorner(c)}
                        aria-pressed={chosen}
                        className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                          chosen ? 'bg-paper/10' : 'hover:bg-dusk/50'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            lang={name.primaryLang}
                            className="corner-label block text-sm text-paper"
                          >
                            {name.primary}
                          </span>
                          {name.secondary && (
                            <span
                              lang={name.secondaryLang}
                              className="corner-label block text-xs text-ash"
                            >
                              {name.secondary}
                            </span>
                          )}
                        </span>
                        {chosen && <Check size={16} className="shrink-0 text-live" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Caption ──────────────────────────────────────────────── */}
          <section className="mb-5">
            <label
              htmlFor="corner-caption"
              className="corner-label mb-1 block text-sm font-medium text-paper"
            >
              {t('corner.capture.caption')}
            </label>
            <textarea
              id="corner-caption"
              value={caption}
              maxLength={CAPTION_MAX}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              placeholder={t('corner.capture.captionOptional')}
              className="w-full resize-none rounded-xl bg-slab px-3 py-2.5 text-sm text-paper placeholder:text-ash focus:outline-none"
            />
            <p className="corner-label mt-1 text-right text-xs text-ash" lang="en">
              {caption.length}/{CAPTION_MAX}
            </p>
          </section>

          {/* Say plainly what happens to the file. */}
          <p className="corner-label mb-4 flex items-start gap-2 text-xs text-ash">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {t('corner.capture.exifNote')}
          </p>

          {error && (
            <p role="alert" className="corner-label mb-3 text-sm text-clay">
              {error}
            </p>
          )}

          {!corner && file && (
            <p className="corner-label mb-3 text-sm text-dust">
              {t('corner.capture.venueRequired')}
            </p>
          )}

          <button
            type="button"
            onClick={post}
            disabled={!canPost}
            className="corner-label w-full rounded-xl bg-paper px-4 py-4 text-sm font-medium text-dusk transition-opacity disabled:opacity-40"
          >
            {phase === 'posting' ? t('corner.capture.posting') : t('corner.capture.post')}
          </button>
        </>
      )}
    </div>
  );
}
