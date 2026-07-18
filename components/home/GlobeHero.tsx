'use client';

/**
 * GlobeHero — cinematic 3D particle-globe hero + scroll-narrative spine.
 *
 * A standalone, drop-in <section>. Every style is scoped under the `dgh-`
 * (Domner Globe Hero) prefix so nothing leaks into the rest of the site.
 *
 * Tech:
 *  - Three.js (lazy-loaded when the section enters the viewport) renders the
 *    globe as ~20k glowing dots mapped to real continent landmass data
 *    (Natural Earth 110m, embedded as a bit mask in ./globeLandMask).
 *  - GSAP + ScrollTrigger (also lazy-loaded) drive the entrance reveal and
 *    the scroll-linked lift/fade of the hero copy.
 *  - Custom shaders: dot flicker + limb fade, fresnel atmosphere rim,
 *    travelling arc pulses, rising hub beams, twinkling starfield.
 *  - Live flights: /api/flights/sky (keyless ADS-B) supplies real aircraft
 *    around the beamed hub cities, drawn as pulsing markers with ground-track
 *    streaks, dead-reckoned at true speed between refreshes and hoverable for
 *    callsign + altitude. The layer fails soft to an empty sky.
 *
 * Scroll spine: the canvas lives in a sticky viewport-sized wrapper inside
 * .dgh-stage. Scroll position is sampled every frame against a keyframe track:
 * through the hero and Cambodia showcase the sphere's centre is glued to the
 * seam between the two sections (so it reads as a planet printed on the page),
 * then it detaches and glides between the narrative chapters that follow
 * (see GlobeChapters) — repositioning, rescaling and rotating to face each
 * chapter's destination while the copy tells the story alongside.
 *
 * Interactivity: 3-layer mouse parallax (globe / stars / clouds), drag to
 * spin with inertia (desktop), hub hover -> pulse + city label, gyroscope
 * parallax on Android, scroll scrub. Honours prefers-reduced-motion by
 * rendering static frames with no animation beyond the page's own scroll.
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type * as ThreeNS from 'three';
import { useLang } from '@/lib/i18n';
import { isLand } from './globeLandMask';

/* ────────────────────────── Scene data ────────────────────────── */

type Hub = { name: string; lat: number; lon: number; beam?: boolean };

// Connection hubs. Phnom Penh first — it is the brand's home hub.
const HUBS: Hub[] = [
  { name: 'Phnom Penh', lat: 11.56, lon: 104.92, beam: true },
  { name: 'Bangkok', lat: 13.75, lon: 100.5 },
  { name: 'Singapore', lat: 1.35, lon: 103.82, beam: true },
  { name: 'Hong Kong', lat: 22.32, lon: 114.17 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69, beam: true },
  { name: 'Seoul', lat: 37.57, lon: 126.98 },
  { name: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'Dubai', lat: 25.2, lon: 55.27, beam: true },
  { name: 'Istanbul', lat: 41.01, lon: 28.98 },
  { name: 'Paris', lat: 48.86, lon: 2.35 },
  { name: 'London', lat: 51.51, lon: -0.13, beam: true },
  { name: 'New York', lat: 40.71, lon: -74.01, beam: true },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
];

// 16 arc routes between hub indices (mostly radiating from Phnom Penh).
const ARC_ROUTES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 7], [0, 13],
  [2, 13], [3, 12], [4, 12], [7, 10], [7, 8], [8, 9],
  [10, 11], [11, 12], [6, 7],
];

/** Latitude/longitude (degrees) to a unit-sphere position. */
function latLonToXYZ(lat: number, lon: number): [number, number, number] {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

/* ────────────────────────── Shaders ────────────────────────── */

const DOTS_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uScale;      // px-per-world-unit at z=1
  uniform float uGlobeScale; // globe group scale (points ignore parent scale for size)
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Fade dots as they turn away from the camera (soft limb).
    vec3 n = normalize(normalMatrix * normalize(position));
    float facing = smoothstep(-0.05, 0.45, n.z);
    // Gentle city-light flicker, unique phase per dot.
    float flicker = 0.72 + 0.28 * sin(uTime * 1.4 + aPhase);
    vAlpha = facing * flicker;
    gl_PointSize = aSize * uGlobeScale * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DOTS_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.14, d) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fresnel rim on a back-side sphere: brightest at the silhouette edge.
const ATMO_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  void main() {
    float rim = pow(clamp(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 4.5);
    gl_FragColor = vec4(uColor, 1.0) * rim * uIntensity;
  }
`;

const ARC_VERT = /* glsl */ `
  varying float vT;
  void main() {
    vT = uv.x; // 0..1 along the tube
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Faint base line + a gaussian light pulse travelling from 0 -> 1.
const ARC_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uPulse;
  uniform float uAlpha;
  uniform vec3 uColor;
  uniform vec3 uPulseColor;
  varying float vT;
  void main() {
    float ends = smoothstep(0.0, 0.10, vT) * (1.0 - smoothstep(0.90, 1.0, vT));
    float d = vT - uPulse;
    float pulse = exp(-d * d * 320.0);
    vec3 col = uColor * 0.35 + uPulseColor * pulse;
    float a = (0.24 + pulse) * uAlpha * ends;
    if (a < 0.015) discard;
    gl_FragColor = vec4(col, a);
  }
`;

const BEAM_VERT = /* glsl */ `
  varying float vY;
  void main() {
    vY = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  uniform float uPhase;
  uniform vec3 uColor;
  varying float vY;
  void main() {
    float breathe = 0.55 + 0.45 * sin(uTime * 0.9 + uPhase);
    float a = pow(1.0 - vY, 2.6) * 0.55 * breathe;
    gl_FragColor = vec4(uColor, a);
  }
`;

const HUB_VERT = /* glsl */ `
  attribute float aHover;
  attribute float aPhase;
  uniform float uTime;
  uniform float uScale;
  uniform float uGlobeScale;
  varying float vAlpha;
  varying float vHover;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normalize(position));
    float facing = smoothstep(0.05, 0.4, n.z);
    float breathe = 0.85 + 0.15 * sin(uTime * 2.0 + aPhase);
    vHover = aHover;
    vAlpha = facing * breathe;
    float size = 0.030 * (1.0 + aHover * 0.9 + 0.10 * sin(uTime * 2.0 + aPhase));
    gl_PointSize = size * uGlobeScale * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const HUB_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform vec3 uHoverColor;
  varying float vAlpha;
  varying float vHover;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.22, 0.05, d);
    float halo = smoothstep(0.5, 0.1, d) * 0.5;
    float a = (core + halo) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(uColor, uHoverColor, vHover), a);
  }
`;

const PLANE_VERT = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uScale;
  uniform float uGlobeScale;
  uniform float uBoost;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normalize(position));
    float facing = smoothstep(0.02, 0.35, n.z);
    float pulse = 0.78 + 0.22 * sin(uTime * 2.4 + aPhase);
    vAlpha = facing * pulse * (0.75 + 0.25 * uBoost);
    float size = 0.017 * (1.0 + 0.45 * uBoost);
    gl_PointSize = size * uGlobeScale * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const PLANE_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.18, 0.04, d);
    float halo = smoothstep(0.5, 0.08, d) * 0.45;
    float a = (core + halo) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.6), a);
  }
`;

