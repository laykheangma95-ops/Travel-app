import { DestinationGridSkeleton, Skeleton } from '@/components/ui/Skeleton';

/**
 * Streaming placeholder for the eSIM store. Mirrors the real layout (heading,
 * search, filter row, card grid) so the page settles into place instead of
 * jumping — the route previously rendered nothing until it was fully ready.
 */
export default function EsimStoreLoading() {
  return (
    <div className="night-canvas min-h-screen" aria-busy="true" aria-live="polite">
      <div className="night-stars" aria-hidden="true" />
      <span className="sr-only">Loading destinations…</span>
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <Skeleton dark className="h-4 w-28" />
          <Skeleton dark className="mt-3 h-9 w-64" />
          <Skeleton dark className="mt-4 h-4 w-full max-w-md" />
        </div>
        <Skeleton dark className="mb-6 h-[50px] w-full max-w-xl rounded-btn" />
        <div className="mb-10 flex flex-wrap gap-2">
          {['w-14', 'w-16', 'w-28', 'w-32', 'w-20', 'w-24'].map((w) => (
            <Skeleton key={w} dark className={`h-9 rounded-full ${w}`} />
          ))}
        </div>
        <DestinationGridSkeleton count={8} />
      </div>
    </div>
  );
}
