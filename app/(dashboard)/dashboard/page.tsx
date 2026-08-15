import { redirect } from 'next/navigation';

// /dashboard is now an alias for Home.
//
// It used to render three hardcoded fixtures — a flight "QH215 · Tomorrow",
// an active Thailand eSIM with "5 days left, 42% used", and a "Bangkok Weekend"
// trip — with no data fetching anywhere in the file. Every visitor saw the same
// invented travel, and because `consumeReturnTo()` falls back here, that was the
// first screen after every sign-in and sign-up: a stranger's itinerary,
// presented as your account.
//
// This is the same class of bug already fixed in /my-trips and /my-esims, and it
// gets the same fix. Home is the real version of this page: TravelDeck reads
// /api/travel/state and renders the actual active trip, flight, eSIM and trip
// readiness, and it renders nothing at all when there is nothing on record —
// which is the honest answer a fixture cannot give.
export default function DashboardPage() {
  redirect('/');
}