// Streak behind each aircraft along its ground track: bright at the head
// (aT = 1), fading to nothing at the tail (aT = 0).
const TRAIL_VERT = /* glsl */ `
  attribute float aT;
  varying float vT;
  varying float vFace;
  void main() {
    vec3 n = normalize(normalMatrix * normalize(position));
    vFace = smoothstep(0.02, 0.3, n.z);
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uBoost;
  varying float vT;
  varying float vFace;
  void main() {
    float a = vT * vT * vFace * (0.30 + 0.35 * uBoost);
    if (a < 0.015) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vAlpha = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 0.6 + aPhase));
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(0.85, 0.92, 1.0, a);
  }
`;

/* ────────────────────────── Component ────────────────────────── */

export function GlobeHero() {
  const { t } = useLang();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowWarmRef = useRef<HTMLDivElement>(null);
  const glowHazeRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas || !canvasWrapRef.current) return;
    // Assert non-null so the type is preserved inside the async init() closure
    // below (same reason `section!` is used throughout).
    const wrap = canvasWrapRef.current!;
    // wrap is the sticky viewport-sized canvas holder; its parent is the
    // absolute .dgh-globe-layer, whose parent is .dgh-stage — the wrapper that
    // holds the hero, the Cambodia showcase and the narrative chapters.
    // Pointer maths use the wrap box; scroll maths use the stage box.
    const stage = wrap.parentElement?.parentElement ?? section;

    let disposed = false;
    let disposeScene: (() => void) | null = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const isMobile = coarse || window.innerWidth < 768;

    // Lazy-init: only pull three.js/GSAP once the hero is near the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          init().catch((err) => {
            // WebGL/import failure — reveal the copy and keep the CSS-only look.
            console.warn('GlobeHero: falling back to static hero:', err);
            section.classList.remove('dgh-anim');
          });
        }
      },
      { rootMargin: '240px' },
    );
    io.observe(section);

    async function init() {
      const THREE = await import('three');
      if (disposed) return;

      /* ── Renderer / camera / scene ── */
      const renderer = new THREE.WebGLRenderer({
        canvas: canvas as HTMLCanvasElement,
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
      camera.position.set(0, 0, 2.9);

      // tiltGroup carries the axial tilt + parallax drift; spinGroup rotates.
      const tiltGroup = new THREE.Group();
      const spinGroup = new THREE.Group();
      tiltGroup.add(spinGroup);
      tiltGroup.rotation.z = THREE.MathUtils.degToRad(-17);
      // Free-running spin angle. The rendered rotation blends this with each
      // chapter's focus angle (see applySpine), so narrative focus can take
      // over and hand back without a snap.
      // Start with East Asia's hubs (Tokyo/Seoul) rising over the horizon.
      let freeSpin = 1.96;
      spinGroup.rotation.y = freeSpin;
      scene.add(tiltGroup);

      const disposables: { dispose(): void }[] = [];
      const track = <T extends { dispose(): void }>(x: T): T => {
        disposables.push(x);
        return x;
      };

      /* ── Continent particle field (~20k dots on land, fibonacci sphere) ── */
      const targetDots = isMobile ? 8000 : 20000;
      // Land covers ~1/3 of the mask, so oversample candidates accordingly.
      const candidates = Math.floor(targetDots * 3.3);
      const positions: number[] = [];
      const sizes: number[] = [];
      const phases: number[] = [];
      const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle
      for (let i = 0; i < candidates && positions.length / 3 < targetDots; i++) {
        const y = 1 - (2 * (i + 0.5)) / candidates;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const th = GA * i;
        const x = Math.cos(th) * r;
        const z = Math.sin(th) * r;
        const lat = (Math.asin(y) * 180) / Math.PI;
        const lon = (Math.atan2(-z, x) * 180) / Math.PI;
        if (!isLand(lat, lon)) continue;
        positions.push(x, y, z);
        sizes.push(0.0032 + Math.random() * 0.0036);
        phases.push(Math.random() * Math.PI * 2);
      }

      const dotsGeo = track(new THREE.BufferGeometry());
      dotsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      dotsGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
      dotsGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
      const dotsMat = track(
        new THREE.ShaderMaterial({
          vertexShader: DOTS_VERT,
          fragmentShader: DOTS_FRAG,
          uniforms: {
            uTime: { value: 0 },
            uScale: { value: 1 },
            uGlobeScale: { value: 1 },
            uColor: { value: new THREE.Color('#f2d9a4') }, // warm white-gold
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      spinGroup.add(new THREE.Points(dotsGeo, dotsMat));

      /* ── Dark occluder sphere (hides far-side dots, gives the disc) ── */
      const occGeo = track(new THREE.SphereGeometry(0.992, 48, 48));
      const occMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#060f2c') }));
      tiltGroup.add(new THREE.Mesh(occGeo, occMat));

      /* ── Cyan fresnel atmosphere rim ── */
      const atmoGeo = track(new THREE.SphereGeometry(1.05, 48, 48));
      const atmoMat = track(
        new THREE.ShaderMaterial({
          vertexShader: ATMO_VERT,
          fragmentShader: ATMO_FRAG,
          uniforms: {
            uColor: { value: new THREE.Color('#57c8ff') },
            uIntensity: { value: 0.9 },
          },
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      tiltGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

      /* ── Hub nodes ── */
      const hubPos: number[] = [];
      for (const h of HUBS) hubPos.push(...latLonToXYZ(h.lat, h.lon).map((v) => v * 1.005));
      const hubHover = new Float32Array(HUBS.length); // lerped toward hover target
      const hubGeo = track(new THREE.BufferGeometry());
      hubGeo.setAttribute('position', new THREE.Float32BufferAttribute(hubPos, 3));
      hubGeo.setAttribute('aHover', new THREE.BufferAttribute(hubHover, 1));
      hubGeo.setAttribute(
        'aPhase',
        new THREE.Float32BufferAttribute(HUBS.map(() => Math.random() * Math.PI * 2), 1),
      );
      const hubMat = track(
        new THREE.ShaderMaterial({
          vertexShader: HUB_VERT,
          fragmentShader: HUB_FRAG,
          uniforms: {
            uTime: { value: 0 },
            uScale: { value: 1 },
            uGlobeScale: { value: 1 },
            uColor: { value: new THREE.Color('#ffe9bd') },
            uHoverColor: { value: new THREE.Color('#9fe4ff') },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      spinGroup.add(new THREE.Points(hubGeo, hubMat));

      /* ── Bezier arc connections with travelling pulses ── */
      type ArcState = { mat: ThreeNS.ShaderMaterial; t: number; dur: number };
      const arcs: ArcState[] = [];
      for (const [ai, bi] of ARC_ROUTES) {
        const a = new THREE.Vector3(...latLonToXYZ(HUBS[ai].lat, HUBS[ai].lon));
        const b = new THREE.Vector3(...latLonToXYZ(HUBS[bi].lat, HUBS[bi].lon));
        const angle = a.angleTo(b);
        const lift = 1 + 0.14 + 0.42 * (angle / Math.PI);
        const c1 = a.clone().lerp(b, 0.3).normalize().multiplyScalar(lift);
        const c2 = a.clone().lerp(b, 0.7).normalize().multiplyScalar(lift);
        const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);
        const geo = track(new THREE.TubeGeometry(curve, 48, 0.0035, 5, false));
        const mat = track(
          new THREE.ShaderMaterial({
            vertexShader: ARC_VERT,
            fragmentShader: ARC_FRAG,
            uniforms: {
              uPulse: { value: 0 },
              uAlpha: { value: 0 },
              uColor: { value: new THREE.Color('#e6cb8b') },
              uPulseColor: { value: new THREE.Color('#bfefff') },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        spinGroup.add(new THREE.Mesh(geo, mat));
        // Negative t = waiting to start; cycles re-randomise on completion.
        arcs.push({ mat, t: -Math.random() * 7, dur: 5.5 + Math.random() * 4.5 });
      }

      const updateArcs = (dt: number) => {
        // spine.arc > 1 in the flight-tracking chapter: brighter arcs that
        // relaunch sooner, so the sky visibly fills with routes.
        const boost = Math.max(0.4, spine.arc);
        for (const arc of arcs) {
          arc.t += dt;
          const p = arc.t / arc.dur;
          if (p >= 1) {
            arc.t = -(1.5 + Math.random() * 6) / boost;
            arc.dur = 5.5 + Math.random() * 4.5;
            arc.mat.uniforms.uAlpha.value = 0;
            continue;
          }
          if (p < 0) {
            arc.mat.uniforms.uAlpha.value = 0;
            continue;
          }
          // Fade in, hold, fade out; pulse sweeps the arc once per cycle.
          const env =
            Math.min(1, p / 0.14) * (1 - Math.max(0, (p - 0.78) / 0.22));
          arc.mat.uniforms.uAlpha.value = env * (0.6 + 0.4 * boost);
          arc.mat.uniforms.uPulse.value = p;
        }
      };

      /* ── Rising light beams from major hubs ── */
      const beamMats: ThreeNS.ShaderMaterial[] = [];
      const beamGeo = track(new THREE.CylinderGeometry(0.006, 0.017, 0.34, 6, 1, true));
      beamGeo.translate(0, 0.17, 0); // base sits on the surface
      const up = new THREE.Vector3(0, 1, 0);
      for (const h of HUBS.filter((x) => x.beam)) {
        const mat = track(
          new THREE.ShaderMaterial({
            vertexShader: BEAM_VERT,
            fragmentShader: BEAM_FRAG,
            uniforms: {
              uTime: { value: 0 },
              uPhase: { value: Math.random() * Math.PI * 2 },
              uColor: { value: new THREE.Color('#ffe2a8') },
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          }),
        );
        const n = new THREE.Vector3(...latLonToXYZ(h.lat, h.lon));
        const mesh = new THREE.Mesh(beamGeo, mat);
        mesh.position.copy(n);
        mesh.quaternion.setFromUnitVectors(up, n.clone().normalize());
        spinGroup.add(mesh);
        beamMats.push(mat);
      }

      /* ── Live aircraft layer (keyless ADS-B via /api/flights/sky) ──
         Real positions around the beamed hub cities, drawn as glowing cyan
         markers with a short streak along each aircraft's ground track.
         Between refreshes the markers dead-reckon forward at their true
         ground speed — honest, if nearly imperceptible at planetary scale;
         the streaks and pulse carry the motion. Fails soft: if the endpoint
         is unreachable the layer simply stays empty. */
      const MAX_PLANES = 160;
      const SKY_ALT = 1.008; // markers ride just above the surface
      const TRAIL_LEN = 0.05; // streak length, radians of arc
      const skyPos = new Float32Array(MAX_PLANES * 3); // unit-sphere positions
      const skyDir = new Float32Array(MAX_PLANES * 3); // tangent flight direction
      const skyOmega = new Float32Array(MAX_PLANES); // angular speed, rad/s
      const skyMeta: { callsign: string; altFt: number | null }[] = [];
      let skyCount = 0;

      const planeHead = new Float32Array(MAX_PLANES * 3);
      const planePhase = new Float32Array(MAX_PLANES);
      for (let i = 0; i < MAX_PLANES; i++) planePhase[i] = Math.random() * Math.PI * 2;
      const planeGeo = track(new THREE.BufferGeometry());
      planeGeo.setAttribute('position', new THREE.BufferAttribute(planeHead, 3));
      planeGeo.setAttribute('aPhase', new THREE.BufferAttribute(planePhase, 1));
      planeGeo.setDrawRange(0, 0);
      const planeMat = track(
        new THREE.ShaderMaterial({
          vertexShader: PLANE_VERT,
          fragmentShader: PLANE_FRAG,
          uniforms: {
            uTime: { value: 0 },
            uScale: { value: 1 },
            uGlobeScale: { value: 1 },
            uBoost: { value: 0 },
            uColor: { value: new THREE.Color('#bfe9ff') },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      spinGroup.add(new THREE.Points(planeGeo, planeMat));

      const trailPos = new Float32Array(MAX_PLANES * 6); // head + tail vertex
      const trailT = new Float32Array(MAX_PLANES * 2);
      for (let i = 0; i < MAX_PLANES; i++) trailT[i * 2] = 1; // heads bright
      const trailGeo = track(new THREE.BufferGeometry());
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
      trailGeo.setAttribute('aT', new THREE.BufferAttribute(trailT, 1));
      trailGeo.setDrawRange(0, 0);
      const trailMat = track(
        new THREE.ShaderMaterial({
          vertexShader: TRAIL_VERT,
          fragmentShader: TRAIL_FRAG,
          uniforms: {
            uBoost: { value: 0 },
            uColor: { value: new THREE.Color('#8fd8ff') },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      spinGroup.add(new THREE.LineSegments(trailGeo, trailMat));

      const updateSky = (dt: number) => {
        if (!skyCount) return;
        for (let i = 0; i < skyCount; i++) {
          const j = i * 3;
          const w = skyOmega[i] * dt;
          let x = skyPos[j] + skyDir[j] * w;
          let y = skyPos[j + 1] + skyDir[j + 1] * w;
          let z = skyPos[j + 2] + skyDir[j + 2] * w;
          const inv = 1 / Math.hypot(x, y, z);
          x *= inv;
          y *= inv;
          z *= inv;
          skyPos[j] = x;
          skyPos[j + 1] = y;
          skyPos[j + 2] = z;
          planeHead[j] = x * SKY_ALT;
          planeHead[j + 1] = y * SKY_ALT;
          planeHead[j + 2] = z * SKY_ALT;
          // Tail: step backwards along the track, back onto the shell.
          let tx = x - skyDir[j] * TRAIL_LEN;
          let ty = y - skyDir[j + 1] * TRAIL_LEN;
          let tz = z - skyDir[j + 2] * TRAIL_LEN;
          const tInv = SKY_ALT / Math.hypot(tx, ty, tz);
          const k = i * 6;
          trailPos[k] = planeHead[j];
          trailPos[k + 1] = planeHead[j + 1];
          trailPos[k + 2] = planeHead[j + 2];
          trailPos[k + 3] = tx * tInv;
          trailPos[k + 4] = ty * tInv;
          trailPos[k + 5] = tz * tInv;
        }
        planeGeo.getAttribute('position').needsUpdate = true;
        trailGeo.getAttribute('position').needsUpdate = true;
      };

      type SkyPlaneWire = {
        callsign?: string;
        lat?: number;
        lon?: number;
        heading?: number | null;
        speedKt?: number | null;
        altFt?: number | null;
      };
      const loadSky = async () => {
        try {
          const res = await fetch('/api/flights/sky');
          if (!res.ok || disposed) return;
          const data = (await res.json()) as { planes?: SkyPlaneWire[]; count?: number };
          const list = (data.planes ?? []).slice(0, MAX_PLANES);
          skyMeta.length = 0;
          let n = 0;
          for (const p of list) {
            if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue;
            const j = n * 3;
            const [x, y, z] = latLonToXYZ(p.lat, p.lon);
            skyPos[j] = x;
            skyPos[j + 1] = y;
            skyPos[j + 2] = z;
            // Tangent basis at the fix (axes match latLonToXYZ) → ground-track
            // direction from the broadcast heading.
            const la = (p.lat * Math.PI) / 180;
            const lo = (p.lon * Math.PI) / 180;
            const hasTrack = typeof p.heading === 'number';
            const h = (((p.heading ?? 0) as number) * Math.PI) / 180;
            const cosH = Math.cos(h);
            const sinH = Math.sin(h);
            skyDir[j] = hasTrack ? cosH * (-Math.sin(la) * Math.cos(lo)) + sinH * -Math.sin(lo) : 0;
            skyDir[j + 1] = hasTrack ? cosH * Math.cos(la) : 0;
            skyDir[j + 2] = hasTrack ? cosH * (Math.sin(la) * Math.sin(lo)) + sinH * -Math.cos(lo) : 0;
            skyOmega[n] = ((p.speedKt ?? 0) * 1.852) / 3600 / 6371; // rad/s over Earth radius
            skyMeta.push({ callsign: p.callsign ?? '', altFt: p.altFt ?? null });
            n++;
          }
          skyCount = n;
          planeGeo.setDrawRange(0, n);
          trailGeo.setDrawRange(0, n * 2);
          updateSky(0);
          // Tell the narrative chapters how busy the sky is (live badge).
          window.dispatchEvent(new CustomEvent('dgh-sky', { detail: { count: data.count ?? n } }));
          if (reducedMotion) renderStatic();
        } catch {
          /* offline or blocked — the sky layer simply stays empty */
        }
      };

      /* ── Starfield (twinkling, slow parallax layer) ── */
      const starCount = isMobile ? 450 : 900;
      const starPos = new Float32Array(starCount * 3);
      const starSize = new Float32Array(starCount);
      const starPhase = new Float32Array(starCount);
      for (let i = 0; i < starCount; i++) {
        // Random directions on a far shell, biased to the visible hemisphere.
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const r = 40 + Math.random() * 40;
        starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        starPos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
        starPos[i * 3 + 2] = -Math.abs(r * Math.sin(ph) * Math.sin(th)) - 8;
        starSize[i] = 0.7 + Math.random() * 1.9;
        starPhase[i] = Math.random() * Math.PI * 2;
      }
      const starGeo = track(new THREE.BufferGeometry());
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
      starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
      const starMat = track(
        new THREE.ShaderMaterial({
          vertexShader: STAR_VERT,
          fragmentShader: STAR_FRAG,
          uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const starGroup = new THREE.Group();
      starGroup.add(new THREE.Points(starGeo, starMat));
      scene.add(starGroup);

      /* ── Layout + scroll spine ──
         The canvas fills the sticky viewport-sized wrapper. Where the planet
         sits inside it is decided per frame by sampling the scroll offset
         against a keyframe track:
           - Keys 0..1 glue the sphere's centre to the hero/showcase seam
             (linear segments, so the planet is document-locked — pixel-exact
             tracking while those sections scroll past).
           - One key per [data-dgc] chapter element then glides the planet to
             that chapter's declared position / scale / focus lat-lon.
         FULL_FACTOR sets the sphere diameter as a fraction of viewport width. */
      const FULL_FACTOR = 0.44;
      const DEG = Math.PI / 180;
      let globeScale = 1;
      let halfHWorld = 1;
      let halfWWorld = 1;
      let radiusPx = 0;
      let vwPx = 1;
      let vhPx = 1;

      type SpineKey = {
        st: number; // stage scroll offset (px past stage top) this key sits at
        x: number; // globe centre, fraction of wrap width
        y: number; // globe centre, fraction of wrap height
        scale: number; // multiplier on the base globe scale
        arc: number; // arc-activity boost (1 = normal)
        focusW: number; // 0 = free spin, 1 = locked to focusR
        focusR: number; // spin angle that puts the chapter's lon front-centre
        tiltX: number; // extra x-tilt to raise the chapter's lat
        linear?: boolean; // linear (not eased) interp to the NEXT key
      };
      let keys: SpineKey[] = [];

      const buildKeys = () => {
        const h = wrap.clientHeight || 1;
        const stageRect = stage.getBoundingClientRect();
        const seamY = section!.getBoundingClientRect().bottom - stageRect.top;
        // Seam-locked centre-y (fraction of wrap height) at stage offset st.
        const yAt = (st: number) => (seamY - st) / h;
        const base = { x: 0.5, scale: 1, arc: 1, focusW: 0, focusR: 0, tiltX: 0 };
        // Reduced motion: seam-lock only — the planet scrolls with the page
        // like a printed element and never glides on its own.
        const els = reducedMotion
          ? []
          : Array.from(stage.querySelectorAll<HTMLElement>('[data-dgc]'));
        keys = [{ st: 0, y: yAt(0), ...base, linear: true }];
        if (els.length === 0) {
          keys.push({ st: stageRect.height, y: yAt(stageRect.height), ...base, linear: true });
          return;
        }
        // Hold the seam lock until the first chapter is about to enter.
        const firstTop = els[0].getBoundingClientRect().top - stageRect.top;
        const stHold = Math.max(1, firstTop - h);
        keys.push({ st: stHold, y: yAt(stHold), ...base });
        // Compact viewports: the width-scaled globe is tiny, so per-chapter
        // sizes would vanish behind the copy card. Centre it and blow it up
        // instead — the card's glass backdrop floats on the planet.
        const compact = (wrap.clientWidth || 0) < 768;
        for (const el of els) {
          const r = el.getBoundingClientRect();
          const d = el.dataset;
          const lat = parseFloat(d.lat ?? '0');
          const lon = parseFloat(d.lon ?? '105');
          keys.push({
            st: r.top - stageRect.top + r.height / 2 - h / 2,
            x: compact ? 0.5 : parseFloat(d.x ?? '0.5'),
            y: parseFloat(d.y ?? '0.5'),
            scale: compact ? 1.85 : parseFloat(d.scale ?? '0.6'),
            arc: parseFloat(d.arc ?? '1'),
            focusW: 1,
            // rotation.y that brings `lon` to face the camera (see latLonToXYZ).
            focusR: -Math.PI / 2 - lon * DEG,
            tiltX: Math.max(-0.45, Math.min(0.45, lat * DEG * 0.7)),
          });
        }
        // Seed the seam-lock keys with the first chapter's angle so the blend
        // has a fixed target while focusW rises (no mid-glide retargeting).
        keys[0].focusR = keys[1].focusR = keys[2].focusR;
      };

      const layout = () => {
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        vwPx = w;
        vhPx = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const dist = camera.position.z;
        halfHWorld = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
        halfWWorld = halfHWorld * camera.aspect;
        // Radius as a fraction of the viewport half-width, capped so a short
        // wrap never lets the sphere overflow its vertical room.
        globeScale = Math.min(halfHWorld * 0.92, halfWWorld * FULL_FACTOR);
        radiusPx = (globeScale / halfHWorld) * (h / 2);
        const pxScale =
          (h * renderer.getPixelRatio()) /
          (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        dotsMat.uniforms.uScale.value = pxScale;
        hubMat.uniforms.uScale.value = pxScale;
        planeMat.uniforms.uScale.value = pxScale;
        buildKeys();
        if (reducedMotion) renderStatic();
      };

      const shortAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

      // Current interpolated spine state (also read by updateArcs / spin).
      const spine = { x: 0.5, y: 1, scale: 1, arc: 1, focusW: 0, focusR: 0, tiltX: 0 };

      const sampleSpine = (st: number) => {
        let a = keys[0];
        let b = keys[0];
        for (let i = 0; i < keys.length; i++) {
          if (keys[i].st <= st) {
            a = keys[i];
            b = keys[Math.min(i + 1, keys.length - 1)];
          }
        }
        const span = b.st - a.st;
        let u = span > 0 ? Math.min(1, Math.max(0, (st - a.st) / span)) : 1;
        if (!a.linear) u = u * u * (3 - 2 * u); // smoothstep the glides
        spine.x = a.x + (b.x - a.x) * u;
        spine.y = a.y + (b.y - a.y) * u;
        spine.scale = a.scale + (b.scale - a.scale) * u;
        spine.arc = a.arc + (b.arc - a.arc) * u;
        spine.focusW = a.focusW + (b.focusW - a.focusW) * u;
        spine.focusR = a.focusR + shortAngle(b.focusR - a.focusR) * u;
        spine.tiltX = a.tiltX + (b.tiltX - a.tiltX) * u;
      };

      const glowWarm = glowWarmRef.current;
      const glowHaze = glowHazeRef.current;

      // Sample the scroll position and pose the planet (and its CSS glow).
      const applySpine = () => {
        sampleSpine(-stage.getBoundingClientRect().top);
        const s = spine;
        const sc = globeScale * s.scale;
        tiltGroup.scale.setScalar(sc);
        tiltGroup.position.x =
          (s.x - 0.5) * 2 * halfWWorld + parallax.x * 0.08 * globeScale * 0.25;
        tiltGroup.position.y = halfHWorld * (1 - 2 * s.y);
        tiltGroup.rotation.x = parallax.y * 0.05 + s.tiltX;
        dotsMat.uniforms.uGlobeScale.value = sc;
        hubMat.uniforms.uGlobeScale.value = sc;
        planeMat.uniforms.uGlobeScale.value = sc;
        spinGroup.rotation.y = freeSpin + shortAngle(s.focusR - freeSpin) * s.focusW;
        if (glowWarm && glowHaze) {
          const cx = s.x * vwPx;
          const cy = s.y * vhPx;
          glowWarm.style.transform = `translate(${cx}px, ${cy - radiusPx * s.scale * 0.55}px) translate(-50%, -50%) scale(${s.scale})`;
          glowHaze.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(${Math.max(0.7, s.scale)})`;
        }
      };

      // Reduced motion renders discrete frames: once now, and again whenever
      // scroll moves the seam-locked planet (no animation of its own).
      let rmQueued = false;
      const renderStatic = () => {
        if (rmQueued || disposed) return;
        rmQueued = true;
        requestAnimationFrame(() => {
          rmQueued = false;
          applySpine();
          renderer.render(scene, camera);
        });
      };

      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(stage);
      ro.observe(wrap);

      /* ── Interaction state ── */
      const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
      let spinVel = 0; // extra user-imparted spin (rad/s)
      let dragging = false;
      let lastDragX = 0;
      let hoveredHub = -1;
      const mousePx = { x: -1e4, y: -1e4 };
      const BASE_SPIN = (Math.PI * 2) / 90; // one revolution / 90s

      const onMouseMove = (e: MouseEvent) => {
        const rect = wrap.getBoundingClientRect();
        parallax.tx = (e.clientX - rect.left) / rect.width - 0.5;
        parallax.ty = (e.clientY - rect.top) / rect.height - 0.5;
        mousePx.x = e.clientX - rect.left;
        mousePx.y = e.clientY - rect.top;
        // Clouds parallax through a CSS var (transition smooths it).
        section!.style.setProperty('--dgh-px', String(parallax.tx));
        section!.style.setProperty('--dgh-py', String(parallax.ty));
        if (dragging) {
          const dx = e.clientX - lastDragX;
          lastDragX = e.clientX;
          freeSpin += dx * 0.0045;
          spinVel = dx * 0.0045 * 60; // convert px/frame to rad/s feel
        }
      };
      const onMouseLeave = () => {
        parallax.tx = 0;
        parallax.ty = 0;
        mousePx.x = -1e4;
        section!.style.setProperty('--dgh-px', '0');
        section!.style.setProperty('--dgh-py', '0');
      };
      const onPointerDown = (e: PointerEvent) => {
        if (isMobile || e.pointerType === 'touch') return; // no drag on mobile
        // While a chapter has rotational focus, drag would be invisible.
        if (spine.focusW > 0.5) return;
        const target = e.target as HTMLElement;
        // Don't hijack links/buttons or the Cambodia carousel's own drag/controls.
        if (target.closest('a, button, input, [role="tablist"], .cam-stage, .dgc-card')) return;
        dragging = true;
        lastDragX = e.clientX;
        stage.classList.add('dgh-dragging');
      };
      const onPointerUp = () => {
        dragging = false;
        stage.classList.remove('dgh-dragging');
      };

      if (!reducedMotion) {
        stage.addEventListener('mousemove', onMouseMove, { passive: true });
        stage.addEventListener('mouseleave', onMouseLeave);
        stage.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointerup', onPointerUp);
      }

      // Gyroscope parallax on devices that expose it without a permission
      // prompt (Android). iOS requires a user gesture, so we skip it there.
      const onOrientation = (e: DeviceOrientationEvent) => {
        if (e.gamma == null || e.beta == null) return;
        parallax.tx = Math.max(-0.5, Math.min(0.5, e.gamma / 60));
        parallax.ty = Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 90));
      };
      const hasGyro = typeof window.DeviceOrientationEvent !== 'undefined';
      const hasGyroPermissionGate =
        hasGyro &&
        typeof (window.DeviceOrientationEvent as unknown as { requestPermission?: unknown })
          .requestPermission === 'function';
      if (!reducedMotion && isMobile && hasGyro && !hasGyroPermissionGate) {
        window.addEventListener('deviceorientation', onOrientation, { passive: true });
      }

      /* ── Hub hover: nearest projected node -> pulse + label ── */
      const label = labelRef.current;
      const worldV = new THREE.Vector3();
      const camDir = new THREE.Vector3();
      const toCamV = new THREE.Vector3();
      const updateHover = () => {
        if (isMobile || !label) return;
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        let best = -1;
        let bestD = 44; // px hit radius
        let bestX = 0;
        let bestY = 0;
        camera.getWorldDirection(camDir);
        for (let i = 0; i < HUBS.length; i++) {
          worldV.set(hubPos[i * 3], hubPos[i * 3 + 1], hubPos[i * 3 + 2]);
          spinGroup.localToWorld(worldV);
          // Skip hubs on the far side of the globe.
          const toCam = worldV.clone().sub(tiltGroup.position).normalize();
          if (toCam.dot(camDir) > -0.02) continue;
          worldV.project(camera);
          const sx = (worldV.x * 0.5 + 0.5) * w;
          const sy = (-worldV.y * 0.5 + 0.5) * h;
          const d = Math.hypot(sx - mousePx.x, sy - mousePx.y);
          if (d < bestD) {
            bestD = d;
            best = i;
            bestX = sx;
            bestY = sy;
          }
        }
        hoveredHub = best;
        if (best >= 0) {
          label.textContent = HUBS[best].name;
          label.style.transform = `translate(${bestX}px, ${bestY}px) translate(-50%, -170%)`;
          label.classList.add('dgh-hublabel-on');
        } else {
          // No hub under the cursor — try the live aircraft markers.
          let pBest = -1;
          let pD = 32;
          let pX = 0;
          let pY = 0;
          for (let i = 0; i < skyCount; i++) {
            worldV.set(planeHead[i * 3], planeHead[i * 3 + 1], planeHead[i * 3 + 2]);
            spinGroup.localToWorld(worldV);
            toCamV.copy(worldV).sub(tiltGroup.position).normalize();
            if (toCamV.dot(camDir) > -0.02) continue;
            worldV.project(camera);
            const sx = (worldV.x * 0.5 + 0.5) * w;
            const sy = (-worldV.y * 0.5 + 0.5) * h;
            const d = Math.hypot(sx - mousePx.x, sy - mousePx.y);
            if (d < pD) {
              pD = d;
              pBest = i;
              pX = sx;
              pY = sy;
            }
          }
          if (pBest >= 0) {
            const m = skyMeta[pBest];
            label.textContent =
              m.altFt != null
                ? `${m.callsign} · ${Math.round(m.altFt).toLocaleString()} ft`
                : m.callsign;
            label.style.transform = `translate(${pX}px, ${pY}px) translate(-50%, -170%)`;
            label.classList.add('dgh-hublabel-on');
          } else {
            label.classList.remove('dgh-hublabel-on');
          }
        }
        // Lerp hover pulse per hub.
        let dirty = false;
        for (let i = 0; i < HUBS.length; i++) {
          const target = i === hoveredHub ? 1 : 0;
          const next = hubHover[i] + (target - hubHover[i]) * 0.12;
          if (Math.abs(next - hubHover[i]) > 0.001) {
            hubHover[i] = next;
            dirty = true;
          }
        }
        if (dirty) hubGeo.getAttribute('aHover').needsUpdate = true;
      };

      /* ── Render loop ── */
      let prevMs = performance.now();
      let time = 0;
      let raf = 0;
      let running = true;
      let inView = true;
      let pageVisible = !document.hidden;

      const frame = () => {
        raf = requestAnimationFrame(frame);
        const nowMs = performance.now();
        const dt = Math.min((nowMs - prevMs) / 1000, 0.05);
        prevMs = nowMs;
        time += dt;

        // Perpetual spin + user inertia decaying back to the base speed.
        // Base spin winds down as a chapter takes rotational focus, so the
        // free angle doesn't drift far from what's on screen while locked.
        if (!dragging) {
          freeSpin += (BASE_SPIN * (1 - spine.focusW) + spinVel) * dt;
          spinVel *= Math.pow(0.12, dt); // smooth exponential decay
        }

        // 3-layer parallax: globe (1x), stars (counter, 0.35x).
        parallax.x += (parallax.tx - parallax.x) * Math.min(1, dt * 4);
        parallax.y += (parallax.ty - parallax.y) * Math.min(1, dt * 4);
        starGroup.rotation.y = -parallax.x * 0.045;
        starGroup.rotation.x = -parallax.y * 0.03;

        // Pose the planet from the scroll spine (position, scale, focus).
        applySpine();

        dotsMat.uniforms.uTime.value = time;
        hubMat.uniforms.uTime.value = time;
        starMat.uniforms.uTime.value = time;
        for (const m of beamMats) m.uniforms.uTime.value = time;
        updateArcs(dt);
        // Live aircraft: pulse with time, glow harder in the flight chapter.
        const skyBoost = Math.min(1, Math.max(0, spine.arc - 1));
        planeMat.uniforms.uTime.value = time;
        planeMat.uniforms.uBoost.value = skyBoost;
        trailMat.uniforms.uBoost.value = skyBoost;
        updateSky(dt);
        updateHover();

        renderer.render(scene, camera);
      };

      const setRunning = () => {
        const next = inView && pageVisible && !reducedMotion;
        if (next === running) return;
        running = next;
        if (running) {
          prevMs = performance.now(); // swallow the pause gap
          raf = requestAnimationFrame(frame);
        } else {
          cancelAnimationFrame(raf);
        }
      };
      const viewIO = new IntersectionObserver(
        (entries) => {
          inView = entries.some((e) => e.isIntersecting);
          setRunning();
        },
        { threshold: 0 },
      );
      viewIO.observe(stage);
      const onVisibility = () => {
        pageVisible = !document.hidden;
        setRunning();
      };
      document.addEventListener('visibilitychange', onVisibility);

      let killGsap: (() => void) | null = null;

      if (reducedMotion) {
        // Static frames: light a few arcs mid-flight, then only re-render when
        // scroll moves the seam-locked planet — no motion of its own.
        running = false;
        arcs.forEach((arc, i) => {
          if (i % 3 !== 0) return;
          arc.mat.uniforms.uAlpha.value = 0.8;
          arc.mat.uniforms.uPulse.value = 0.2 + (i / arcs.length) * 0.6;
        });
        renderStatic();
        window.addEventListener('scroll', renderStatic, { passive: true });
        section!.classList.remove('dgh-anim');
      } else {
        raf = requestAnimationFrame(frame);
        await initGsap();
      }

      canvasWrapRef.current?.classList.add('dgh-canvas-on');

      // Live sky: fetch once now, then refresh while the globe is on screen.
      // (The endpoint is server-cached, so every visitor shares one upstream
      // snapshot per interval.)
      loadSky();
      const skyTimer = reducedMotion
        ? null
        : window.setInterval(() => {
            if (inView && !document.hidden) loadSky();
          }, 45000);

      /* ── GSAP: entrance reveal + scroll scrub ── */
      async function initGsap() {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger'),
        ]);
        if (disposed) return;
        gsap.registerPlugin(ScrollTrigger);

        // First-load splash still up? Hold the entrance until its handoff
        // begins, so the copy rises exactly as the veil lifts (the planet is
        // already alive underneath). Safety timeout in case the splash never
        // announces.
        if ((window as unknown as { __domerSplashPending?: boolean }).__domerSplashPending) {
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              resolve();
            };
            const timer = window.setTimeout(done, 5000);
            window.addEventListener('domer-splash-handoff', done, { once: true });
          });
          if (disposed) return;
        }

        const reveals = section!.querySelectorAll('.dgh-reveal');
        const intro = gsap.to(reveals, {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.9,
          ease: 'expo.out',
          stagger: 0.12,
          delay: 0.15,
          onComplete: () => section!.classList.remove('dgh-anim'),
        });

        // Scroll: the hero copy lifts and fades as you move toward the
        // showcase. The globe itself is NOT dimmed — it scrolls with the page
        // as one continuous planet into the section below.
        const scrub = gsap.timeline({
          scrollTrigger: { trigger: section!, start: 'top top', end: 'bottom top', scrub: 0.6 },
        });
        scrub
          .to(copyRef.current, { y: -70, opacity: 0, ease: 'none' }, 0)
          .to(chipsRef.current, { y: -30, opacity: 0, ease: 'none' }, 0);

        killGsap = () => {
          intro.kill();
          scrub.scrollTrigger?.kill();
          scrub.kill();
        };
      }

      /* ── Teardown ── */
      disposeScene = () => {
        cancelAnimationFrame(raf);
        if (skyTimer !== null) clearInterval(skyTimer);
        ro.disconnect();
        viewIO.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        stage.removeEventListener('mousemove', onMouseMove);
        stage.removeEventListener('mouseleave', onMouseLeave);
        stage.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('deviceorientation', onOrientation);
        window.removeEventListener('scroll', renderStatic);
        killGsap?.();
        for (const d of disposables) d.dispose();
        renderer.dispose();
      };
    }

    return () => {
      disposed = true;
      io.disconnect();
      disposeScene?.();
    };
  }, []);

  /* Magnetic hover for the primary CTA (desktop only, tiny and cheap). */
  const onCtaMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${dx * 0.14}px, ${dy * 0.22}px)`;
  };
  const onCtaLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.transform = '';
  };

  return (
    <>
      {/* Shared globe canvas. The outer layer spans the whole .dgh-stage (see
          HomeContent) — hero, Cambodia showcase and narrative chapters — while
          the inner sticky wrapper keeps the canvas viewport-sized. Scroll
          keyframes glue the planet to the hero/showcase seam, then glide it
          between chapters. Lazy-initialised when scrolled near. */}
      <div className="dgh-globe-layer" aria-hidden="true">
        <div ref={canvasWrapRef} className="dgh-globe-sticky">
          <div className="dgh-glow">
            <div ref={glowHazeRef} className="dgh-glow-haze" />
            <div ref={glowWarmRef} className="dgh-glow-warm" />
          </div>
          <canvas ref={canvasRef} className="dgh-canvas" />
          <div ref={labelRef} className="dgh-hublabel" />
        </div>
      </div>

      <section ref={sectionRef} className="dgh-hero dgh-anim" aria-label={t('hero.badge')}>
      {/* Drifting volumetric mist layers */}
      <div className="dgh-clouds" aria-hidden="true">
        <div className="dgh-cloud dgh-cloud-a" />
        <div className="dgh-cloud dgh-cloud-b" />
        <div className="dgh-cloud dgh-cloud-c" />
      </div>

      {/* Film grain */}
      <div className="dgh-grain" aria-hidden="true" />

      {/* Copy layer */}
      <div ref={copyRef} className="dgh-copy">
        <span className="dgh-badge dgh-reveal">{t('hero.badge')}</span>
        <h1 className="dgh-title dgh-reveal">
          {t('hero.t1')}
          <span className="dgh-title-accent"> {t('hero.t2')}</span>
          <br />
          {t('hero.t3')}
        </h1>
        <p className="dgh-sub dgh-reveal">{t('hero.sub')}</p>
        <div className="dgh-ctas dgh-reveal">
          <Link
            href="/esim"
            className="dgh-cta"
            onMouseMove={onCtaMove}
            onMouseLeave={onCtaLeave}
          >
            {t('hero.ctaEsim')}
          </Link>
          <Link href="/flights" className="dgh-cta-ghost">
            {t('hero.ctaFlight')}
          </Link>
        </div>
      </div>

      {/* Frosted feature chips floating above the horizon */}
      <div ref={chipsRef} className="dgh-chips">
        <span className="dgh-chip dgh-reveal">{t('hero.stat1')}</span>
        <span className="dgh-chip dgh-reveal">{t('hero.stat2')}</span>
        <span className="dgh-chip dgh-reveal">{t('hero.stat3')}</span>
      </div>

      {/* All styles scoped under the dgh- prefix — no global leakage. Injected
          via innerHTML so SSR text escaping can't cause a hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: CSS_TEXT }} />
      </section>
    </>
  );
}

/* ────────────────────────── Scoped styles ────────────────────────── */

// Film-grain texture: tiny SVG turbulence tile, inlined so no request is made.
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")";

const CSS_TEXT = `
/* .dgh-stage wraps the hero, the Cambodia showcase AND the narrative chapters
   (see HomeContent). It owns the continuous deep-space gradient and hosts the
   shared globe layer, so one planet travels the whole spine as a single
   "page". The warm/blue radial glows live in the sticky globe wrapper so they
   follow the planet as it glides. */
.dgh-stage {
  position: relative;
  isolation: isolate;
  background: linear-gradient(
    180deg,
    #050b2e 0%,
    #08163a 14%,
    #0a1a4a 26%,
    #0b1c40 40%,
    #0a173c 62%,
    #0c1836 82%,
    #0e1b30 100%
  );
}
.dgh-stage.dgh-dragging { cursor: grabbing; }

/* Shared globe canvas layer — spans the full stage, sits behind section content. */
.dgh-globe-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* Sticky viewport-sized holder: the canvas rides along while the stage
   scrolls, and the scroll spine poses the planet inside it. */
.dgh-globe-sticky {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100vh;
  will-change: transform;
}

/* Planet glow layers — repositioned every frame to track the sphere. */
.dgh-glow {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 1.4s ease;
}
.dgh-canvas-on .dgh-glow { opacity: 1; }
.dgh-glow-warm,
.dgh-glow-haze {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
}
.dgh-glow-warm {
  width: 150vmin;
  height: 76vmin;
  background: radial-gradient(closest-side, rgba(230, 176, 90, 0.13) 0%, transparent 70%);
  transform: translate(50vw, 92vh) translate(-50%, -50%);
}
.dgh-glow-haze {
  width: 220vmin;
  height: 115vmin;
  background: radial-gradient(closest-side, rgba(30, 64, 122, 0.5) 0%, transparent 66%);
  transform: translate(50vw, 100vh) translate(-50%, -50%);
}

.dgh-hero {
  position: relative;
  z-index: 1;
  isolation: isolate;
  overflow: hidden;
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  color: #fff;
  background: transparent;
}

/* ── Scene layers ── */
/* Fade-in lives on the inner canvas so it eases in once WebGL is ready. */
.dgh-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  opacity: 0;
  transition: opacity 1.4s ease;
}
.dgh-canvas-on .dgh-canvas { opacity: 1; }
.dgh-hublabel {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: #eaf6ff;
  background: rgba(10, 26, 60, 0.55);
  border: 1px solid rgba(159, 228, 255, 0.35);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 0 18px rgba(87, 200, 255, 0.25);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
.dgh-hublabel-on { opacity: 1; }

.dgh-clouds {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  transform: translate3d(calc(var(--dgh-px, 0) * -26px), calc(var(--dgh-py, 0) * -14px), 0);
  transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}
.dgh-cloud {
  position: absolute;
  border-radius: 50%;
  filter: blur(46px);
  opacity: 0.5;
  will-change: transform;
}
.dgh-cloud-a {
  left: -12%; bottom: 8%;
  width: 60%; height: 34%;
  background: radial-gradient(closest-side, rgba(94, 128, 210, 0.16), transparent 72%);
  animation: dgh-drift-a 120s ease-in-out infinite alternate;
}
.dgh-cloud-b {
  right: -16%; bottom: 22%;
  width: 55%; height: 30%;
  background: radial-gradient(closest-side, rgba(120, 170, 255, 0.11), transparent 70%);
  animation: dgh-drift-b 150s ease-in-out infinite alternate;
}
.dgh-cloud-c {
  left: 22%; bottom: -6%;
  width: 56%; height: 30%;
  background: radial-gradient(closest-side, rgba(216, 178, 110, 0.10), transparent 70%);
  animation: dgh-drift-a 95s ease-in-out infinite alternate-reverse;
}
.dgh-grain {
  position: absolute;
  inset: -60px;
  z-index: 4;
  pointer-events: none;
  background-image: ${GRAIN_URI};
  opacity: 0.05;
  mix-blend-mode: overlay;
  animation: dgh-grain 0.9s steps(4) infinite;
}

/* ── Copy layer ── */
.dgh-copy {
  position: relative;
  z-index: 5;
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  padding: clamp(6.5rem, 14vh, 9rem) 1rem 0;
  text-align: center;
}
.dgh-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 0 24px rgba(87, 200, 255, 0.10);
}
.dgh-title {
  margin: 2rem 0 0;
  font-weight: 800;
  font-size: clamp(2.9rem, 7.5vw, 6rem);
  line-height: 1.08;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.dgh-title-accent {
  background: linear-gradient(92deg, #f5dfa8 0%, #e6cb8b 45%, #8fd8ff 115%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.dgh-sub {
  margin: 1.5rem auto 0;
  max-width: 40rem;
  font-size: clamp(1.05rem, 1.6vw, 1.25rem);
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.72);
}
.dgh-ctas {
  margin-top: 2.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
}
.dgh-cta, .dgh-cta-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3.25rem;
  padding: 0 2rem;
  border-radius: 999px;
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease;
  will-change: transform;
}
/* Primary CTA: luxury Apple-style blue frosted glass — a translucent deep-blue
   pane with backdrop blur, an inner sheen, and a glowing cyan gradient border. */
.dgh-cta {
  color: #eaf3ff;
  border: 1.5px solid transparent;
  background:
    linear-gradient(160deg, rgba(58, 116, 210, 0.55) 0%, rgba(26, 62, 130, 0.62) 55%, rgba(14, 34, 84, 0.7) 100%) padding-box,
    linear-gradient(120deg, rgba(143, 216, 255, 0.95), rgba(87, 200, 255, 0.6), rgba(120, 170, 255, 0.9)) border-box;
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset 0 -10px 22px rgba(10, 24, 60, 0.4),
    0 0 28px rgba(87, 200, 255, 0.32),
    0 8px 26px rgba(5, 11, 46, 0.5);
}
.dgh-cta:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -10px 22px rgba(10, 24, 60, 0.4),
    0 0 44px rgba(87, 200, 255, 0.5),
    0 10px 30px rgba(5, 11, 46, 0.55);
}
.dgh-cta-ghost {
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.dgh-cta-ghost:hover {
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 24px rgba(143, 216, 255, 0.22);
}

/* ── Frosted feature chips ── */
.dgh-chips {
  position: relative;
  z-index: 5;
  margin-top: auto;
  padding: 3rem 1rem calc(5rem + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}
.dgh-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.65rem 1.35rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 0 20px rgba(87, 200, 255, 0.07);
  animation: dgh-float 6s ease-in-out infinite alternate;
}
.dgh-chip:nth-child(2) { animation-delay: -2s; }
.dgh-chip:nth-child(3) { animation-delay: -4s; }

/* ── Entrance state (removed once GSAP finishes or on reduced motion) ── */
.dgh-anim .dgh-reveal {
  opacity: 0;
  transform: translateY(42px);
  filter: blur(12px);
}

/* ── Keyframes ── */
@keyframes dgh-float {
  from { transform: translateY(0); }
  to { transform: translateY(-9px); }
}
@keyframes dgh-drift-a {
  from { transform: translate3d(-4%, 1%, 0) scale(1); }
  to { transform: translate3d(6%, -3%, 0) scale(1.12); }
}
@keyframes dgh-drift-b {
  from { transform: translate3d(3%, -2%, 0) scale(1.08); }
  to { transform: translate3d(-6%, 2%, 0) scale(0.98); }
}
@keyframes dgh-grain {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-14px, 9px); }
  50% { transform: translate(11px, -13px); }
  75% { transform: translate(-9px, -7px); }
  100% { transform: translate(13px, 8px); }
}

/* ── Reduced motion: static frame, everything visible, no animation ── */
@media (prefers-reduced-motion: reduce) {
  .dgh-anim .dgh-reveal { opacity: 1; transform: none; filter: none; }
  .dgh-cloud, .dgh-grain, .dgh-chip { animation: none; }
  .dgh-clouds { transition: none; }
  .dgh-cta, .dgh-cta-ghost { transition: none; }
}

@media (max-width: 640px) {
  .dgh-copy { padding-top: 5.5rem; }
  .dgh-chips { gap: 0.5rem; }
  .dgh-chip { padding: 0.55rem 1rem; font-size: 0.78rem; }
}
`;
