'use client';

/**
 * ArrivalHero — chapter one, and the payoff for the flight.
 *
 * It occupies exactly the space the greeting and search field just left, over
 * the same globe, mid-descent. Nothing navigated; the copy simply changed
 * while the planet turned underneath it.
 *
 * The two readouts are the whole emotional trick: the local clock is computed
 * live from the IANA zone (so it *ticks*, and it is genuinely correct), and
 * the weather is a real current reading when the keyless lookup succeeds,
 * falling back to the seasonal normal — always labelled honestly as one or the
 * other. Together they turn a country name into a place that exists right now.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { localClock, fetchWeather, type LocalClock, type LiveWeather } from '@/lib/destinationLive';
import { useLang } from '@/lib/i18n';
import type { Destination, DestinationProfile } from '@/types';

interface ArrivalHeroProps {
  dest: Destination;
  profile: DestinationProfile;
  onClear: () => void;
}

export function ArrivalHero({ dest, profile, onClear }: ArrivalHeroProps) {
  const { t, lang } = useLang();
  const [clock, setClock] = useState<LocalClock | null>(null);
  const [weather, setWeather] = useState<LiveWeather | null>(null);

  // Live clock. Rendered only after mount — the server's timezone is not the
  // visitor's, and a mismatched first paint would flash the wrong hour.
  useEffect(() => {
    const tick = () => setClock(localClock(profile.timezone));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [profile.timezone]);

  // Current conditions, with the profile's seasonal normal as the fallback.
  useEffect(() => {
    const ctrl = new AbortController();
    setWeather({ ...profile.climate, live: false });
    fetchWeather(profile.lat, profile.lon, ctrl.signal).then((live) => {
      if (live) setWeather(live);
    });
    return () => ctrl.abort();
  }, [profile.lat, profile.lon, profile.climate]);

  const primary = lang === 'km' ? dest.nameKm : dest.name;
  const secondary = lang === 'km' ? dest.name : dest.nameKm;

  return (
    // The cue is a sibling, not a child: `.arv` animates `filter`, and any
    // non-`none` filter makes an element the containing block for absolutely
    // positioned descendants — which would pin the cue to the bottom of this
    // card instead of the bottom of the screen.
    <>
    <div className="arv" key={dest.slug}>
      <button type="button" className="arv-back" onClick={onClear}>
        <ArrowLeft size={15} aria-hidden="true" />
        {t('home.back')}
      </button>

      <p className="arv-eyebrow">
        <span className="arv-flag" aria-hidden="true">
          {dest.flag}
        </span>
        {t('j.ch1')} · {dest.region}
      </p>

      <h1 className="arv-name">{primary}</h1>
      <p className="arv-alt" lang={lang === 'km' ? 'en' : 'km'}>
        {secondary}
      </p>
      <p className="arv-essence">{profile.essence}</p>

      <dl className="arv-live">
        <div className="arv-live-cell">
          <dt>{t('j.localTime')}</dt>
          <dd>
            <span className="arv-clock font-mono">{clock?.time ?? '——:——'}</span>
            <span className="arv-live-note">
              {clock ? `${profile.city} · ${clock.relative}` : profile.city}
            </span>
          </dd>
        </div>
        <div className="arv-live-cell">
          <dt>{t('j.weather')}</dt>
          <dd>
            <span className="arv-clock font-mono">
              {weather ? `${weather.tempC}°C` : '——'}
            </span>
            <span className="arv-live-note">
              {weather
                ? `${weather.summary} · ${weather.live ? t('j.liveNow') : t('j.seasonal')}`
                : profile.climate.summary}
            </span>
          </dd>
        </div>
      </dl>
    </div>

    <div className="dgh-cue" aria-hidden="true">
      <ChevronDown size={16} />
      <span>{t('home.scrollCue')}</span>
    </div>
    </>
  );
}
