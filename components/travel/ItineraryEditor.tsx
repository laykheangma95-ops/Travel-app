'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BedDouble, CalendarDays, ChevronDown, ChevronUp, FilePlus2, Link2, Map as MapIcon, MapPin, MessageCircle, Plus, Share2, Sparkles, Star, TrainFront, Trash2, X } from 'lucide-react';
import type { CuratedPlace, ItineraryDay, ItineraryPayload, ItineraryPlace } from '@/lib/travel/itinerary';

type Tab = 'summary' | 'ideas' | string;
type PickerFilter = 'all' | 'stay' | 'transport' | 'saved' | 'custom';

const labels: Record<string, string> = { spot: 'Attraction', food: 'Food', shopping: 'Shopping', transport: 'Transit', other: 'Place' };
const pickerOptions: { value: PickerFilter; label: string; icon: typeof Link2; tone: string }[] = [
  { value: 'all', label: 'Import from', icon: Link2, tone: 'bg-white' },
  { value: 'stay', label: 'Stay', icon: BedDouble, tone: 'bg-blue-50' },
  { value: 'transport', label: 'Transit', icon: TrainFront, tone: 'bg-purple-50' },
  { value: 'saved', label: 'My saved', icon: Star, tone: 'bg-white' },
  { value: 'custom', label: 'Custom', icon: FilePlus2, tone: 'bg-white' },
];

