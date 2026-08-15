'use client';

// ─────────────────────────────────────────────────────────────────────────────
// MEMORIES — what actually happened on one trip.
//
// Real rows from `trip_memories`, and nothing else. The previous version of this
// screen was entirely fictional: six fixed emoji moments, a fixed set of trip
// statistics, and three buttons (Upload photos, Download as image, Share) that
// had no handlers at all.
//
// Photos are deliberately absent rather than stubbed. There is no storage bucket
// in this project, so an "Upload photos" button could only ever be decoration —
// and a decorative button is the thing this screen is being fixed for. A written
// note needs no bucket, so that is what it offers. When storage exists, the
// `photoUrl` field is already carried through the API and rendered below.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, Check, Copy, Loader2, MapPin, Share2, Trash2 } from 'lucide-react';
import type { TripSummary } from '@/lib/travel/state';
import { SignInLink } from '@/components/ui/SignInLink';
import { useLang } from '@/lib/i18n';

interface TripMemory {
  id: string;
  caption: string;
  location: string | null;
  takenAt: string | null;
  photoUrl: string | null;
}

const CAPTION_MAX = 280;
const LOCATION_MAX = 120;

type Status = 'loading' | 'guest' | 'missing' | 'offline' | 'ready';

export function MemoriesView({ tripId }: { tripId: string }) {
  const { lang } = useLang();
  const [status, setStatus] = useState<Status>('loading');
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [memories, setMemories] = useState<TripMemory[]>([]);
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tripsResponse, memoriesResponse] = await Promise.all([
        fetch(`/api/travel/trips/${tripId}`, { credentials: 'include' }),
        fetch(`/api/travel/trips/${tripId}/memories`, { credentials: 'include' }),
      ]);

      if (tripsResponse.status === 401) {
        setStatus('guest');
        return;
      }

      const tripsBody = (await tripsResponse.json().catch(() => null)) as { trip?: TripSummary } | null;
      if (!tripsResponse.ok || !tripsBody?.trip) {
        setStatus('missing');
        return;
      }
      setTrip(tripsBody.trip);

      const memoriesBody = (await memoriesResponse.json().catch(() => null)) as
        | { memories?: TripMemory[] }
        | null;
      setMemories(memoriesBody?.memories ?? []);
      setStatus('ready');
    } catch {
      // A failed fetch is a lost connection, not a deleted trip. Saying "we
      // can't find that trip" here would read as data loss.
      setStatus('offline');
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const text = caption.trim();
    if (!text || saving) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/travel/trips/${tripId}/memories`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          caption: text,
          location: place.trim() || null,
          takenAt: new Date().toISOString(),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { memory?: TripMemory; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.memory) {
        throw new Error(body?.error?.message ?? undefined);
      }
      setMemories((current) => [body.memory as TripMemory, ...current]);
      setCaption('');
      setPlace('');
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : lang === 'km'
            ? 'រក្សាទុកមិនបាន។ សូមព្យាយាមម្ដងទៀត។'
            : 'Could not save that note. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const previous = memories;
    setMemories((current) => current.filter((memory) => memory.id !== id));
    try {
      const response = await fetch(`/api/travel/trips/${tripId}/memories`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setMemories(previous);
      setError(
        lang === 'km' ? 'លុបមិនបាន។ សូមព្យាយាមម្ដងទៀត។' : 'Could not remove that note. Please try again.'
      );
    }
  }

  async function copyShareLink() {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/trips/${tripId}`;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(
        lang === 'km'
          ? 'ចម្លងតំណមិនបាន។ សូមចម្លងពី URL ខាងលើ។'
          : 'Could not copy the link. Copy it from the address bar instead.'
      );
    }
  }

  if (status === 'loading') {
    return (
      <Shell>
        <div className="space-y-3" aria-busy="true">
          <div className="h-24 animate-pulse rounded-card border border-white/8 bg-white/[0.03] motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-card border border-white/8 bg-white/[0.03] motion-reduce:animate-none" />
        </div>
      </Shell>
    );
  }

  if (status !== 'ready' || !trip) {
    return (
      <Shell>
        <div className="night-card p-8 text-center">
          <h1 className="font-display text-xl text-white">
            {status === 'guest'
              ? lang === 'km'
                ? 'ចូលគណនីដើម្បីមើលការចងចាំ'
                : 'Sign in to see these memories'
              : status === 'offline'
                ? lang === 'km'
                  ? 'គ្មានការតភ្ជាប់'
                  : "You're offline"
                : lang === 'km'
                  ? 'រកមិនឃើញដំណើរនេះទេ'
                  : "We can't find that trip"}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
            {status === 'guest'
              ? lang === 'km'
                ? 'ការចងចាំត្រូវបានរក្សាទុកក្នុងគណនីរបស់អ្នក។'
                : 'Memories are saved to your account.'
              : status === 'offline'
                ? lang === 'km'
                  ? 'ការចងចាំរបស់អ្នកនៅតែមាន។ សូមព្យាយាមម្ដងទៀតពេលមានអ៊ីនធឺណិត។'
                  : 'Your memories are safe. Try again once you have a connection.'
                : lang === 'km'
                  ? 'វាអាចត្រូវបានលុប ឬជាកម្មសិទ្ធិគណនីផ្សេង។'
                  : 'It may have been deleted, or it belongs to another account.'}
          </p>
          {status === 'guest' ? (
            <SignInLink
              returnTo={`/trips/${tripId}/memories`}
              className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {lang === 'km' ? 'ចូលគណនី' : 'Sign in'}
            </SignInLink>
          ) : status === 'offline' ? (
            <button
              type="button"
              onClick={() => {
                setStatus('loading');
                void load();
              }}
              className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {lang === 'km' ? 'ព្យាយាមម្ដងទៀត' : 'Try again'}
            </button>
          ) : (
            <Link
              href="/trips"
              className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              {lang === 'km' ? 'ដំណើរទាំងអស់' : 'All trips'}
            </Link>
          )}
        </div>
      </Shell>
    );
  }

  const locale = lang === 'km' ? 'km-KH' : 'en-GB';

  return (
    <Shell>
      <Link
        href={`/trips/${tripId}`}
        className="inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        {trip.title}
      </Link>

      <header className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-light">
            {lang === 'km' ? 'ការចងចាំ' : 'Memories'}
          </p>
          <h1 className="mt-1.5 font-display text-3xl leading-tight text-white sm:text-4xl">
            {trip.flag ? `${trip.flag} ` : ''}
            {trip.destination}
          </h1>
          <p className="mt-1.5 font-mono text-sm text-white/60 tabular-nums">
            {memories.length}{' '}
            {lang === 'km' ? 'កំណត់ត្រា' : memories.length === 1 ? 'note' : 'notes'}
          </p>
        </div>
        <button
          type="button"
          onClick={copyShareLink}
          className="inline-flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-btn border border-white/15 px-4 text-sm font-semibold text-white/80 transition-colors duration-200 ease-smooth hover:border-gold-light/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? (lang === 'km' ? 'បានចម្លង' : 'Copied') : lang === 'km' ? 'ចម្លងតំណ' : 'Copy link'}
        </button>
      </header>

      <form onSubmit={save} className="night-card mt-6 space-y-3 p-5">
        <label htmlFor="memory-caption" className="block text-sm font-medium text-white/80">
          {lang === 'km' ? 'កត់ត្រាអ្វីមួយ' : 'Note something down'}
        </label>
        <textarea
          id="memory-caption"
          rows={3}
          maxLength={CAPTION_MAX}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder={
            lang === 'km' ? 'អាហារពេលល្ងាចនៅផ្សារយប់…' : 'Dinner at the night market…'
          }
          className="w-full rounded-btn border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="memory-location"
            type="text"
            maxLength={LOCATION_MAX}
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            aria-label={lang === 'km' ? 'ទីតាំង' : 'Where'}
            placeholder={lang === 'km' ? 'ទីតាំង (ជាជម្រើស)' : 'Where (optional)'}
            className="min-h-[2.75rem] min-w-0 flex-1 rounded-btn border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/35 focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
          />
          <button
            type="submit"
            disabled={!caption.trim() || saving}
            className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] items-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
          >
            {saving && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {lang === 'km' ? 'រក្សាទុក' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-white/40">
          {lang === 'km'
            ? 'ការបញ្ចូលរូបភាពនឹងមកនៅពេលក្រោយ។ ឥឡូវនេះអ្នកអាចកត់ត្រាជាអក្សរ។'
            : 'Photo uploads are not available yet — written notes are.'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>

      {memories.length === 0 ? (
        <div className="night-card mt-4 p-8 text-center">
          <Camera size={22} className="mx-auto text-white/45" aria-hidden="true" />
          <h2 className="mt-3 font-display text-xl text-white">
            {lang === 'km' ? 'មិនទាន់មានការចងចាំ' : 'Nothing saved yet'}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/65">
            {lang === 'km'
              ? 'អ្វីដែលអ្នកកត់ត្រាពេលធ្វើដំណើរនឹងបង្ហាញនៅទីនេះ។'
              : 'Whatever you write down along the way shows up here.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {memories.map((memory) => (
            <li key={memory.id} className="night-card group flex gap-4 p-5">
              {memory.photoUrl ? (
                // Plain <img>, not next/image: photo_url is an arbitrary remote
                // URL and next/image requires every host to be allow-listed in
                // next.config.mjs. There is no storage bucket yet, so this
                // branch is unreachable today — it exists so the column is
                // rendered rather than silently dropped once uploads land.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={memory.photoUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-card object-cover"
                  loading="lazy"
                />
              ) : (
                <span
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-card border border-white/10 bg-white/[0.04]"
                  aria-hidden="true"
                >
                  <MapPin size={18} className="text-white/40" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-white">{memory.caption}</p>
                <p className="mt-1.5 font-mono text-xs text-white/45">
                  {memory.location ? `${memory.location} · ` : ''}
                  {memory.takenAt
                    ? new Date(memory.takenAt).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(memory.id)}
                aria-label={
                  lang === 'km' ? `លុបកំណត់ត្រា៖ ${memory.caption}` : `Delete note: ${memory.caption}`
                }
                className="h-9 w-9 shrink-0 rounded-btn text-white/30 opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger group-hover:opacity-100 motion-reduce:opacity-100"
              >
                <Trash2 size={15} className="mx-auto" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 flex items-center gap-2 text-xs text-white/40">
        <Share2 size={14} aria-hidden="true" />
        {lang === 'km'
          ? 'តំណនេះបើកដំណើររបស់អ្នក។ ការចែករំលែកកម្មវិធីដំណើរជាសាធារណៈធ្វើនៅទំព័រកម្មវិធី។'
          : 'This link opens your trip. To share an itinerary publicly, use the share button on the itinerary itself.'}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">{children}</div>
    </div>
  );
}
