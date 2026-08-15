import type { Metadata } from 'next';
import { ItineraryShareView } from '@/components/travel/ItineraryShareView';
import { getSupabaseAdmin } from '@/lib/supabase';

// Every shared itinerary previewed as the same words.
//
// The page set one fixed title and no description or Open Graph tags, and the
// trip's own name and destination were fetched client-side — after any crawler
// had already read the page. Pasted into Telegram or Facebook, the way this
// link actually travels, every trip looked identical.
//
// generateMetadata resolves the trip on the server for the preview. It reads
// only what is already public: the same is_public + share_token gate the API
// route uses, and only the title and destination, never places or notes.
async function sharedTrip(token: string): Promise<{ title: string; destination: string } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from('trip_plans')
    .select('title, destination')
    .eq('share_token', token)
    .eq('is_public', true)
    .maybeSingle();
  return data ? { title: data.title as string, destination: data.destination as string } : null;
}

export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const trip = await sharedTrip(params.token);

  if (!trip) {
    return { title: 'Shared itinerary', robots: { index: false, follow: false } };
  }

  const title = `${trip.title} — a Domner itinerary`;
  const description = `Day by day in ${trip.destination}, shared from Domner.`;

  return {
    title,
    description,
    // Shared links are meant to be opened by the people they were sent to, not
    // found in search. The preview is for the chat app, not for Google.
    robots: { index: false, follow: false },
    openGraph: { title, description, type: 'article', siteName: 'Domner' },
    twitter: { card: 'summary', title, description },
  };
}

export default function SharedTripPage({ params }: { params: { token: string } }) {
  return <ItineraryShareView token={params.token} />;
}
