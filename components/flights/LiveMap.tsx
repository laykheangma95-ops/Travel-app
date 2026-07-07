'use client';

// Dark premium live map (Leaflet + CARTO dark tiles) with a heading-rotated
// plane icon, the planned route line, and the aircraft's live trail —
// FlightRadar24-style.

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker, Polyline } from 'leaflet';
import { getAirportCoords } from '@/lib/airportCoords';

interface LiveMapProps {
  lat: number;
  lon: number;
  headingDeg: number | null;
  depIata?: string;
  arrIata?: string;
  callsign: string;
}

function planeIconHtml(heading: number): string {
  return `<div style="transform: rotate(${heading}deg); width:44px; height:44px; display:flex; align-items:center; justify-content:center; filter: drop-shadow(0 0 8px rgba(249,115,22,0.85));">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="#F97316" stroke="#0A1628" stroke-width="0.5" aria-hidden="true">
      <path d="M12 1.6 L13.4 8 L21.4 12.4 L21.4 14.3 L13.4 11.9 L13.4 17.2 L15.7 19.4 L15.7 21.3 L12 20 L8.3 21.3 L8.3 19.4 L10.6 17.2 L10.6 11.9 L2.6 14.3 L2.6 12.4 L10.6 8 Z"/>
    </svg>
  </div>`;
}

export function LiveMap({ lat, lon, headingDeg, depIata, arrIata, callsign }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const planeRef = useRef<Marker | null>(null);
  const trailRef = useRef<Polyline | null>(null);
  const trailPoints = useRef<[number, number][]>([]);
  const userMoved = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      // Create the map once.
      if (!mapRef.current) {
        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false, // don't hijack page scroll
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap contributors © CARTO',
          subdomains: 'abcd',
          maxZoom: 12,
        }).addTo(map);
        map.on('dragstart', () => {
          userMoved.current = true;
        });
        map.on('zoomstart', () => {
          userMoved.current = true;
        });
        mapRef.current = map;

        // Planned route overlay: dashed line between origin and destination.
        const dep = getAirportCoords(depIata);
        const arr = getAirportCoords(arrIata);
        if (dep && arr) {
          L.polyline([dep, arr], {
            color: '#94A3B8',
            weight: 1.5,
            dashArray: '5 9',
            opacity: 0.65,
          }).addTo(map);
          L.circleMarker(dep, { radius: 5, color: '#F97316', fillColor: '#F97316', fillOpacity: 1, weight: 1 })
            .addTo(map)
            .bindTooltip(depIata ?? '', { permanent: false });
          L.circleMarker(arr, { radius: 5, color: '#10B981', fillColor: '#10B981', fillOpacity: 1, weight: 1 })
            .addTo(map)
            .bindTooltip(arrIata ?? '', { permanent: false });
          map.fitBounds(L.latLngBounds([dep, arr, [lat, lon]]).pad(0.18));
        } else {
          map.setView([lat, lon], 7);
        }
      }

      // Plane marker: rotated to the current heading each update.
      const icon = L.divIcon({
        className: 'live-plane-marker',
        html: planeIconHtml(headingDeg ?? 0),
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      if (!planeRef.current) {
        planeRef.current = L.marker([lat, lon], { icon, keyboard: false })
          .addTo(mapRef.current)
          .bindTooltip(callsign, { direction: 'top', offset: [0, -18] });
      } else {
        planeRef.current.setLatLng([lat, lon]);
        planeRef.current.setIcon(icon);
      }

      // Flown trail accumulates while the page is open.
      const last = trailPoints.current[trailPoints.current.length - 1];
      if (!last || last[0] !== lat || last[1] !== lon) {
        trailPoints.current.push([lat, lon]);
      }
      if (!trailRef.current) {
        trailRef.current = L.polyline(trailPoints.current, {
          color: '#F97316',
          weight: 2.5,
          opacity: 0.9,
        }).addTo(mapRef.current);
      } else {
        trailRef.current.setLatLngs(trailPoints.current);
      }

      // Follow the aircraft unless the user has taken control of the map.
      if (!userMoved.current) {
        mapRef.current.panTo([lat, lon], { animate: true, duration: 1 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lon, headingDeg, depIata, arrIata, callsign]);

  // Tear the map down when the panel unmounts.
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      planeRef.current = null;
      trailRef.current = null;
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className="h-80 w-full bg-[#0A1628] sm:h-96"
      role="img"
      aria-label={`Live map showing the position and heading of flight ${callsign}`}
    />
  );
}
