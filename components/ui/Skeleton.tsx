import { cn } from '@/lib/utils';

/**
 * Placeholder block. `dark` switches to the night palette so skeletons can be
 * used on `.night-canvas` routes — the light-only version was unusable there,
 * which is part of why the nocturnal funnel shipped with no loading state.
 */
export function Skeleton({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <div
      className={cn('animate-pulse rounded-btn', dark ? 'bg-white/10' : 'bg-surface-3', className)}
      aria-hidden="true"
    />
  );
}

export function CardSkeleton({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={cn(
        'p-6',
        dark ? 'night-card' : 'rounded-card border border-line bg-white shadow-card'
      )}
    >
      <Skeleton dark={dark} className="mb-4 h-10 w-10 rounded-full" />
      <Skeleton dark={dark} className="mb-2 h-5 w-2/3" />
      <Skeleton dark={dark} className="mb-2 h-4 w-full" />
      <Skeleton dark={dark} className="h-4 w-1/2" />
    </div>
  );
}

export function FlightCardSkeleton({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={cn(
        'p-8',
        dark ? 'night-card' : 'rounded-card border border-line bg-white shadow-card'
      )}
    >
      <div className="mb-6 flex items-center justify-between">
        <Skeleton dark={dark} className="h-8 w-32" />
        <Skeleton dark={dark} className="h-6 w-24 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-6">
        <div className="space-y-2">
          <Skeleton dark={dark} className="h-10 w-20" />
          <Skeleton dark={dark} className="h-4 w-28" />
        </div>
        <Skeleton dark={dark} className="h-2 flex-1" />
        <div className="space-y-2">
          <Skeleton dark={dark} className="h-10 w-20" />
          <Skeleton dark={dark} className="h-4 w-28" />
        </div>
      </div>
    </div>
  );
}

/** Destination/plan grid placeholder — mirrors the real card grid on /esim. */
export function DestinationGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="night-card p-6">
          <Skeleton dark className="h-[60px] w-[60px] rounded-full" />
          <Skeleton dark className="mt-4 h-5 w-3/4" />
          <Skeleton dark className="mt-2 h-4 w-1/2" />
          <div className="mt-4 flex items-center justify-between">
            <Skeleton dark className="h-4 w-16" />
            <Skeleton dark className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
