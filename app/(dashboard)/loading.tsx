import { CardSkeleton, Skeleton } from '@/components/ui/Skeleton';

/**
 * Dashboard streaming placeholder. Stays on the light utility surface the
 * dashboard uses (see .claude/skills/ui-ux §1 — light is the documented
 * variant for dense data screens) so there is no dark-to-light flash.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your travel dashboard…</span>
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['track', 'buy', 'trip'].map((k) => (
          <Skeleton key={k} className="h-[104px] rounded-card" />
        ))}
      </div>
      {['flights', 'esims', 'trips'].map((section) => (
        <div key={section}>
          <Skeleton className="mb-4 h-6 w-40" />
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}
