import { redirect } from 'next/navigation';

// /my-trips is now an alias for /trips.
//
// It used to render two hardcoded trips ("Bangkok Weekend", "Japan Cherry
// Blossom") that every visitor saw identically, while their real trip_plans rows
// were invisible — the same class of bug that "My eSIMs" already had fixed.
// /trips reads the actual table, so keeping two trip lists would only guarantee
// one of them is wrong. The old URL still works.
export default function MyTripsPage() {
  redirect('/trips');
}
