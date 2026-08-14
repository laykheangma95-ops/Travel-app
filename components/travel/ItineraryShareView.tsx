'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';

interface SharedDay { id: string; day_index: number; date: string | null; places: Array<{ id: string; place: { name: string; description: string; category: string } | null }> }
interface SharedTrip { title: string; destination: string; start_date: string | null; end_date: string | null }

export function ItineraryShareView({ token }: { token: string }) {
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [days, setDays] = useState<SharedDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fetch('/api/travel/itinerary/share/' + token).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? 'This itinerary is unavailable.');
    setTrip(body.trip); setDays(body.days ?? []);
  }).catch((cause) => setError(cause.message)); }, [token]);
  if (error) return <main className="night-canvas min-h-screen p-8 text-white">{error}</main>;
  if (!trip) return <main className="night-canvas min-h-screen p-8 text-white/60">Opening itinerary…</main>;
  return <main className="night-canvas min-h-screen px-4 py-10 text-white"><div className="mx-auto max-w-xl"><p className="text-xs font-semibold uppercase tracking-[.18em] text-gold-light">Shared itinerary</p><h1 className="mt-2 font-display text-3xl">{trip.title}</h1><p className="mt-2 text-white/60">{trip.destination}{trip.start_date ? ' · ' + trip.start_date : ''}</p><div className="mt-8 space-y-5">{days.map((day) => <section key={day.id} className="night-card p-5"><h2 className="font-semibold">Day {day.day_index}{day.date ? ' · ' + day.date : ''}</h2><ol className="mt-4 space-y-3">{day.places.map((item, index) => <li key={item.id} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold-light text-xs font-bold text-primary-deep">{index + 1}</span><span><b className="block">{item.place?.name ?? 'Place'}</b><span className="text-sm text-white/55">{item.place?.description}</span></span></li>)}</ol></section>)}</div><p className="mt-8 flex items-center gap-2 text-sm text-white/45"><MapPin size={15} /> Made with Domner</p></div></main>;
}