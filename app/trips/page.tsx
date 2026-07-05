import { redirect } from 'next/navigation';

// /trips is an alias for the trips view inside the dashboard.
export default function TripsPage() {
  redirect('/my-trips');
}
