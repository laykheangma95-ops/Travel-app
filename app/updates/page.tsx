import type { Metadata } from 'next';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

export const metadata: Metadata = {
  title: 'Updates',
  description: 'Flight changes, eSIM data, trip reminders and weather — everything Domner has told you, in one place.',
  // The inbox is personal. Keeping it out of search results is not a privacy
  // control (RLS is), but there is nothing here for a crawler either.
  robots: { index: false, follow: false },
};

export default function UpdatesPage() {
  return (
    <div className="night-canvas has-tabbar relative min-h-screen">
      <div className="night-stars" aria-hidden="true" />
      <div className="relative">
        <NotificationCenter />
      </div>
    </div>
  );
}
