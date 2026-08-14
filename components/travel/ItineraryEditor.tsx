'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Plus, Share2, Trash2, X } from 'lucide-react';
import type { CuratedPlace, ItineraryDay, ItineraryPayload, ItineraryPlace } from '@/lib/travel/itinerary';

const labels: Record<string, string> = { spot: 'Spot', food: 'Food', shopping: 'Shopping', transport: 'Transport', other: 'Other' };
const selected = 'shrink-0 rounded-full bg-gold-light px-3 py-2 text-sm font-semibold text-primary-deep';
const option = 'shrink-0 rounded-full border border-white/15 px-3 py-2 text-sm text-white/70';

export function ItineraryEditor({ tripId }: { tripId: string }) {
  const [data, setData] = useState<ItineraryPayload | null>(null);
  const [tab, setTab] = useState('ideas');
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
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

  useEffect(() => { void request().catch((cause) => setError(cause.message)); }, [tripId]);
  const active = data?.days.find((day) => day.id === tab);
  const places = tab === 'ideas' ? data?.ideas ?? [] : active?.places ?? [];
  const reorder = (targetId: string) => {
    if (!active || !dragged || dragged === targetId) return;
    const ids = places.map((place) => place.id);
    const from = ids.indexOf(dragged); const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    void request({ action: 'reorder', dayId: active.id, placeIds: ids }).catch((cause) => setError(cause.message));
    setDragged(null);
  };
  const curated = (data?.curatedPlaces ?? []).filter((place) =>
    (filter === 'all' || place.category === filter) && place.name.toLowerCase().includes(query.toLowerCase())
  );

  const add = async (place: CuratedPlace) => {
    if (!active) { setError('Choose or add a day first.'); return; }
    try { await request({ action: 'addPlace', dayId: active.id, placeId: place.id }); setPicker(false); } catch (cause) { setError((cause as Error).message); }
  };
  const share = async () => {
    try {
      const next = await request({ action: 'share' });
      await navigator.clipboard?.writeText(window.location.origin + '/share/trip/' + next.trip.share_token);
    } catch (cause) { setError((cause as Error).message); }
  };

  if (!data) return <div className="night-canvas min-h-screen p-6 text-white">{error ?? 'Loading itinerary…'}</div>;
  return <div className="night-canvas has-tabbar min-h-screen pb-20 text-white">
    <header className="mx-auto flex max-w-4xl items-center justify-between px-4 pb-4 pt-6 sm:px-6">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-gold-light">Itinerary</p><h1 className="mt-1 font-display text-2xl">{data.trip.title}</h1></div>
      <button onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded-btn border border-white/15 px-4 text-sm font-semibold"><Share2 size={16} />Share</button>
    </header>
    <main className="mx-auto max-w-4xl px-4 sm:px-6">
      <RouteMap places={places} destination={data.trip.destination} />
      <section className="-mt-5 relative rounded-t-[1.5rem] bg-[#101b2c] px-4 pb-6 pt-5 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => setTab('ideas')} className={tab === 'ideas' ? selected : option}>Ideas</button>
          {data.days.map((day) => <button key={day.id} onClick={() => setTab(day.id)} className={tab === day.id ? selected : option}>Day {day.day_index}</button>)}
          <button onClick={() => void request({ action: 'addDay' }).catch((cause) => setError(cause.message))} className="grid h-10 min-w-10 place-items-center rounded-full border border-dashed border-gold-light/50 text-gold-light"><Plus size={17} /></button>
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
        <div className="mt-3 flex items-center justify-between"><div><h2 className="font-semibold">{active ? 'Day ' + active.day_index : 'Unscheduled ideas'}</h2><p className="text-sm text-white/55">{active?.date ?? 'Add a day to start planning'}</p></div><button onClick={() => setPicker(true)} className="liquid-glass-accent inline-flex min-h-10 items-center gap-1.5 rounded-btn px-3 text-sm font-semibold text-primary-deep"><Plus size={15} />Add place</button></div>
        <div className="mt-4 space-y-2">{places.map((item, index) => <PlaceCard key={item.id} item={item} index={index} days={data.days} onDelete={() => void request({ action: 'delete', placeId: item.id }).catch((cause) => setError(cause.message))} onMove={(dayId) => void request({ action: 'move', placeId: item.id, dayId }).catch((cause) => setError(cause.message))} onDragStart={() => setDragged(item.id)} onDrop={() => reorder(item.id)} />)}
        {!places.length && <div className="rounded-card border border-dashed border-white/15 p-6 text-center text-sm text-white/55">No places here yet. Add a day, then choose curated places for {data.trip.destination}.</div>}</div>
      </section>
    </main>
    {picker && <div className="fixed inset-0 z-50 flex items-end bg-black/60 sm:items-center sm:justify-center"><div className="max-h-[88vh] w-full max-w-xl overflow-auto rounded-t-[1.5rem] bg-[#101b2c] p-5 sm:rounded-card"><div className="flex items-center justify-between"><h2 className="font-display text-xl">Add a place</h2><button onClick={() => setPicker(false)} className="p-2"><X size={20} /></button></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search places" className="mt-4 min-h-11 w-full rounded-btn border border-white/15 bg-white/5 px-3 text-white" /><div className="mt-3 flex gap-2 overflow-x-auto">{['all','spot','food','shopping','transport','other'].map((value) => <button key={value} onClick={() => setFilter(value)} className={filter === value ? selected : option}>{value === 'all' ? 'All' : labels[value]}</button>)}</div><div className="mt-4 space-y-2">{curated.map((place) => <button key={place.id} onClick={() => void add(place)} className="flex w-full gap-3 rounded-card border border-white/10 p-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-light/15 text-gold-light"><MapPin size={17} /></span><span className="min-w-0 flex-1"><b className="block">{place.name}</b><span className="block text-sm text-white/55">{place.description}</span></span><span className="text-xs text-white/60">{labels[place.category]}</span></button>)}{curated.length < 10 && <p className="py-3 text-center text-sm text-white/50">More places coming soon for {data.trip.destination}.</p>}</div></div></div>}
  </div>;
}

function PlaceCard({ item, index, days, onDelete, onMove, onDragStart, onDrop }: { item: ItineraryPlace; index: number; days: ItineraryDay[]; onDelete: () => void; onMove: (dayId: string) => void; onDragStart: () => void; onDrop: () => void }) {
  return <article draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="rounded-card border border-white/10 bg-white/[.035] p-3"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold-light text-xs font-bold text-primary-deep">{index + 1}</span><span className="min-w-0 flex-1"><b>{item.place.name}</b><span className="ml-2 text-xs text-white/55">{labels[item.category]}</span><p className="mt-1 text-sm text-white/55">{item.place.description}</p></span><button onClick={onDelete} className="p-1.5 text-white/45"><Trash2 size={16} /></button></div>{days.length > 1 && <select defaultValue="" onChange={(event) => event.target.value && onMove(event.target.value)} className="mt-3 ml-auto block rounded-lg border border-white/10 bg-[#16243a] px-2 py-1 text-xs text-white"><option value="" disabled>Move to day</option>{days.map((day) => <option value={day.id} key={day.id}>Day {day.day_index}</option>)}</select>}</article>;
}

function RouteMap({ places, destination }: { places: ItineraryPlace[]; destination: string }) {
  const node = useRef<HTMLDivElement>(null); const map = useRef<import('leaflet').Map | null>(null);
  useEffect(() => { let cancelled = false; void (async () => { const L = (await import('leaflet')).default; if (cancelled || !node.current) return; map.current?.remove(); const first = places[0]?.place; const instance = L.map(node.current, { zoomControl: false, scrollWheelZoom: false }).setView(first ? [Number(first.lat), Number(first.lng)] : [13.7563, 100.5018], first ? 12 : 4); L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 18 }).addTo(instance); const points: [number, number][] = []; places.forEach((item, index) => { const point: [number, number] = [Number(item.place.lat), Number(item.place.lng)]; points.push(point); L.marker(point, { icon: L.divIcon({ className: 'itinerary-pin', html: '<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:#111827;color:#fff;border:3px solid #d7ad68;font:700 12px sans-serif">' + (index + 1) + '</span>', iconSize: [28,28], iconAnchor: [14,14] }) }).addTo(instance).bindTooltip(item.place.name); }); if (points.length > 1) { L.polyline(points, { color: '#151515', weight: 4, opacity: .85 }).addTo(instance); instance.fitBounds(points, { padding: [28,28] }); } map.current = instance; })(); return () => { cancelled = true; map.current?.remove(); map.current = null; }; }, [places]);
  return <section className="overflow-hidden rounded-card border border-white/10 bg-[#e9edf0]"><div ref={node} className="h-72 w-full sm:h-80" aria-label={'Map for ' + destination} /></section>;
}