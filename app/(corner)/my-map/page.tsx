// My Map (§5.4) — the memory journal. Client-only: it needs MapLibre, and
// every row it renders is scoped to the signed-in user by RLS.

'use client';

import dynamic from 'next/dynamic';

const MyMapView = dynamic(
  () => import('@/components/corner-map/MyMapView').then((m) => m.MyMapView),
  { ssr: false, loading: () => <div className="h-full w-full bg-dusk" /> }
);

export default function MyMapPage() {
  return <MyMapView />;
}
