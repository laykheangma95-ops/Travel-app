// The Corner Map (§5.1). Map-first: everything else floats over it.
//
// Rendered client-side only — MapLibre needs a real canvas and the whole
// surface is driven by "how long ago", which the server cannot know.

'use client';

import dynamic from 'next/dynamic';
import { useLang } from '@/lib/i18n';

const CornerMapView = dynamic(
  () => import('@/components/corner-map/CornerMapView').then((m) => m.CornerMapView),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  }
);

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-dusk">
      {/* A resting marigold ring, not a spinner — §5.1 is explicit that this
          surface never shows a spinner-forever. */}
      <span className="h-8 w-8 rounded-full border border-live/40" aria-hidden="true" />
      <span className="sr-only">
        <Loading />
      </span>
    </div>
  );
}

function Loading() {
  const { t } = useLang();
  return <>{t('corner.locating')}</>;
}

export default function MapPage() {
  return <CornerMapView />;
}
