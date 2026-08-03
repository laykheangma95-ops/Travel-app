// Live layer for a destination: weather now, exchange rate today.
//
// Server-side and cached, so a hundred visitors to Tokyo cost one upstream
// call. Both providers degrade to null independently — the response is always
// 200 with whatever we actually have, because a missing weather panel is fine
// and a fabricated one is not.

import { NextResponse } from 'next/server';
import { getGuide, guideSlugs } from '@/content/destinations';
import { getWeather, describeWeather, WEATHER_REVALIDATE_SECONDS } from '@/lib/live/weather';
import { getRates } from '@/lib/live/rates';

export const revalidate = 900;

export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const guide = getGuide(params.slug);
  if (!guide) {
    return NextResponse.json({ error: 'unknown destination' }, { status: 404 });
  }

  const [weather, rates] = await Promise.all([
    getWeather(guide.geo.lat, guide.geo.lon, guide.geo.timezone),
    getRates(guide.basics.currency.code),
  ]);

  return NextResponse.json(
    {
      slug: guide.slug,
      timezone: guide.geo.timezone,
      weather: weather ? { ...weather, description: describeWeather(weather.code) } : null,
      rates,
    },
    {
      headers: {
        'Cache-Control': `public, s-maxage=${WEATHER_REVALIDATE_SECONDS}, stale-while-revalidate=3600`,
      },
    },
  );
}
