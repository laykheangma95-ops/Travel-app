'use client';

// ─────────────────────────────────────────────────────────────────────────────
// THE ITINERARY EDITOR — the days of a trip, and what is actually in them.
//
// What this screen used to do that it no longer does:
//
//   • Invent times. Every card with no stored time was given one from a
//     four-slot array cycled by position, so the first stop of every day read
//     "10:00 – 12:00" whether or not anyone had said so.
//   • Invent distances. The gap between two stops always read "Walk · 11 min",
//     a hardcoded string, regardless of where the two places actually are.
//     straightLineKm() existed in lib/travel/itinerary.ts and was never called.
//   • Carry six buttons with no click handler at all — including the two
//     largest controls on the screen, "Ask anything…" and "Edit".
//   • Refuse to edit a time, a note or the day a place sits on, although the
//     API has accepted `update` and `move` since it was written.
//   • Reorder by HTML5 drag-and-drop only, which does not fire on touch. On the
//     phone this product is built for, a day's order was fixed at whatever
//     order things were added in.
//   • Share by writing to the clipboard with no toast, no visible link and no
//     way to un-share.
//
// The rule this file now follows: if we do not know something, the screen does
// not say it. A place with no time shows no time and offers to set one.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  BedDouble,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CarFront,
  Copy,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Star,
  TrainFront,
  Trash2,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABEL,
  PLACE_DESCRIPTION_MAX,
  PLACE_NAME_MAX,
  scheduleWarnings,
  type CuratedPlace,
  type ItineraryCategory,
  type ItineraryDay,
  type ItineraryPayload,
  type ItineraryPlace,
  type RouteLeg,
  type RoutedJourney,
  type ScheduleWarning,
} from '@/lib/travel/itinerary';
import { useLang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Tab = 'summary' | 'ideas' | string;
type PickerFilter = 'all' | 'stay' | 'transport' | 'saved' | 'mine';

const CATEGORIES: ItineraryCategory[] = ['spot', 'food', 'shopping', 'transport', 'stay', 'other'];

/**
 * A place added by hand with no coordinates is stored at 0,0 — a real point in
 * the Gulf of Guinea. Treat that as "no location" rather than pinning the map
 * off the coast of Africa.
 */
function hasLocation(place: CuratedPlace): boolean {
  return Number(place.lat) !== 0 || Number(place.lng) !== 0;
}

export function ItineraryEditor({ tripId }: { tripId: string }) {
  const { lang } = useLang();
  const [data, setData] = useState<ItineraryPayload | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [tab, setTab] = useState<Tab>('summary');
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<ItineraryPlace | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [journey, setJourney] = useState<RoutedJourney | null>(null);
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

  const request = useCallback(
    async (body?: Record<string, unknown>) => {
      const response = await fetch(`/api/travel/itinerary/${tripId}`, {
        method: body ? 'PATCH' : 'GET',
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.message ??
            (lang === 'km' ? 'រក្សាទុកមិនបាន។' : 'Could not save that change.')
        );
      }
      setData(result as ItineraryPayload);
      return result as ItineraryPayload;
    },
    [tripId, lang]
  );

  const load = useCallback(() => {
    setLoadState('loading');
    request()
      .then((result) => {
        setTab(result.days[0]?.id ?? 'ideas');
        setLoadState('ready');
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : null);
        setLoadState('error');
      });
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  /** Run a mutation, surfacing failure instead of leaving the screen frozen. */
  const mutate = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const result = await request(body);
        setNotice(mutationSuccess(body.action, lang));
        return result;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : null);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [request]
  );

  const routeDay = data?.days.find((day) => day.id === tab) ?? null;
  useEffect(() => {
    const located = routeDay?.places.filter((item) => hasLocation(item.place)).slice(0, 12) ?? [];
    if (located.length < 2) {
      setJourney(null);
      setRouteState('idle');
      return;
    }
    const controller = new AbortController();
    setJourney(null);
    setRouteState('loading');
    fetch('/api/travel/route', {
      method: 'POST', credentials: 'include', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: located.map((item) => ({
        id: item.id, lat: Number(item.place.lat), lng: Number(item.place.lng),
      })) }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('route unavailable');
        return response.json() as Promise<RoutedJourney>;
      })
      .then((result) => { setJourney(result); setRouteState('ready'); })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setJourney(null);
        setRouteState('unavailable');
      });
    return () => controller.abort();
  }, [routeDay]);

  if (loadState === 'loading') return <EditorSkeleton />;

  if (loadState === 'error' || !data) {
    return (
      <div className="night-canvas relative grid min-h-screen place-items-center px-4">
        <div className="night-stars" aria-hidden="true" />
        <div className="night-card relative max-w-sm p-8 text-center">
          <h1 className="font-display text-xl text-white">
            {lang === 'km' ? 'បើកកម្មវិធីដំណើរមិនបាន' : "We couldn't open this itinerary"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            {error ??
              (lang === 'km'
                ? 'សូមពិនិត្យការតភ្ជាប់របស់អ្នក ហើយព្យាយាមម្ដងទៀត។'
                : 'Check your connection and try again.')}
          </p>
          <button
            type="button"
            onClick={load}
            className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[2.75rem] items-center rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
          >
            {lang === 'km' ? 'ព្យាយាមម្ដងទៀត' : 'Try again'}
          </button>
        </div>
      </div>
    );
  }

  const active = data.days.find((day) => day.id === tab) ?? null;
  const visible = tab === 'ideas' ? data.ideas : (active?.places ?? []);
  // On Summary the map shows the whole trip rather than going blank, which is
  // what it did before when no single day was selected.
  const mapPlaces = tab === 'summary' ? data.days.flatMap((day) => day.places) : visible;
  const dayLabel = (day: ItineraryDay) => formatDay(day.date, day.day_index, lang);
  const targetLabel = tab === 'ideas' ? (lang === 'km' ? 'គំនិត' : 'Ideas') : active ? dayLabel(active) : '';

  const activeWarnings = scheduleWarnings(visible, active?.date ?? null, journey?.legs ?? []);

  const addExisting = async (place: CuratedPlace) => {
    const result =
      tab === 'ideas' || !active
        ? await mutate({ action: 'addIdea', placeId: place.id })
        : await mutate({ action: 'addPlace', dayId: active.id, placeId: place.id });
    if (result) setPicker(false);
  };

  const addCustom = async (draft: CustomDraft) => {
    const result = await mutate({
      action: 'addCustom',
      name: draft.name,
      description: draft.description,
      category: draft.category,
      openingStart: draft.openingStart,
      openingEnd: draft.openingEnd,
      target: tab === 'ideas' || !active ? 'ideas' : active.id,
    });
    if (result) setPicker(false);
  };

  /** Move a place one step up or down within its day. Touch and keyboard safe. */
  const nudge = async (list: ItineraryPlace[], index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (!active || to < 0 || to >= list.length) return;
    const ids = list.map((item) => item.id);
    [ids[index], ids[to]] = [ids[to], ids[index]];
    await mutate({ action: 'reorder', dayId: active.id, placeIds: ids });
  };

  return (
    <div className="night-canvas has-tabbar relative min-h-screen pb-28">
      <div className="night-stars" aria-hidden="true" />

      <div className="relative h-[38svh] min-h-[240px] overflow-hidden">
        <RouteMap places={mapPlaces} journey={tab === 'summary' ? null : journey} destination={data.trip.destination} lang={lang} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 pt-6 sm:px-6">
          <Link
            href={`/trips/${tripId}`}
            aria-label={lang === 'km' ? 'ត្រឡប់ទៅដំណើរ' : 'Back to trip'}
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-primary-deep/70 text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setSharing(true)}
            aria-label={lang === 'km' ? 'ចែករំលែកកម្មវិធីដំណើរ' : 'Share itinerary'}
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-primary-deep/70 text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <Share2 size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <main className="relative z-20 mx-auto -mt-8 max-w-3xl rounded-t-[28px] border-t border-white/10 bg-primary-deep/95 backdrop-blur-xl">
        <div className="mx-auto mt-3 h-1 w-11 rounded-full bg-white/20" aria-hidden="true" />
        <div className="px-5 pb-8 pt-4 sm:px-8">
          <h1 className="font-display text-2xl text-white sm:text-3xl">{data.trip.title}</h1>
          <p className="mt-1.5 flex items-center gap-2 font-mono text-sm text-white/55">
            <CalendarDays size={16} aria-hidden="true" />
            {tripDates(data.trip.start_date, data.trip.end_date, lang)}
            <span aria-hidden="true">·</span>
            {data.days.length || 1} {lang === 'km' ? 'ថ្ងៃ' : data.days.length === 1 ? 'day' : 'days'}
          </p>

          <nav
            className="mt-6 -mx-1 flex items-end gap-5 overflow-x-auto border-b border-white/10 px-1 text-[15px] font-semibold"
            aria-label={lang === 'km' ? 'ថ្ងៃនៃកម្មវិធី' : 'Itinerary days'}
          >
            <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>
              {lang === 'km' ? 'សង្ខេប' : 'Summary'}
            </TabButton>
            {data.days.map((day) => (
              <TabButton key={day.id} active={tab === day.id} onClick={() => setTab(day.id)}>
                {dayLabel(day)}
              </TabButton>
            ))}
            <TabButton active={tab === 'ideas'} onClick={() => setTab('ideas')}>
              {lang === 'km' ? 'គំនិត' : 'Ideas'}
            </TabButton>
            <button
              type="button"
              aria-label={lang === 'km' ? 'បន្ថែមថ្ងៃ' : 'Add a day'}
              disabled={busy}
              onClick={async () => {
                const next = await mutate({ action: 'addDay' });
                if (next) setTab(next.days[next.days.length - 1]?.id ?? tab);
              }}
              className="mb-2 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 text-lg font-light text-white/70 transition-colors hover:border-gold-light/50 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              +
            </button>
          </nav>

          {error && (
            <p role="alert" className="mt-4 rounded-btn border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="sr-only" role="status" aria-live="polite">
            {busy
              ? lang === 'km'
                ? 'កំពុងរក្សាទុកការផ្លាស់ប្តូរ'
                : 'Saving itinerary changes'
              : notice}
          </div>
          {notice && !error && (
            <p className="mt-4 rounded-btn border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm font-medium text-emerald-100">
              {notice}
            </p>
          )}

          {tab === 'summary' ? (
            <div className="mt-7 space-y-7">
              {data.days.map((day) => (
                <DaySection
                  key={day.id}
                  title={dayLabel(day)}
                  theme={day.theme}
                  places={day.places}
                  reorderable={false}
                  onAdd={() => {
                    setTab(day.id);
                    setPicker(true);
                  }}
                  onEdit={setEditing}
                  onRemove={(id) => void mutate({ action: 'delete', placeId: id })}
                  onNudge={() => undefined}
                  routeLegs={[]}
                  routeState="idle"
                  warnings={[]}
                  busy={busy}
                />
              ))}
              <DaySection
                title={lang === 'km' ? 'គំនិត' : 'Ideas'}
                theme={null}
                places={data.ideas}
                reorderable={false}
                onAdd={() => {
                  setTab('ideas');
                  setPicker(true);
                }}
                onEdit={setEditing}
                onRemove={(id) => void mutate({ action: 'delete', placeId: id })}
                onNudge={() => undefined}
                routeLegs={[]}
                routeState="idle"
                warnings={[]}
                busy={busy}
              />
            </div>
          ) : (
            <div className="mt-7">
              <DaySection
                title={targetLabel}
                theme={active?.theme ?? null}
                places={visible}
                reorderable={tab !== 'ideas'}
                onAdd={() => setPicker(true)}
                onEdit={setEditing}
                onRemove={(id) => void mutate({ action: 'delete', placeId: id })}
                onNudge={(index, direction) => void nudge(visible, index, direction)}
                routeLegs={journey?.legs ?? []}
                routeState={routeState}
                warnings={activeWarnings}
                busy={busy}
              />
            </div>
          )}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-3 border-t border-white/10 bg-primary-deep/95 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          onClick={() => setPicker(true)}
          disabled={busy}
          className="liquid-glass-accent liquid-press inline-flex min-h-[3rem] items-center gap-2 rounded-btn px-6 text-sm font-semibold text-primary-deep disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
        >
          <Plus size={18} aria-hidden="true" />
          {lang === 'km' ? 'បន្ថែមទីតាំង' : 'Add a place'}
        </button>
      </div>

      {picker && (
        <AddPlaceSheet
          targetLabel={targetLabel || (lang === 'km' ? 'គំនិត' : 'Ideas')}
          places={data.curatedPlaces}
          savedPlaceIds={data.ideas.map((item) => item.place_id)}
          busy={busy}
          onAdd={addExisting}
          onAddCustom={addCustom}
          onClose={() => setPicker(false)}
        />
      )}

      {editing && (
        <EditPlaceSheet
          item={editing}
          days={data.days}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const saved = await mutate({ action: 'update', placeId: editing.id, ...patch });
            if (saved) setEditing(null);
          }}
          onMove={async (dayId) => {
            const moved = await mutate({ action: 'move', placeId: editing.id, dayId });
            if (moved) setEditing(null);
          }}
        />
      )}

      {sharing && (
        <ShareSheet
          isPublic={data.trip.is_public}
          token={data.trip.share_token}
          busy={busy}
          onClose={() => setSharing(false)}
          onToggle={(next) => void mutate({ action: next ? 'share' : 'unshare' })}
        />
      )}
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function mutationSuccess(action: unknown, lang: 'en' | 'km'): string {
  const km = lang === 'km';
  switch (action) {
    case 'addDay':
      return km ? 'បានបន្ថែមថ្ងៃថ្មី។' : 'A new day was added.';
    case 'addPlace':
    case 'addIdea':
    case 'addCustom':
      return km ? 'បានបន្ថែមទីតាំង។' : 'Place added to the itinerary.';
    case 'delete':
      return km ? 'បានលុបទីតាំង។' : 'Place removed.';
    case 'reorder':
      return km ? 'បានផ្លាស់ប្តូរលំដាប់។' : 'Order updated.';
    case 'update':
      return km ? 'បានរក្សាទុកទីតាំង។' : 'Place saved.';
    case 'move':
      return km ? 'បានផ្លាស់ទីទៅថ្ងៃថ្មី។' : 'Moved to another day.';
    case 'share':
      return km ? 'បានបង្កើតតំណចែករំលែក។' : 'Share link created.';
    case 'unshare':
      return km ? 'បានបញ្ឈប់ការចែករំលែក។' : 'Sharing turned off.';
    default:
      return km ? 'បានរក្សាទុកការផ្លាស់ប្តូរ។' : 'Changes saved.';
  }
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative min-h-[2.75rem] shrink-0 pb-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light',
        active ? 'text-white' : 'text-white/65 hover:text-white/85'
      )}
    >
      {children}
      {active && (
        <span
          className="absolute -bottom-px left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-gold-light"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ── A day ────────────────────────────────────────────────────────────────────

function DaySection({
  title,
  theme,
  places,
  reorderable,
  onAdd,
  onEdit,
  onRemove,
  onNudge,
  routeLegs,
  routeState,
  warnings,
  busy,
}: {
  title: string;
  theme: string | null;
  places: ItineraryPlace[];
  reorderable: boolean;
  onAdd: () => void;
  onEdit: (item: ItineraryPlace) => void;
  onRemove: (id: string) => void;
  onNudge: (index: number, direction: -1 | 1) => void;
  routeLegs: RouteLeg[];
  routeState: 'idle' | 'loading' | 'ready' | 'unavailable';
  warnings: ScheduleWarning[];
  busy: boolean;
}) {
  const { lang } = useLang();
  const [collapsed, setCollapsed] = useState(false);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-display text-xl text-white">
            {title}
          </h2>
          {theme && <p className="mt-0.5 text-sm text-gold-light">{theme}</p>}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? lang === 'km'
                ? `បង្ហាញ ${title}`
                : `Expand ${title}`
              : lang === 'km'
                ? `បង្រួម ${title}`
                : `Collapse ${title}`
          }
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          {collapsed ? <ChevronDown size={20} aria-hidden="true" /> : <ChevronUp size={20} aria-hidden="true" />}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-1">
          {routeState === 'loading' && (
            <p role="status" className="rounded-btn border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65">
              {lang === 'km' ? 'កំពុងគណនាពេល និងចម្ងាយផ្លូវពិត…' : 'Calculating live road time and distance…'}
            </p>
          )}
          {routeState === 'unavailable' && (
            <p className="rounded-btn border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65">
              {lang === 'km' ? 'មិនអាចទទួលពេលធ្វើដំណើរផ្លូវពិតបានឥឡូវនេះទេ។' : 'Live road time is unavailable; no estimate has been substituted.'}
            </p>
          )}
          {places.length === 0 && (
            <div className="rounded-card border border-dashed border-white/15 bg-white/[0.03] px-4 py-5">
              <p className="text-sm font-semibold text-white">
                {lang === 'km' ? 'មិនទាន់មានទីតាំងនៅឡើយ។' : 'No places yet.'}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/65">
                {lang === 'km'
                  ? 'បន្ថែមទីតាំងមួយ ដើម្បីឱ្យផែនទី និងលំដាប់ថ្ងៃចាប់ផ្តើមមានអត្ថន័យ។'
                  : 'Add a place to give this day a route, timing and map context.'}
              </p>
            </div>
          )}
          {places.map((item, index) => (
            <div key={item.id}>
              <PlaceCard
                item={item}
                index={index}
                total={places.length}
                reorderable={reorderable}
                busy={busy}
                onEdit={() => onEdit(item)}
                onRemove={() => onRemove(item.id)}
                onNudge={(direction) => onNudge(index, direction)}
                warnings={warnings.filter((warning) => warning.placeId === item.id)}
              />
              {index < places.length - 1 && (
                <TravelGap
                  leg={routeLegs.find((leg) => leg.fromPlaceId === item.id && leg.toPlaceId === places[index + 1].id)}
                />
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={onAdd}
            className="flex min-h-[3rem] w-full items-center gap-4 rounded-btn px-2 text-left text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <span className="text-2xl font-light leading-none" aria-hidden="true">
              +
            </span>
            <span className="text-sm">{lang === 'km' ? 'បន្ថែម' : 'Add'}</span>
          </button>
        </div>
      )}
    </section>
  );
}

function PlaceCard({
  item,
  index,
  total,
  reorderable,
  busy,
  onEdit,
  onRemove,
  onNudge,
  warnings,
}: {
  item: ItineraryPlace;
  index: number;
  total: number;
  reorderable: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onNudge: (direction: -1 | 1) => void;
  warnings: ScheduleWarning[];
}) {
  const { lang } = useLang();

  // Only a time somebody actually set. The old card filled this in from a
  // rotating array, so every first stop claimed to start at 10:00.
  const time =
    item.time_start && item.time_end
      ? `${item.time_start.slice(0, 5)} – ${item.time_end.slice(0, 5)}`
      : item.time_start
        ? item.time_start.slice(0, 5)
        : null;

  return (
    <article className="flex items-start gap-3 rounded-card p-2 transition-colors hover:bg-white/[0.03]">
      <span
        className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold-light/40 font-mono text-xs font-bold text-gold-bright"
        aria-hidden="true"
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-light">
          {CATEGORY_LABEL[item.category]?.[lang] ?? CATEGORY_LABEL.other[lang]}
        </p>
        <h3 className="mt-0.5 font-semibold leading-tight text-white">{item.place.name}</h3>

        <div className="mt-2 rounded-btn border border-white/8 bg-white/[0.03] px-3 py-2.5">
          {time ? (
            <p className="flex items-center gap-1.5 font-mono text-sm font-semibold text-white/85">
              <Clock size={13} aria-hidden="true" />
              {time}
            </p>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              className="flex min-h-[2.75rem] items-center gap-1.5 text-sm text-white/65 transition-colors hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              <Clock size={13} aria-hidden="true" />
              {lang === 'km' ? 'កំណត់ពេលវេលា' : 'Set a time'}
            </button>
          )}
          {(item.notes || item.place.description) && (
            <p className="mt-1.5 text-sm leading-snug text-white/60">
              {item.notes ?? item.place.description}
            </p>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1">
          {reorderable && (
            <>
              <IconButton
                label={lang === 'km' ? `ផ្លាស់ ${item.place.name} ឡើងលើ` : `Move ${item.place.name} earlier`}
                onClick={() => onNudge(-1)}
                disabled={busy || index === 0}
              >
                <ChevronUp size={15} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={lang === 'km' ? `ផ្លាស់ ${item.place.name} ចុះក្រោម` : `Move ${item.place.name} later`}
                onClick={() => onNudge(1)}
                disabled={busy || index === total - 1}
              >
                <ChevronDown size={15} aria-hidden="true" />
              </IconButton>
            </>
          )}
          <IconButton
            label={lang === 'km' ? `កែ ${item.place.name}` : `Edit ${item.place.name}`}
            onClick={onEdit}
            disabled={busy}
          >
            <Pencil size={14} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={lang === 'km' ? `លុប ${item.place.name}` : `Remove ${item.place.name}`}
            onClick={onRemove}
            disabled={busy}
            danger
          >
            <Trash2 size={14} aria-hidden="true" />
          </IconButton>
        </div>
        {warnings.map((warning) => (
          <p key={warning.kind} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {warning.message[lang]}
          </p>
        ))}
      </div>
    </article>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'grid h-11 w-11 place-items-center rounded-full text-white/60 transition-colors disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2',
        danger ? 'hover:text-danger focus-visible:ring-danger' : 'hover:text-white focus-visible:ring-gold-light'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Real road distance and duration returned by the configured routing service.
 * Renders nothing when a route is unknown; the day-level status explains why.
 */
function TravelGap({ leg }: { leg: RouteLeg | undefined }) {
  const { lang } = useLang();
  if (!leg) return null;
  const km = leg.distanceMeters / 1000;
  const minutes = Math.max(1, Math.round(leg.durationSeconds / 60));

  return (
    <p className="ml-[52px] flex items-center gap-2 py-2 text-xs font-medium text-white/60">
      <CarFront size={14} aria-hidden="true" />
      {lang === 'km' ? `${minutes} នាទី · ${km.toFixed(1)} គ.ម តាមផ្លូវ` : `${minutes} min · ${km.toFixed(1)} km by road`}
    </p>
  );
}

// ── Add a place ──────────────────────────────────────────────────────────────

interface CustomDraft {
  name: string;
  description: string;
  category: ItineraryCategory;
  openingStart: string | null;
  openingEnd: string | null;
}

function AddPlaceSheet({
  targetLabel,
  places,
  savedPlaceIds,
  busy,
  onAdd,
  onAddCustom,
  onClose,
}: {
  targetLabel: string;
  places: CuratedPlace[];
  savedPlaceIds: string[];
  busy: boolean;
  onAdd: (place: CuratedPlace) => void;
  onAddCustom: (draft: CustomDraft) => void;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const [filter, setFilter] = useState<PickerFilter>('all');
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState<CustomDraft>({
    name: '', description: '', category: 'other', openingStart: null, openingEnd: null,
  });

  // The old filters lied: "Stay" filtered to category 'other' (a catch-all) and
  // "My saved" filtered to source 'editorial' — Domner's own picks, the exact
  // opposite of anything the traveler saved.
  const options: { value: PickerFilter; label: { en: string; km: string }; icon: typeof Link2 }[] = [
    { value: 'all', label: { en: 'All', km: 'ទាំងអស់' }, icon: Link2 },
    { value: 'stay', label: { en: 'Stay', km: 'ស្នាក់នៅ' }, icon: BedDouble },
    { value: 'transport', label: { en: 'Transit', km: 'ធ្វើដំណើរ' }, icon: TrainFront },
    { value: 'saved', label: { en: 'Saved', km: 'បានរក្សាទុក' }, icon: Star },
    { value: 'mine', label: { en: 'Mine', km: 'របស់ខ្ញុំ' }, icon: Star },
  ];

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return places.filter((place) => {
      if (needle && !`${place.name} ${place.description}`.toLowerCase().includes(needle)) return false;
      if (filter === 'stay') return place.category === 'stay';
      if (filter === 'transport') return place.category === 'transport';
      if (filter === 'saved') return savedPlaceIds.includes(place.id);
      if (filter === 'mine') return place.created_by !== null;
      return true;
    });
  }, [places, query, filter, savedPlaceIds]);

  const submitCustom = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    if (Boolean(draft.openingStart) !== Boolean(draft.openingEnd)) return;
    onAddCustom(draft);
  };
  const incompleteHours = Boolean(draft.openingStart) !== Boolean(draft.openingEnd);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'km' ? 'បន្ថែមទីតាំង' : 'Add a place'}
    >
      <button
        type="button"
        aria-label={lang === 'km' ? 'បិទ' : 'Close'}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section className="night-card relative max-h-[85vh] w-full overflow-y-auto rounded-b-none rounded-t-[28px] px-4 pb-8 pt-4 sm:mx-auto sm:mb-6 sm:max-w-2xl sm:rounded-[28px]">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">
            {lang === 'km' ? `បន្ថែមទៅ ${targetLabel}` : `Add to ${targetLabel}`}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'km' ? 'បិទ' : 'Close'}
            className="grid h-11 w-11 place-items-center rounded-full text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {custom ? (
          <form onSubmit={submitCustom} className="mt-5 space-y-3">
            <div>
              <label htmlFor="custom-name" className="block text-sm font-medium text-white/80">
                {lang === 'km' ? 'ឈ្មោះទីតាំង' : 'Place name'}
              </label>
              <input
                id="custom-name"
                autoFocus
                required
                maxLength={PLACE_NAME_MAX}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={lang === 'km' ? 'សណ្ឋាគាររបស់យើង' : 'Our hotel'}
                className="mt-1.5 min-h-[2.75rem] w-full rounded-btn border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/45 focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
              />
            </div>
            <div>
              <label htmlFor="custom-category" className="block text-sm font-medium text-white/80">
                {lang === 'km' ? 'ប្រភេទ' : 'Kind'}
              </label>
              <select
                id="custom-category"
                value={draft.category}
                onChange={(event) =>
                  setDraft({ ...draft, category: event.target.value as ItineraryCategory })
                }
                className="mt-1.5 min-h-[2.75rem] w-full rounded-btn border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category} className="bg-[#142238]">
                    {CATEGORY_LABEL[category][lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="custom-note" className="block text-sm font-medium text-white/80">
                {lang === 'km' ? 'កំណត់ចំណាំ (ជាជម្រើស)' : 'Note (optional)'}
              </label>
              <textarea
                id="custom-note"
                rows={2}
                maxLength={PLACE_DESCRIPTION_MAX}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder={
                  lang === 'km' ? 'អាសយដ្ឋាន លេខទូរស័ព្ទ ឬលេខកក់…' : 'Address, phone, booking reference…'
                }
                className="mt-1.5 w-full rounded-btn border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
              />
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-white/80">
                {lang === 'km' ? 'ម៉ោងបើកធម្មតា (ជាជម្រើស)' : 'Typical opening hours (optional)'}
              </legend>
              <div className="mt-1.5 grid grid-cols-2 gap-3">
                <input
                  type="time"
                  aria-label={lang === 'km' ? 'ម៉ោងបើក' : 'Opening time'}
                  value={draft.openingStart ?? ''}
                  onChange={(event) => setDraft({ ...draft, openingStart: event.target.value || null })}
                  className="min-h-[2.75rem] rounded-btn border border-white/12 bg-white/[0.04] px-3 text-sm text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
                />
                <input
                  type="time"
                  aria-label={lang === 'km' ? 'ម៉ោងបិទ' : 'Closing time'}
                  value={draft.openingEnd ?? ''}
                  onChange={(event) => setDraft({ ...draft, openingEnd: event.target.value || null })}
                  className="min-h-[2.75rem] rounded-btn border border-white/12 bg-white/[0.04] px-3 text-sm text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
                />
              </div>
              {incompleteHours && (
                <p role="alert" className="mt-1.5 text-xs text-amber-200">
                  {lang === 'km' ? 'សូមបញ្ចូលទាំងម៉ោងបើក និងម៉ោងបិទ។' : 'Enter both opening and closing time.'}
                </p>
              )}
            </fieldset>
            <p className="text-xs text-white/60">
              {lang === 'km'
                ? 'ទីតាំងផ្ទាល់ខ្លួនមើលឃើញតែអ្នកប៉ុណ្ណោះ ហើយមិនបង្ហាញលើផែនទីទេ ព្រោះយើងមិនដឹងកូអរដោនេ។'
                : 'Your own places are visible only to you, and stay off the map — we have no coordinates for them.'}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={busy || !draft.name.trim() || incompleteHours}
                className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-btn px-5 text-sm font-semibold text-primary-deep disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
              >
                {lang === 'km' ? 'បន្ថែម' : 'Add it'}
              </button>
              <button
                type="button"
                onClick={() => setCustom(false)}
                className="inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              >
                {lang === 'km' ? 'ត្រឡប់' : 'Back'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {options.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={cn(
                    'flex min-h-[2.75rem] min-w-[86px] shrink-0 flex-col items-center gap-1 rounded-card border px-3 py-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light',
                    filter === value
                      ? 'border-gold-light/50 bg-gold-light/15 text-gold-bright'
                      : 'border-white/12 text-white/75 hover:border-white/25 hover:text-white'
                  )}
                >
                  <Icon size={18} aria-hidden="true" />
                  {label[lang]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustom(true)}
                className="flex min-h-[2.75rem] min-w-[86px] shrink-0 flex-col items-center gap-1 rounded-card border border-dashed border-gold-light/40 px-3 py-3 text-xs font-semibold text-gold-bright transition-colors hover:border-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              >
                <Plus size={18} aria-hidden="true" />
                {lang === 'km' ? 'ផ្ទាល់ខ្លួន' : 'Custom'}
              </button>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-btn border border-white/12 bg-white/[0.04] px-3.5 py-2.5">
              <MapPin size={18} className="shrink-0 text-white/60" aria-hidden="true" />
              <span className="sr-only">{lang === 'km' ? 'ស្វែងរកទីតាំង' : 'Search places'}</span>
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={lang === 'km' ? 'ស្វែងរកទីតាំង' : 'Search places'}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45"
              />
            </label>

            <div className="mt-4 space-y-2">
              {matching.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onAdd(place)}
                  className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-card border border-white/8 bg-white/[0.03] p-3 text-left transition-colors hover:border-gold-light/40 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-gold-light/12 text-gold-light">
                    <MapPin size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold text-white">{place.name}</b>
                    <span className="block truncate text-xs text-white/50">{place.description}</span>
                  </span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-white/60">
                    {CATEGORY_LABEL[place.category]?.[lang] ?? CATEGORY_LABEL.other[lang]}
                  </span>
                </button>
              ))}

              {matching.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-white/55">
                    {places.length === 0
                      ? lang === 'km'
                        ? 'យើងមិនទាន់បានសរសេរអំពីគោលដៅនេះទេ។'
                        : "We haven't written this destination up yet."
                      : lang === 'km'
                        ? 'រកមិនឃើញទីតាំងត្រូវនឹងការស្វែងរកនេះទេ។'
                        : 'Nothing matches that search.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCustom(true)}
                    className="mt-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-btn border border-gold-light/40 px-4 text-sm font-semibold text-gold-bright transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                  >
                    <Plus size={15} aria-hidden="true" />
                    {lang === 'km' ? 'បន្ថែមទីតាំងផ្ទាល់ខ្លួន' : 'Add your own place'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ── Edit a place ─────────────────────────────────────────────────────────────

function EditPlaceSheet({
  item,
  days,
  busy,
  onClose,
  onSave,
  onMove,
}: {
  item: ItineraryPlace;
  days: ItineraryDay[];
  busy: boolean;
  onClose: () => void;
  onSave: (patch: {
    timeStart: string | null;
    timeEnd: string | null;
    notes: string | null;
    category: ItineraryCategory;
  }) => void;
  onMove: (dayId: string) => void;
}) {
  const { lang } = useLang();
  const [timeStart, setTimeStart] = useState(item.time_start?.slice(0, 5) ?? '');
  const [timeEnd, setTimeEnd] = useState(item.time_end?.slice(0, 5) ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [category, setCategory] = useState<ItineraryCategory>(item.category);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-place-title"
    >
      <button
        type="button"
        aria-label={lang === 'km' ? 'បិទ' : 'Close'}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section className="night-card relative max-h-[85vh] w-full overflow-y-auto rounded-b-none rounded-t-[28px] px-5 pb-8 pt-4 sm:mx-auto sm:mb-6 sm:max-w-lg sm:rounded-[28px]">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />

        <div className="mt-4 flex items-start justify-between gap-3">
          <h2 id="edit-place-title" className="font-display text-xl text-white">
            {item.place.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'km' ? 'បិទ' : 'Close'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-start" className="block text-sm font-medium text-white/80">
              {lang === 'km' ? 'ចាប់ផ្តើម' : 'From'}
            </label>
            <input
              id="edit-start"
              type="time"
              value={timeStart}
              onChange={(event) => setTimeStart(event.target.value)}
              className="mt-1.5 min-h-[2.75rem] w-full rounded-btn border border-white/12 bg-white/[0.04] px-3 text-sm text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
            />
          </div>
          <div>
            <label htmlFor="edit-end" className="block text-sm font-medium text-white/80">
              {lang === 'km' ? 'បញ្ចប់' : 'To'}
            </label>
            <input
              id="edit-end"
              type="time"
              value={timeEnd}
              onChange={(event) => setTimeEnd(event.target.value)}
              className="mt-1.5 min-h-[2.75rem] w-full rounded-btn border border-white/12 bg-white/[0.04] px-3 text-sm text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
            />
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="edit-category" className="block text-sm font-medium text-white/80">
            {lang === 'km' ? 'ប្រភេទ' : 'Kind'}
          </label>
          <select
            id="edit-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ItineraryCategory)}
            className="mt-1.5 min-h-[2.75rem] w-full rounded-btn border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value} className="bg-[#142238]">
                {CATEGORY_LABEL[value][lang]}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <label htmlFor="edit-notes" className="block text-sm font-medium text-white/80">
            {lang === 'km' ? 'កំណត់ចំណាំ' : 'Your note'}
          </label>
          <textarea
            id="edit-notes"
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={item.place.description}
            className="mt-1.5 w-full rounded-btn border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/45 focus:border-gold-light/50 focus:outline-none focus:ring-2 focus:ring-gold-light/30"
          />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSave({
              timeStart: timeStart || null,
              timeEnd: timeEnd || null,
              notes: notes.trim() || null,
              category,
            })
          }
          className="liquid-glass-accent liquid-press mt-5 inline-flex min-h-[3rem] w-full items-center justify-center rounded-btn px-5 text-sm font-semibold text-primary-deep disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
        >
          {lang === 'km' ? 'រក្សាទុក' : 'Save'}
        </button>

        {days.length > 0 && (
          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/65">
              {lang === 'km' ? 'ផ្លាស់ទៅថ្ងៃផ្សេង' : 'Move to another day'}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onMove(day.id)}
                  className="inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-3.5 text-sm font-medium text-white/80 transition-colors hover:border-gold-light/50 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                >
                  {formatDay(day.date, day.day_index, lang)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Share ────────────────────────────────────────────────────────────────────

function ShareSheet({
  isPublic,
  token,
  busy,
  onClose,
  onToggle,
}: {
  isPublic: boolean;
  token: string;
  busy: boolean;
  onClose: () => void;
  onToggle: (next: boolean) => void;
}) {
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/share/trip/${token}`;

  const copy = async () => {
    setCopyFailed(false);
    try {
      // navigator.clipboard is undefined outside a secure context. The previous
      // code optional-chained that away, so on plain HTTP nothing happened and
      // nothing said so.
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
    >
      <button
        type="button"
        aria-label={lang === 'km' ? 'បិទ' : 'Close'}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section className="night-card relative w-full rounded-b-none rounded-t-[28px] px-5 pb-8 pt-4 sm:mx-auto sm:mb-6 sm:max-w-lg sm:rounded-[28px]">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />

        <div className="mt-4 flex items-start justify-between gap-3">
          <h2 id="share-title" className="font-display text-xl text-white">
            {lang === 'km' ? 'ចែករំលែកកម្មវិធីដំណើរ' : 'Share this itinerary'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'km' ? 'បិទ' : 'Close'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {isPublic ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'អ្នកណាក៏មានតំណនេះអាចមើលកម្មវិធីដំណើររបស់អ្នកបាន។ ពួកគេមិនអាចកែវាទេ។'
                : 'Anyone with this link can see your days. They cannot change anything.'}
            </p>
            <p className="mt-3 break-all rounded-btn border border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono text-xs text-white/70">
              {url}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copy}
                className="liquid-glass-accent liquid-press inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-btn px-5 text-sm font-semibold text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
              >
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied
                  ? lang === 'km'
                    ? 'បានចម្លង'
                    : 'Copied'
                  : lang === 'km'
                    ? 'ចម្លងតំណ'
                    : 'Copy link'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onToggle(false)}
                className="inline-flex min-h-[2.75rem] items-center rounded-btn border border-white/15 px-5 text-sm font-semibold text-white transition-colors hover:border-danger/60 hover:text-danger disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              >
                {lang === 'km' ? 'ឈប់ចែករំលែក' : 'Stop sharing'}
              </button>
            </div>
            {copyFailed && (
              <p role="alert" className="mt-2 text-xs text-white/60">
                {lang === 'km'
                  ? 'ចម្លងដោយស្វ័យប្រវត្តិមិនបាន។ សូមចម្លងតំណខាងលើដោយដៃ។'
                  : 'Automatic copy is unavailable here — select the link above and copy it.'}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              {lang === 'km'
                ? 'បង្កើតតំណដែលអាចមើលបាន ដើម្បីចែករំលែកជាមួយអ្នករួមដំណើរ។ អ្នកអាចបិទវាពេលណាក៏បាន។'
                : 'Create a read-only link to send to whoever you are travelling with. You can turn it off at any time.'}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggle(true)}
              className="liquid-glass-accent liquid-press mt-4 inline-flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-btn px-5 text-sm font-semibold text-primary-deep disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            >
              <Share2 size={16} aria-hidden="true" />
              {lang === 'km' ? 'បង្កើតតំណ' : 'Create a link'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────────────

function EditorSkeleton() {
  const { lang } = useLang();

  return (
    <div className="night-canvas has-tabbar relative min-h-screen" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{lang === 'km' ? 'កំពុងផ្ទុកកម្មវិធីដំណើរ' : 'Loading itinerary'}</span>
      <div className="night-stars" aria-hidden="true" />
      <div className="relative h-[38svh] min-h-[240px] animate-pulse bg-white/[0.04] motion-reduce:animate-none" />
      <div className="relative z-20 mx-auto -mt-8 max-w-3xl rounded-t-[28px] border-t border-white/10 bg-primary-deep/95 px-5 pt-8 sm:px-8">
        <div className="h-8 w-2/3 animate-pulse rounded-btn bg-white/[0.06] motion-reduce:animate-none" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded-btn bg-white/[0.05] motion-reduce:animate-none" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-24 animate-pulse rounded-card border border-white/8 bg-white/[0.03] motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDay(value: string | null, index: number, lang: 'en' | 'km'): string {
  if (!value) return lang === 'km' ? `ថ្ងៃទី ${index}` : `Day ${index}`;
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString(lang === 'km' ? 'km-KH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function tripDates(start: string | null, end: string | null, lang: 'en' | 'km'): string {
  if (!start) return lang === 'km' ? 'មិនទាន់កំណត់ថ្ងៃ' : 'Dates not set';
  const locale = lang === 'km' ? 'km-KH' : 'en-GB';
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  const from = new Date(`${start}T00:00:00Z`).toLocaleDateString(locale, options);
  if (!end || end === start) return from;
  const to = new Date(`${end}T00:00:00Z`).toLocaleDateString(locale, options);
  return `${from} → ${to}`;
}

/**
 * The day's stops on a map, in order.
 *
 * Only places that have coordinates are plotted — a hand-added place stored at
 * 0,0 would otherwise drop a pin in the Gulf of Guinea and drag the bounds with
 * it.
 */
function RouteMap({
  places,
  journey,
  destination,
  lang,
}: {
  places: ItineraryPlace[];
  journey: RoutedJourney | null;
  destination: string;
  lang: 'en' | 'km';
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const layers = useRef<import('leaflet').LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  const located = useMemo(() => places.filter((item) => hasLocation(item.place)), [places]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !node.current) return;
      const instance = L.map(node.current, {
        zoomControl: false,
        scrollWheelZoom: false,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
      }).setView([13.7563, 100.5018], 4);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 18,
      }).addTo(instance);
      map.current = instance;
      leaflet.current = L as typeof import('leaflet');
      layers.current = L.layerGroup().addTo(instance);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      leaflet.current = null;
      layers.current = null;
      setReady(false);
    };
  }, []);

  // The map remains mounted while the route layer changes. Recreating Leaflet
  // for every day tab caused tile flashes and a long-feeling pause on mobile;
  // now the camera travels to the selected route instead.
  useEffect(() => {
    const instance = map.current;
    const L = leaflet.current;
    const layer = layers.current;
    if (!ready || !instance || !L || !layer) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motion = reducedMotion ? { duration: 0 } : { duration: 0.65, easeLinearity: 0.35 };

    layer.clearLayers();
    const points: [number, number][] = [];
    located.forEach((item, index) => {
      const point: [number, number] = [Number(item.place.lat), Number(item.place.lng)];
      points.push(point);
      L.marker(point, {
        icon: L.divIcon({
          className: 'itinerary-pin',
          html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:#0d1826;color:#e8c887;border:2px solid #e8c887;font:700 12px sans-serif">${index + 1}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      })
        .addTo(layer)
        .bindTooltip(item.place.name);
    });

    const roadGeometry = journey?.geometry.map(([lng, lat]) => [lat, lng] as [number, number]) ?? [];
    if (roadGeometry.length > 1) {
      L.polyline(roadGeometry, { color: '#e8c887', weight: 3, opacity: 0.82 }).addTo(layer);
    }
    if (points.length > 1) {
      instance.flyToBounds(points, { padding: [34, 34], ...motion });
    } else if (points[0]) {
      instance.flyTo(points[0], 12, motion);
    } else {
      instance.flyTo([13.7563, 100.5018], 4, motion);
    }
  }, [located, journey, ready]);

  return (
    <div
      ref={node}
      className="h-full w-full"
      role="img"
      aria-label={
        lang === 'km' ? `ផែនទីសម្រាប់ ${destination}` : `Map of your stops in ${destination}`
      }
    />
  );
}