export function ItineraryEditor({ tripId }: { tripId: string }) {
  const [data, setData] = useState<ItineraryPayload | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PickerFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);

  const request = async (body?: Record<string, unknown>) => {
    const response = await fetch('/api/travel/itinerary/' + tripId, {
      method: body ? 'PATCH' : 'GET',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? 'Could not save itinerary.');
    setData(result);
    return result as ItineraryPayload;
  };

  useEffect(() => {
    void request()
      .then((result) => setTab(result.days[0]?.id ?? 'ideas'))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load itinerary.'));
  }, [tripId]);

  const active = data?.days.find((day) => day.id === tab);
  const places = tab === 'ideas' ? data?.ideas ?? [] : active?.places ?? [];
  const openPicker = (nextTab?: Tab) => {
    if (nextTab) setTab(nextTab);
    setFilter('all');
    setQuery('');
    setPicker(true);
  };
  const add = async (place: CuratedPlace) => {
    try {
      if (tab === 'ideas') await request({ action: 'addIdea', placeId: place.id });
      else if (active) await request({ action: 'addPlace', dayId: active.id, placeId: place.id });
      else throw new Error('Choose a day first.');
      setPicker(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add that place.');
    }
  };
  const remove = (placeId: string) => {
    void request({ action: 'delete', placeId }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not remove that place.'));
  };
  const reorder = (targetId: string) => {
    if (!active || !dragged || dragged === targetId) return;
    const ids = places.map((place) => place.id);
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    void request({ action: 'reorder', dayId: active.id, placeIds: ids }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not reorder places.'));
    setDragged(null);
  };
  const share = async () => {
    try {
      const next = await request({ action: 'share' });
      await navigator.clipboard?.writeText(window.location.origin + '/share/trip/' + next.trip.share_token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the share link.');
    }
  };

  if (!data) return <div className="min-h-screen bg-[#f7f8fa] p-6 text-[#111318]">{error ?? 'Loading itinerary…'}</div>;

  const visiblePlaces = data.curatedPlaces.filter((place) => {
    const text = (place.name + ' ' + place.description).toLowerCase();
    if (!text.includes(query.toLowerCase())) return false;
    if (filter === 'transport') return place.category === 'transport';
    if (filter === 'stay') return place.category === 'other';
    if (filter === 'saved') return place.source === 'editorial';
    return true;
  });
  const dayLabel = (day: ItineraryDay) => formatDay(day.date, day.day_index);
  const targetLabel = tab === 'ideas' ? 'Ideas' : active ? dayLabel(active) : 'your day';

  return (
    <div className="min-h-screen bg-[#f7f8fa] pb-24 text-[#101114]">
      <div className="relative h-[44svh] min-h-[300px] bg-[#dfeef1]">
        <RouteMap places={places} destination={data.trip.destination} />
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 pt-6 sm:px-6">
          <button aria-label="Back" onClick={() => window.history.back()} className="grid h-10 w-10 place-items-center rounded-full bg-white/80 shadow-sm backdrop-blur"><ArrowLeft size={20} /></button>
          <div className="flex gap-2">
            <button aria-label="Share itinerary" onClick={() => void share()} className="grid h-10 w-10 place-items-center rounded-full bg-white/80 shadow-sm backdrop-blur"><Share2 size={18} /></button>
            <button aria-label="Map options" className="grid h-10 w-10 place-items-center rounded-full bg-white/80 shadow-sm backdrop-blur"><MapIcon size={18} /></button>
          </div>
        </div>
      </div>

      <main className="relative z-20 mx-auto -mt-7 max-w-3xl rounded-t-[28px] bg-white shadow-[0_-12px_40px_rgba(40,55,65,.08)]">
        <div className="mx-auto mt-3 h-1 w-11 rounded-full bg-black/20" />
        <div className="px-5 pb-5 pt-4 sm:px-8">
          <h1 className="text-[25px] font-bold tracking-[-.04em]">{data.trip.title}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-black/45"><CalendarDays size={19} /><span>{tripDates(data.trip.start_date, data.trip.end_date, data.days.length)} {data.days.length || 1} Days</span><ChevronDown size={16} className="ml-1 text-black/30" /></div>

          <nav className="mt-6 -mx-1 flex items-end gap-6 overflow-x-auto border-b border-black/[.06] text-[15px] font-semibold text-black/35" aria-label="Itinerary days">
            <button onClick={() => setTab('summary')} className={tab === 'summary' ? 'relative shrink-0 pb-4 text-[#101114]' : 'shrink-0 pb-4'}>Summary{tab === 'summary' && <TabMarker />}</button>
            {data.days.map((day) => <button key={day.id} onClick={() => setTab(day.id)} className={tab === day.id ? 'relative shrink-0 pb-4 text-[#101114]' : 'shrink-0 pb-4'}>{dayLabel(day)}{tab === day.id && <TabMarker />}</button>)}
            <button onClick={() => setTab('ideas')} className={tab === 'ideas' ? 'relative shrink-0 pb-4 text-[#101114]' : 'shrink-0 pb-4'}>Ideas{tab === 'ideas' && <TabMarker />}</button>
            <button aria-label="Add day" onClick={() => void request({ action: 'addDay' }).then((next) => setTab(next.days[next.days.length - 1]?.id ?? tab)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not add a day.'))} className="mb-2 grid h-7 w-7 shrink-0 place-items-center text-2xl font-light text-black/45">+</button>
          </nav>

          {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {tab === 'summary' ? <SummaryView data={data} dayLabel={dayLabel} onAdd={openPicker} onRemove={remove} onDragStart={setDragged} onDrop={reorder} /> : <DaySection title={tab === 'ideas' ? 'Ideas' : active ? dayLabel(active) : 'Ideas'} day={active} places={places} onAdd={() => openPicker()} onRemove={remove} onDragStart={setDragged} onDrop={reorder} />}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-3 border-t border-black/[.05] bg-white/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur lg:bottom-0">
        <button className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#65c7f2] px-5 text-sm font-semibold text-white shadow-sm"><MessageCircle size={18} />Ask anything…</button>
        <button className="inline-flex min-h-12 items-center gap-2 rounded-full border border-black/[.04] bg-white px-6 text-sm font-semibold shadow-[0_5px_18px_rgba(0,0,0,.06)]"><Sparkles size={17} />Edit</button>
        <button aria-label="Add place" onClick={() => openPicker()} className="grid h-14 w-14 place-items-center rounded-full bg-[#111] text-white shadow-lg"><Plus size={30} strokeWidth={2.5} /></button>
      </div>

      {picker && <AddPlaceSheet targetLabel={targetLabel} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} places={visiblePlaces} onAdd={add} onClose={() => setPicker(false)} onCustom={() => setError('Custom places can be added after selecting a destination from Explore.')} />}
    </div>
  );
}

function TabMarker() {
  return <span className="absolute -bottom-px left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-[#21a9df]" />;
}

function SummaryView({ data, dayLabel, onAdd, onRemove, onDragStart, onDrop }: { data: ItineraryPayload; dayLabel: (day: ItineraryDay) => string; onAdd: (tab: Tab) => void; onRemove: (id: string) => void; onDragStart: (id: string) => void; onDrop: (id: string) => void }) {
  return <div className="mt-7 space-y-6">{data.days.map((day) => <DaySection key={day.id} title={dayLabel(day)} day={day} places={day.places} onAdd={() => onAdd(day.id)} onRemove={onRemove} onDragStart={onDragStart} onDrop={onDrop} />)}<DaySection title="Ideas" places={data.ideas} onAdd={() => onAdd('ideas')} onRemove={onRemove} onDragStart={onDragStart} onDrop={onDrop} /></div>;
}

function DaySection({ title, day, places, onAdd, onRemove, onDragStart, onDrop }: { title: string; day?: ItineraryDay; places: ItineraryPlace[]; onAdd: () => void; onRemove: (id: string) => void; onDragStart: (id: string) => void; onDrop: (id: string) => void }) {
  return <section className="border-b border-black/[.04] pb-5 last:border-0"><div className="flex items-center"><h2 className="text-[22px] font-bold tracking-[-.03em]">{title}</h2><button className="ml-3 text-sm text-black/25">Add remarks</button><button aria-label="Collapse section" className="ml-auto text-black/35"><ChevronUp size={22} /></button></div><div className="mt-4 space-y-2">{places.map((item, index) => <PlaceCard key={item.id} item={item} index={index} onDelete={() => onRemove(item.id)} onDragStart={() => onDragStart(item.id)} onDrop={() => onDrop(item.id)} />)}<button type="button" onClick={onAdd} className="flex w-full items-center gap-5 rounded-xl py-4 text-left text-[17px] text-black/25 transition-colors hover:bg-black/[.02]"><span className="text-[31px] font-light leading-none">+</span><span>Add</span></button></div></section>;
}

function PlaceCard({ item, index, onDelete, onDragStart, onDrop }: { item: ItineraryPlace; index: number; onDelete: () => void; onDragStart: () => void; onDrop: () => void }) {
  return <article draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="group flex items-start gap-3 rounded-2xl border border-black/[.06] bg-white p-3 shadow-[0_4px_16px_rgba(28,34,40,.05)]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef7fa] text-sm font-bold text-[#1699ca]">{index + 1}</span><span className="min-w-0 flex-1"><b className="block">{item.place.name}</b><span className="text-xs text-black/40">{labels[item.category] ?? 'Place'}</span><p className="mt-1 text-sm leading-relaxed text-black/48">{item.place.description}</p></span><button aria-label="Remove place" onClick={onDelete} className="p-1.5 text-black/25 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><Trash2 size={16} /></button></article>;
}

function AddPlaceSheet({ targetLabel, filter, setFilter, query, setQuery, places, onAdd, onClose, onCustom }: { targetLabel: string; filter: PickerFilter; setFilter: (value: PickerFilter) => void; query: string; setQuery: (value: string) => void; places: CuratedPlace[]; onAdd: (place: CuratedPlace) => void; onClose: () => void; onCustom: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-black/25 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Add a place"><button aria-label="Close add place panel" className="absolute inset-0 cursor-default" onClick={onClose} /><section className="relative max-h-[82vh] w-full overflow-y-auto rounded-t-[28px] bg-[#fafafa] px-4 pb-8 pt-4 shadow-[0_-16px_40px_rgba(18,26,32,.18)] sm:mx-auto sm:mb-6 sm:max-w-2xl sm:rounded-[28px]"><div className="mx-auto h-1 w-10 rounded-full bg-black/20" /><div className="mt-4 flex items-center justify-between"><span className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm">Add to {targetLabel} <ChevronDown size={15} className="ml-1 inline" /></span><button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white text-black/50"><X size={18} /></button></div><div className="mt-4 flex gap-2 overflow-x-auto pb-1">{pickerOptions.map(({ value, label, icon: Icon, tone }) => <button key={value} onClick={() => value === 'custom' ? onCustom() : setFilter(value)} className={filter === value ? 'flex min-w-[92px] shrink-0 flex-col items-center gap-1 rounded-2xl border-2 border-[#2eafd9] bg-white px-3 py-3 text-xs font-semibold' : 'flex min-w-[92px] shrink-0 flex-col items-center gap-1 rounded-2xl border border-black/[.06] ' + tone + ' px-3 py-3 text-xs font-semibold text-black/70'}><Icon size={20} className={value === 'stay' ? 'text-blue-500' : value === 'transport' ? 'text-purple-500' : 'text-black/65'} />{label}{(value === 'stay' || value === 'transport') && <span className="h-1.5 w-1.5 rounded-full bg-[#f3b624]" />}</button>)}</div><label className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/[.03]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f6f8d9]"><MapPin size={21} /></span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search places" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-black/30" /></label><div className="mt-4 space-y-2">{places.map((place) => <button key={place.id} onClick={() => onAdd(place)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-black/[.04] transition hover:ring-[#2eafd9]"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf7fa] text-[#159dca]"><MapPin size={18} /></span><span className="min-w-0 flex-1"><b className="block truncate">{place.name}</b><span className="block truncate text-sm text-black/45">{place.description}</span></span><span className="shrink-0 text-xs text-black/35">{labels[place.category] ?? 'Place'}</span></button>)}{!places.length && <p className="py-8 text-center text-sm text-black/40">No places found for this search yet.</p>}</div></section></div>;
}

function formatDay(value: string | null, index: number) {
  if (!value) return 'Day ' + index;
  const date = new Date(value + 'T00:00:00Z');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return month + '.' + day + ' ' + date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function tripDates(start: string | null, end: string | null, dayCount: number) {
  if (!start) return String(dayCount || 1) + ' day';
  const from = formatDay(start, 1).slice(0, 5);
  const to = end ? formatDay(end, dayCount || 1).slice(0, 5) : from;
  return from + '-' + to;
}

function RouteMap({ places, destination }: { places: ItineraryPlace[]; destination: string }) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !node.current) return;
      map.current?.remove();
      const first = places[0]?.place;
      const instance = L.map(node.current, { zoomControl: false, scrollWheelZoom: false }).setView(first ? [Number(first.lat), Number(first.lng)] : [13.7563, 100.5018], first ? 12 : 4);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 18 }).addTo(instance);
      const points: [number, number][] = [];
      places.forEach((item, index) => {
        const point: [number, number] = [Number(item.place.lat), Number(item.place.lng)];
        points.push(point);
        L.marker(point, { icon: L.divIcon({ className: 'itinerary-pin', html: '<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:#111;color:#fff;border:3px solid #fff;font:700 12px sans-serif">' + (index + 1) + '</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(instance).bindTooltip(item.place.name);
      });
      if (points.length > 1) { L.polyline(points, { color: '#22a8d9', weight: 4, opacity: 0.8 }).addTo(instance); instance.fitBounds(points, { padding: [30, 30] }); }
      map.current = instance;
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, [places, destination]);
  return <div ref={node} className="h-full w-full" aria-label={'Map for ' + destination} />;
}
