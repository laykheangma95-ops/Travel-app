import { Badge } from '@/components/ui/Badge';
import type { FlightStatusKind } from '@/types';

const statusConfig: Record<FlightStatusKind, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral'; pulse?: boolean }> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  'on-time': { label: '● On Time', tone: 'success' },
  delayed: { label: 'Delayed', tone: 'warning' },
  boarding: { label: '● Boarding', tone: 'accent', pulse: true },
  active: { label: '✈ In Flight', tone: 'info' },
  landed: { label: 'Landed', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  diverted: { label: 'Diverted', tone: 'danger' },
};

export function FlightStatusBadge({ status, delayMinutes }: { status: FlightStatusKind; delayMinutes?: number }) {
  const config = statusConfig[status];
  return (
    <Badge tone={config.tone} pulse={config.pulse}>
      {config.label}
      {status === 'delayed' && delayMinutes ? ` +${delayMinutes} min` : ''}
    </Badge>
  );
}
