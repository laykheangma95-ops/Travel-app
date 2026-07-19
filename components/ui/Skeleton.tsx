import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-btn bg-surface-3', className)} aria-hidden="true" />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface-1 p-6 shadow-card">
      <Skeleton className="mb-4 h-10 w-10 rounded-full" />
      <Skeleton className="mb-2 h-5 w-2/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function FlightCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface-1 p-8 shadow-card">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-2 flex-1" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
    </div>
  );
}
