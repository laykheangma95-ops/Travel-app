'use client';

/**
 * FlightRouteGlobe — the seatback route view: flight focus mode of the shared
 * globe engine (components/globe/globeEngine).
 *
 * The camera frames origin → destination; a gold great-circle route line
 * connects the two airports (coords from lib/airportCoords); the live
 * aircraft from the keyless /api/flights/live feed sits on the route with its
 * real position and heading, marked by a subtle gold pulse. Over the canvas,
 * seatback-style readouts: airline + flight number (with a gold monogram
 * badge — the keyless stand-in for an airline logo, real logos are an
 * optional later upgrade), origin/destination country names in Khmer and
 * English, progress along the route, remaining distance, altitude and speed.
 *
 * Rendering rules match the home spine: lazy three.js, pauses off-screen and
 * on hidden tabs, and honours prefers-reduced-motion with a static frame.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plane } from 'lucide-react';
import type * as ThreeNS from 'three';
import {
  createGlobeEngine,
  latLonToXYZ,
  ARC_VERT,
  HUB_VERT,
  HUB_FRAG,
} from '@/components/globe/globeEngine';
import { getAirportCoords, getAirportCountry } from '@/lib/airportCoords';
import { haversineKm } from '@/lib/liveFlight';
import type { LiveFlightData } from '@/lib/liveFlight';
import type { FlightStatus } from '@/types';

// Gold great-circle route: bright up to uProgress (flown), faint ahead.
const ROUTE_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uProgress;
  uniform vec3 uFlown;
  uniform vec3 uAhead;
  varying float vT;
  void main() {
    float ends = smoothstep(0.0, 0.04, vT) * (1.0 - smoothstep(0.96, 1.0, vT));
    float flown = 1.0 - smoothstep(uProgress - 0.02, uProgress + 0.02, vT);
    vec3 col = mix(uAhead, uFlown, flown);
    float a = mix(0.4, 0.95, flown) * ends;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
  }
`;

interface FlightRouteGlobeProps {
  flight: FlightStatus;
  live: LiveFlightData | null;
}

interface GlobeApi {
  setAircraft(fix: { lat: number; lon: number; headingDeg: number | null } | null, progress: number | null): void;
}

export function FlightRouteGlobe({ flight, live }: FlightRouteGlobeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<GlobeApi | null>(null);
  const [ready, setReady] = useState(false);

  const depIata = flight.departure.airport;
  const arrIata = flight.arrival.airport;
  const dep = getAirportCoords(depIata);
  const arr = getAirportCoords(arrIata);
  const depCountry = getAirportCountry(depIata);
  const arrCountry = getAirportCountry(arrIata);
  const airlineCode = flight.flightNumber.replace(/\s+/g, '').slice(0, 2).toUpperCase();

  /* ── Progress + remaining distance along the route ── */
  const totalKm = dep && arr ? haversineKm(dep, arr) : null;
  const { progress, remainingKm } = useMemo(() => {
    if (!dep || !arr || !totalKm || totalKm < 50) return { progress: null, remainingKm: null };
    if (live && !live.onGround) {
      const flown = haversineKm(dep, [live.lat, live.lon]);
      return {
        progress: Math.min(0.98, Math.max(0.02, flown / totalKm)),
        remainingKm: haversineKm([live.lat, live.lon], arr),
      };
    }
    if (typeof flight.progress === 'number') {
      const p = Math.min(1, Math.max(0, flight.progress / 100));
      return { progress: p, remainingKm: totalKm * (1 - p) };
    }
    return { progress: null, remainingKm: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, flight.progress, depIata, arrIata]);

  // Latest fix for the async init to pick up once the scene exists.
  const liveRef = useRef<{ live: LiveFlightData | null; progress: number | null }>({ live, progress });
  liveRef.current = { live, progress };

  /* ── Scene: engine in flight focus mode ── */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !dep || !arr) return;

    let disposed = false;
    let disposeScene: (() => void) | null = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const isMobile = coarse || window.innerWidth < 768;

    async function init() {
      // Lighter dot field than the home hero — this panel shares the page
      // with a Leaflet map and telemetry.
      const engine = await createGlobeEngine(canvas as HTMLCanvasElement, {
        isMobile,
        dotCount: isMobile ? 6000 : 14000,
        starCount: isMobile ? 350 : 700,
      });
      if (disposed) {
        engine.dispose();
        return;
      }
      const { THREE, camera, tiltGroup, spinGroup, track } = engine;

      const A = new THREE.Vector3(...latLonToXYZ(dep![0], dep![1]));
      const B = new THREE.Vector3(...latLonToXYZ(arr![0], arr![1]));
      const theta = A.angleTo(B);

      /* ── Frame the route: midpoint faces the camera, route runs level ── */
      const zAxis = A.clone().add(B).normalize();
      if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1); // antipodal fallback
      const xAxis = B.clone().sub(A).addScaledVector(zAxis, -B.clone().sub(A).dot(zAxis));
      if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0);
      xAxis.normalize();
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      spinGroup.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).transpose(),
      );

      /* ── Gold great-circle route line ── */
      const slerpAB = (t: number) => {
        const s = Math.sin(theta);
        if (s < 1e-5) return A.clone().lerp(B, t).normalize();
        return A.clone()
          .multiplyScalar(Math.sin((1 - t) * theta) / s)
          .addScaledVector(B, Math.sin(t * theta) / s)
          .normalize();
      };
      const lift = 0.05 + 0.12 * (theta / Math.PI);
      const SEG = 72;
      const routePts: ThreeNS.Vector3[] = [];
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        routePts.push(slerpAB(t).multiplyScalar(1.012 + lift * Math.sin(Math.PI * t)));
      }
      const routeGeo = track(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(routePts), 96, 0.006, 6, false),
      );
      const routeMat = track(
        new THREE.ShaderMaterial({
          vertexShader: ARC_VERT,
          fragmentShader: ROUTE_FRAG,
          uniforms: {
            uProgress: { value: 0 },
            uFlown: { value: new THREE.Color('#f7eac0') },
            uAhead: { value: new THREE.Color('#e6cb8b') },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      spinGroup.add(new THREE.Mesh(routeGeo, routeMat));

      /* ── Origin / destination airport nodes ── */
      const nodeGeo = track(new THREE.BufferGeometry());
      nodeGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [...A.clone().multiplyScalar(1.008).toArray(), ...B.clone().multiplyScalar(1.008).toArray()],
          3,
        ),
      );
      nodeGeo.setAttribute('aHover', new THREE.Float32BufferAttribute([0.35, 0.35], 1));
      nodeGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute([0, Math.PI * 0.7], 1));
      const nodeMat = track(
        new THREE.ShaderMaterial({
          vertexShader: HUB_VERT,
          fragmentShader: HUB_FRAG,
          uniforms: {
            uTime: { value: 0 },
            uScale: { value: 1 },
            uGlobeScale: { value: 1 },
            uColor: { value: new THREE.Color('#ffe9bd') },
            uHoverColor: { value: new THREE.Color('#f7eac0') },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      spinGroup.add(new THREE.Points(nodeGeo, nodeMat));
      engine.pointMats.push(nodeMat);
      engine.timeMats.push(nodeMat);

      /* ── Live aircraft: gold jet + subtle pulsing halo ── */
      const planeGroup = new THREE.Group();
      planeGroup.visible = false;
      spinGroup.add(planeGroup);
      const jetGeo = track(new THREE.ConeGeometry(0.016, 0.052, 4));
      const jetMat = track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#f7eac0'),
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const jet = new THREE.Mesh(jetGeo, jetMat);
      planeGroup.add(jet);

      // Soft radial halo texture, generated — no asset request.
      const haloCanvas = document.createElement('canvas');
      haloCanvas.width = haloCanvas.height = 64;
      const ctx = haloCanvas.getContext('2d');
      if (ctx) {
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(247, 234, 192, 0.9)');
        g.addColorStop(0.4, 'rgba(230, 203, 139, 0.35)');
        g.addColorStop(1, 'rgba(230, 203, 139, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
      }
      const haloTex = track(new THREE.CanvasTexture(haloCanvas));
      const haloMat = track(
        new THREE.SpriteMaterial({
          map: haloTex,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(0.09);
      planeGroup.add(halo);

      const up = new THREE.Vector3(0, 1, 0);
      const setAircraft: GlobeApi['setAircraft'] = (fix, progress01) => {
        routeMat.uniforms.uProgress.value = progress01 ?? 0;
        if (!fix) {
          planeGroup.visible = false;
          if (reducedMotion) engine.renderOnce();
          return;
        }
        const P = new THREE.Vector3(...latLonToXYZ(fix.lat, fix.lon));
        // Real position, hugging the drawn arc's height at its progress point
        // so the jet sits on the line like a seatback display.
        const t = Math.min(1, Math.max(0, progress01 ?? 0.5));
        planeGroup.position.copy(P).multiplyScalar(1.012 + lift * Math.sin(Math.PI * t));
        // Real heading: rotate the jet within the surface tangent plane.
        const north = up.clone().addScaledVector(P, -P.y);
        if (north.lengthSq() > 1e-6) {
          north.normalize();
          const east = new THREE.Vector3().crossVectors(north, P).normalize();
          const h = (((fix.headingDeg ?? 0) % 360) * Math.PI) / 180;
          const dir = north.multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h)).normalize();
          jet.quaternion.setFromUnitVectors(up, dir);
        }
        planeGroup.visible = true;
        if (reducedMotion) engine.renderOnce();
      };
      apiRef.current = { setAircraft };

      // Subtle pulse — the seatback blip.
      engine.onFrame((_dt, time) => {
        if (!planeGroup.visible) return;
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
        haloMat.opacity = 0.32 + 0.28 * pulse;
        halo.scale.setScalar(0.075 + 0.03 * pulse);
      });

      /* ── Layout: zoom the camera so the route fills the frame ── */
      const layout = () => {
        const w = wrap!.clientWidth;
        const h = wrap!.clientHeight;
        engine.setViewport(w, h);
        const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
        const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
        // Route runs horizontally — fit its half-chord into ~58% of the
        // narrower half-view, clamped between seatback close-up and full disc.
        const fit = Math.min(Math.tan(hHalf), Math.tan(vHalf) * 1.35);
        const halfChord = Math.max(Math.sin(theta / 2), 0.06);
        // Never closer than 2.05 — the sphere must always read as a planet
        // horizon, not a wall of dots.
        camera.position.z = THREE.MathUtils.clamp(
          Math.cos(theta / 2) + halfChord / (0.62 * fit),
          2.05,
          3.6,
        );
        // Raise the globe a touch so the route arc sits in the clear zone
        // above the seatback readout panel.
        tiltGroup.position.y = 0.09;
        if (reducedMotion) engine.renderOnce();
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(wrap!);

      /* ── Run only while visible ── */
      let inView = true;
      let pageVisible = !document.hidden;
      const setRunning = () => {
        if (inView && pageVisible && !reducedMotion) engine.start();
        else engine.stop();
      };
      const viewIO = new IntersectionObserver(
        (entries) => {
          inView = entries.some((e) => e.isIntersecting);
          setRunning();
        },
        { threshold: 0 },
      );
      viewIO.observe(wrap!);
      const onVisibility = () => {
        pageVisible = !document.hidden;
        setRunning();
      };
      document.addEventListener('visibilitychange', onVisibility);

      // Apply the fix that arrived while three.js was loading, then go live.
      const pending = liveRef.current;
      setAircraft(pending.live && !pending.live.onGround ? pending.live : null, pending.progress);
      if (reducedMotion) engine.renderOnce();
      else engine.start();
      setReady(true);

      disposeScene = () => {
        ro.disconnect();
        viewIO.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        apiRef.current = null;
        engine.dispose();
      };
    }

    init().catch((err) => {
      // WebGL/import failure — the readout overlay still tells the story.
      console.warn('FlightRouteGlobe: globe unavailable:', err);
    });

    return () => {
      disposed = true;
      disposeScene?.();
    };
    // Re-frame only when the route itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depIata, arrIata]);

  /* Push each new fix into the scene. */
  useEffect(() => {
    apiRef.current?.setAircraft(live && !live.onGround ? live : null, progress);
  }, [live, progress]);

  // No coordinates for one of the airports — skip the panel entirely.
  if (!dep || !arr) return null;

  const fmtKm = (km: number) => `${Math.round(km).toLocaleString()} km`;

  return (
    <article className="relative mt-6 overflow-hidden rounded-card border border-white/10 bg-[#050b2e] shadow-card-hover">
      <div ref={wrapRef} className="relative aspect-[4/5] w-full sm:aspect-[16/9]">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden="true"
        />

        {/* Status chip */}
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/15 bg-[#0a1428]/70 px-3 py-1.5 backdrop-blur">
          {live && !live.onGround ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/80">Live route</span>
            </>
          ) : (
            <>
              <span className="inline-flex h-2 w-2 rounded-full bg-gold-light/70" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Route</span>
            </>
          )}
        </div>

        {/* ── Seatback readouts ── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 sm:p-5">
          <div className="rounded-card border border-white/10 bg-[#0a1428]/80 p-4 backdrop-blur-md sm:p-5">
            {/* Airline identity + telemetry */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {/* Designed monogram badge — the keyless, self-hosted stand-in
                    for an airline logo (real logos: optional later upgrade). */}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold-light/60 bg-[linear-gradient(160deg,#E6CB8B_0%,#C69749_55%,#8A6820_100%)] font-display text-sm font-extrabold tracking-wide text-primary-deep shadow-[inset_0_1px_0_rgba(255,253,244,0.65),0_4px_14px_rgba(198,151,73,0.35)]">
                  {airlineCode}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold text-white">{flight.airline}</p>
                  <p className="font-mono text-xs tracking-wide text-gold-light">{flight.flightNumber}</p>
                </div>
              </div>
              <dl className="flex shrink-0 items-center gap-4 text-right font-mono text-xs">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/40">Altitude</dt>
                  <dd className="font-semibold text-white">
                    {live?.altitudeFt != null ? `${live.altitudeFt.toLocaleString()} ft` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/40">Speed</dt>
                  <dd className="font-semibold text-white">
                    {live?.groundSpeedKt != null ? `${Math.round(live.groundSpeedKt * 1.852)} km/h` : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Route strip: origin — progress — destination */}
            <div className="mt-4 flex items-center gap-3 sm:gap-5">
              <div className="min-w-0 shrink-0">
                <p className="font-mono text-lg font-bold leading-none text-white">{depIata}</p>
                {depCountry && (
                  <p className="mt-1 truncate text-[11px] leading-tight text-white/60">
                    {depCountry.en} · <span className="font-khmer">{depCountry.km}</span>
                  </p>
                )}
              </div>

              <div className="relative h-1 min-w-0 flex-1 rounded-full bg-white/15">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#C69749,#F7EAC0)]"
                  style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                />
                {progress !== null && (
                  <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${Math.round(progress * 100)}%` }}
                  >
                    <Plane
                      size={16}
                      className="rotate-45 fill-gold-bright text-gold-bright drop-shadow-[0_0_6px_rgba(230,203,139,0.9)]"
                      aria-hidden="true"
                    />
                  </span>
                )}
              </div>

              <div className="min-w-0 shrink-0 text-right">
                <p className="font-mono text-lg font-bold leading-none text-white">{arrIata}</p>
                {arrCountry && (
                  <p className="mt-1 truncate text-[11px] leading-tight text-white/60">
                    {arrCountry.en} · <span className="font-khmer">{arrCountry.km}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Progress + remaining distance */}
            <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] text-white/50">
              <span>{progress !== null ? `${Math.round(progress * 100)}% of route` : 'Awaiting live position'}</span>
              <span>
                {remainingKm !== null
                  ? `${fmtKm(remainingKm)} to go`
                  : totalKm
                    ? `${fmtKm(totalKm)} route`
                    : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
