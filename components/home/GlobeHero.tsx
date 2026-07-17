'use client';

/**
 * GlobeHero — cinematic 3D particle-globe hero section.
 *
 * A standalone, drop-in <section>. Every style is scoped under the `dgh-`
 * (Domner Globe Hero) prefix so nothing leaks into the rest of the site.
 *
 * Tech:
 *  - Three.js (lazy-loaded when the section enters the viewport) renders the
 *    globe as ~20k glowing dots mapped to real continent landmass data
 *    (Natural Earth 110m, embedded as a bit mask in ./globeLandMask).
 *  - GSAP + ScrollTrigger (also lazy-loaded) drive the entrance reveal and
 *    the scroll-linked scale/dim of the globe.
 *  - Custom shaders: dot flicker + limb fade, fresnel atmosphere rim,
 *    travelling arc pulses, rising hub beams, twinkling starfield.
 *
 * Interactivity: 3-layer mouse parallax (globe / stars / clouds), drag to
 * spin with inertia (desktop), hub hover -> pulse + city label, gyroscope
 * parallax on Android, scroll scrub. Honours prefers-reduced-motion by
 * rendering a single static frame with no animation.
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
  const labelRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;

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
      // Start with East Asia's hubs (Tokyo/Seoul) rising over the horizon.
      spinGroup.rotation.y = 1.96;
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
        for (const arc of arcs) {
          arc.t += dt;
          const p = arc.t / arc.dur;
          if (p >= 1) {
            arc.t = -(1.5 + Math.random() * 6);
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
          arc.mat.uniforms.uAlpha.value = env;
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

      /* ── Layout: globe rises from the bottom, horizon-style ── */
      let globeScale = 1;
      const layout = () => {
        const w = section!.clientWidth;
        const h = section!.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const dist = camera.position.z;
        const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
        const halfW = halfH * camera.aspect;
        // Wider than the viewport for a planet-horizon curve; crown of the
        // globe sits ~42% up the viewport so only the top is visible.
        globeScale = Math.max(1.05, halfW * 1.12);
        const crownY = halfH * (2 * 0.42 - 1);
        tiltGroup.scale.setScalar(globeScale);
        tiltGroup.position.y = crownY - globeScale;
        const pxScale = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        dotsMat.uniforms.uScale.value = pxScale;
        dotsMat.uniforms.uGlobeScale.value = globeScale;
        hubMat.uniforms.uScale.value = pxScale;
        hubMat.uniforms.uGlobeScale.value = globeScale;
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(section!);

      /* ── Interaction state ── */
      const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
      let spinVel = 0; // extra user-imparted spin (rad/s)
      let dragging = false;
      let lastDragX = 0;
      let hoveredHub = -1;
      const mousePx = { x: -1e4, y: -1e4 };
      const BASE_SPIN = (Math.PI * 2) / 90; // one revolution / 90s

      const onMouseMove = (e: MouseEvent) => {
        const rect = section!.getBoundingClientRect();
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
          spinGroup.rotation.y += dx * 0.0045;
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
        const target = e.target as HTMLElement;
        if (target.closest('a, button')) return;
        dragging = true;
        lastDragX = e.clientX;
        section!.classList.add('dgh-dragging');
      };
      const onPointerUp = () => {
        dragging = false;
        section!.classList.remove('dgh-dragging');
      };

      if (!reducedMotion) {
        section!.addEventListener('mousemove', onMouseMove, { passive: true });
        section!.addEventListener('mouseleave', onMouseLeave);
        section!.addEventListener('pointerdown', onPointerDown);
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
      const updateHover = () => {
        if (isMobile || !label) return;
        const w = section!.clientWidth;
        const h = section!.clientHeight;
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
          label.classList.remove('dgh-hublabel-on');
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
        if (!dragging) {
          spinGroup.rotation.y += (BASE_SPIN + spinVel) * dt;
          spinVel *= Math.pow(0.12, dt); // smooth exponential decay
        }

        // 3-layer parallax: globe (1x), stars (counter, 0.35x).
        parallax.x += (parallax.tx - parallax.x) * Math.min(1, dt * 4);
        parallax.y += (parallax.ty - parallax.y) * Math.min(1, dt * 4);
        tiltGroup.position.x = parallax.x * 0.08 * globeScale * 0.25;
        tiltGroup.rotation.x = parallax.y * 0.05;
        starGroup.rotation.y = -parallax.x * 0.045;
        starGroup.rotation.x = -parallax.y * 0.03;

        dotsMat.uniforms.uTime.value = time;
        hubMat.uniforms.uTime.value = time;
        starMat.uniforms.uTime.value = time;
        for (const m of beamMats) m.uniforms.uTime.value = time;
        updateArcs(dt);
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
      viewIO.observe(section!);
      const onVisibility = () => {
        pageVisible = !document.hidden;
        setRunning();
      };
      document.addEventListener('visibilitychange', onVisibility);

      let killGsap: (() => void) | null = null;

      if (reducedMotion) {
        // Static frame: light a few arcs mid-flight, render once, done.
        running = false;
        arcs.forEach((arc, i) => {
          if (i % 3 !== 0) return;
          arc.mat.uniforms.uAlpha.value = 0.8;
          arc.mat.uniforms.uPulse.value = 0.2 + (i / arcs.length) * 0.6;
        });
        renderer.render(scene, camera);
        section!.classList.remove('dgh-anim');
      } else {
        raf = requestAnimationFrame(frame);
        await initGsap();
      }

      canvasWrapRef.current?.classList.add('dgh-canvas-on');

      /* ── GSAP: entrance reveal + scroll scrub ── */
      async function initGsap() {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger'),
        ]);
        if (disposed) return;
        gsap.registerPlugin(ScrollTrigger);

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

        // Scroll: globe grows slightly and dims as the next section arrives.
        const scrub = gsap.timeline({
          scrollTrigger: { trigger: section!, start: 'top top', end: 'bottom top', scrub: 0.6 },
        });
        scrub
          .to(canvasWrapRef.current, { scale: 1.13, opacity: 0.32, ease: 'none' }, 0)
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
        ro.disconnect();
        viewIO.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        section!.removeEventListener('mousemove', onMouseMove);
        section!.removeEventListener('mouseleave', onMouseLeave);
        section!.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('deviceorientation', onOrientation);
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
    <section ref={sectionRef} className="dgh-hero dgh-anim" aria-label={t('hero.badge')}>
      {/* Warm sunrise glow behind the planet horizon */}
      <div className="dgh-sunrise" aria-hidden="true" />

      {/* WebGL globe + stars (lazy-initialised) */}
      <div ref={canvasWrapRef} className="dgh-canvas-wrap" aria-hidden="true">
        <canvas ref={canvasRef} className="dgh-canvas" />
        <div ref={labelRef} className="dgh-hublabel" />
      </div>

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

      {/* All styles scoped under .dgh-hero — no global leakage. Injected via
          innerHTML so SSR text escaping can't cause a hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: CSS_TEXT }} />
    </section>
  );
}

/* ────────────────────────── Scoped styles ────────────────────────── */

// Film-grain texture: tiny SVG turbulence tile, inlined so no request is made.
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")";

const CSS_TEXT = `
.dgh-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  color: #fff;
  background: linear-gradient(180deg, #050b2e 0%, #071438 55%, #0a1a4a 100%);
}
.dgh-hero.dgh-dragging { cursor: grabbing; }

/* ── Scene layers ── */
.dgh-sunrise {
  position: absolute;
  inset: auto 0 0 0;
  height: 52%;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(58% 52% at 50% 100%,
    rgba(230, 176, 90, 0.30) 0%,
    rgba(120, 140, 220, 0.14) 42%,
    rgba(10, 26, 74, 0) 74%);
  animation: dgh-sunrise-breathe 9s ease-in-out infinite alternate;
}
.dgh-canvas-wrap {
  position: absolute;
  inset: 0;
  z-index: 1;
  transform-origin: 50% 78%;
  will-change: transform, opacity;
  pointer-events: none;
}
/* Fade-in lives on the inner canvas so GSAP can scrub the wrap's opacity
   without fighting a CSS transition. */
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
/* Primary CTA: Angkor-Gold fill (brand metallic recipe) with a glowing
   gradient border (padding-box / border-box trick). */
.dgh-cta {
  color: #2a1d04;
  border: 1.5px solid transparent;
  background:
    linear-gradient(160deg, #e6cb8b 0%, #c69749 46%, #8a6820 100%) padding-box,
    linear-gradient(120deg, #f7eac0, #57c8ff, #f7eac0) border-box;
  box-shadow: 0 0 26px rgba(198, 151, 73, 0.4), 0 6px 24px rgba(5, 11, 46, 0.5);
}
.dgh-cta:hover { box-shadow: 0 0 40px rgba(198, 151, 73, 0.6), 0 8px 28px rgba(5, 11, 46, 0.55); }
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
@keyframes dgh-sunrise-breathe {
  from { opacity: 0.85; }
  to { opacity: 1; }
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
  .dgh-sunrise, .dgh-cloud, .dgh-grain, .dgh-chip { animation: none; }
  .dgh-clouds { transition: none; }
  .dgh-cta, .dgh-cta-ghost { transition: none; }
}

@media (max-width: 640px) {
  .dgh-copy { padding-top: 5.5rem; }
  .dgh-chips { gap: 0.5rem; }
  .dgh-chip { padding: 0.55rem 1rem; font-size: 0.78rem; }
}
`;
