// Domner globe engine — the shared Three.js particle-globe core.
//
// Extracted from GlobeHero so one engine can drive two modes:
//   • Home spine (components/home/GlobeHero) — the cinematic hero planet with
//     hubs, arcs, beams, parallax, drag and GSAP scroll. Unchanged look.
//   • Flight focus (components/flights/FlightRouteGlobe) — the seatback route
//     view: camera framed on origin → destination with a gold great-circle
//     line and the live aircraft.
//
// The engine owns what both modes share: renderer/camera/scene assembly, the
// ~20k-dot continent particle field (Natural Earth land mask), the dark
// occluder sphere, the fresnel atmosphere rim, the twinkling starfield, the
// frame loop with per-material uTime updates, viewport/scale management, and
// disposal. Mode-specific set dressing (hubs, routes, aircraft…) is built by
// the callers with the shaders exported below and registered via
// `pointMats`/`timeMats` + `onFrame`.

import type * as ThreeNS from 'three';
import type * as ThreeSubset from './three';
import { isLand } from '@/components/home/globeLandMask';

/** Latitude/longitude (degrees) to a unit-sphere position. */
export function latLonToXYZ(lat: number, lon: number): [number, number, number] {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

/* ────────────────────────── Shaders ────────────────────────── */

// The land-dot shader carries an optional day/night terminator.
//
// `uNightMix` at 0 reproduces the original look exactly, so the flight-route
// globe and anything else sharing this engine are unaffected. At 1 the dots
// split at the real terminator: warm, flickering city lights on the night side,
// cooler and steadier on the daylit side. `uSunDir` is supplied in VIEW space —
// the CPU transforms it once per frame, which keeps this shader to one dot
// product (see components/globe/sun.ts).
export const DOTS_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uScale;      // px-per-world-unit at z=1
  uniform float uGlobeScale; // globe group scale (points ignore parent scale for size)
  uniform vec3 uSunDir;      // view space, normalised
  uniform float uNightMix;   // 0 = legacy look, 1 = terminator active
  varying float vAlpha;
  varying float vDay;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Fade dots as they turn away from the camera (soft limb).
    vec3 n = normalize(normalMatrix * normalize(position));
    float facing = smoothstep(-0.05, 0.45, n.z);
    // Gentle city-light flicker, unique phase per dot.
    float flicker = 0.72 + 0.28 * sin(uTime * 1.4 + aPhase);
    // Sunlit fraction, softened across the terminator band.
    float day = smoothstep(-0.12, 0.22, dot(n, uSunDir)) * uNightMix;
    vDay = day;
    // City lights twinkle at night; daylight is steady.
    vAlpha = facing * mix(flicker, 1.0, day);
    // Clamped in device pixels: under ~1 a dot shimmers as it crosses the pixel
    // grid, and past ~22 it stops reading as a city light and becomes a disc.
    // The engine also feeds uGlobeScale a distance-compensated value, so dots
    // grow sub-linearly as the camera descends instead of turning to porridge.
    gl_PointSize = clamp(aSize * uGlobeScale * uScale / -mv.z, 1.0, 22.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const DOTS_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;    // night side — warm city-light gold
  uniform vec3 uDayColor; // day side — cool, quieter
  varying float vAlpha;
  varying float vDay;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.14, d) * vAlpha * mix(1.0, 0.62, vDay);
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(uColor, uDayColor, vDay), a);
  }
`;

export const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fresnel rim on a back-side sphere: brightest at the silhouette edge.
export const ATMO_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  void main() {
    float rim = pow(clamp(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 4.5);
    gl_FragColor = vec4(uColor, 1.0) * rim * uIntensity;
  }
`;

export const ARC_VERT = /* glsl */ `
  varying float vT;
  void main() {
    vT = uv.x; // 0..1 along the tube
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Faint base line + a gaussian light pulse travelling from 0 -> 1.
export const ARC_FRAG = /* glsl */ `
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

export const BEAM_VERT = /* glsl */ `
  varying float vY;
  void main() {
    vY = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const BEAM_FRAG = /* glsl */ `
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

export const HUB_VERT = /* glsl */ `
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
    // Capped so a pin stays a bright node up close rather than a smeared blob.
    gl_PointSize = min(size * uGlobeScale * uScale / -mv.z, 96.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const HUB_FRAG = /* glsl */ `
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

export const STAR_VERT = /* glsl */ `
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

export const STAR_FRAG = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(0.85, 0.92, 1.0, a);
  }
`;

/* ────────────────────────── Engine ────────────────────────── */

export interface GlobeEngineOptions {
  isMobile: boolean;
  /** Land dots to place (default 8k mobile / 20k desktop). */
  dotCount?: number;
  /** Starfield points (default 450 mobile / 900 desktop). */
  starCount?: number;
  /** Device-pixel-ratio ceiling (default 1.5 mobile / 2 desktop). */
  maxDpr?: number;
  /** Throttle the render loop, e.g. 30 on low-end devices. 0 = uncapped. */
  targetFps?: number;
}

export interface GlobeEngine {
  /** The trimmed three.js surface — see components/globe/three.ts. */
  THREE: typeof ThreeSubset;
  renderer: ThreeNS.WebGLRenderer;
  scene: ThreeNS.Scene;
  camera: ThreeNS.PerspectiveCamera;
  /** Carries axial tilt / framing + world placement; parent of spinGroup. */
  tiltGroup: ThreeNS.Group;
  /** Rotates; all lat/lon-anchored set dressing goes here. */
  spinGroup: ThreeNS.Group;
  starGroup: ThreeNS.Group;
  dotsMat: ThreeNS.ShaderMaterial;
  starMat: ThreeNS.ShaderMaterial;
  /** Point-shader materials that need uScale/uGlobeScale kept in sync. */
  pointMats: ThreeNS.ShaderMaterial[];
  /** Materials that need uTime driven every frame. */
  timeMats: ThreeNS.ShaderMaterial[];
  /** Register a GPU resource for disposal with the engine. */
  track<T extends { dispose(): void }>(x: T): T;
  /** Resize renderer + camera and refresh px-scale uniforms. */
  setViewport(w: number, h: number): void;
  /**
   * Dolly the camera and optionally narrow the lens. This is what makes a
   * descent read as approach rather than as zoom — scaling the globe group
   * (setGlobeScale) only ever gives you a bigger sphere of the same dots.
   */
  setCamera(distance: number, fov?: number): void;
  /** Terminator control. `mix` 0 keeps the original flat-lit look. */
  setSun(dirWorld: { x: number; y: number; z: number }, mix: number): void;
  /** Change the frame budget at runtime — the watchdog uses this to shed load
   *  on a device that cannot hold 60fps, instead of stuttering the whole page. */
  setTargetFps(fps: number): void;
  /** Lower (or raise) the device-pixel-ratio ceiling at runtime. Prefer this
   *  over renderer.setPixelRatio, which a later resize would overwrite. */
  setMaxDpr(v: number): void;
  /** Fired when the render resolution changes: browser zoom, page pinch-zoom,
   *  or a move to a different-density display. The engine has already resized
   *  its buffer by the time this runs — callers re-apply their own framing. */
  onResolutionChange(fn: () => void): void;
  /** Scale the globe group and refresh dot-size uniforms. */
  setGlobeScale(s: number): void;
  getGlobeScale(): number;
  /** Add a per-frame callback (dt seconds, absolute time seconds). */
  onFrame(fn: (dt: number, time: number) => void): void;
  start(): void;
  stop(): void;
  renderOnce(): void;
  dispose(): void;
}

export async function createGlobeEngine(
  canvas: HTMLCanvasElement,
  opts: GlobeEngineOptions,
): Promise<GlobeEngine> {
  // Only the symbols we use (see ./three) — importing the whole package
  // costs an extra ~87KB gzipped in export glue alone.
  const THREE = await import('./three');
  const { isMobile } = opts;

  /* ── Renderer / camera / scene ── */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    // MSAA on the silhouette: the occluder limb, the atmosphere rim and the
    // route tubes are hard edges that stairstep badly without it. Desktop only
    // — on mobile the fill cost is not worth it.
    antialias: !isMobile,
    powerPreference: 'high-performance',
  });

  /* ── Render resolution, tracked live ──────────────────────────────────────
     devicePixelRatio changes when the visitor zooms the browser or drags the
     window to a different-density display; visualViewport.scale changes when
     they pinch-zoom the page on a phone. Sampling either once at startup is
     what makes the planet go soft the moment anyone zooms — the drawing buffer
     keeps its old size and the browser upscales it.

     The ceiling is a *pixel budget* rather than a fixed ratio, because what
     costs GPU time is the buffer area (cssArea x ratio^2), not the ratio. A
     browser zoom shrinks the CSS box by the same factor devicePixelRatio grows
     by, so budgeting on area lets the ratio climb to exactly what the display
     needs and the buffer comes out the size it already was: sharp at every zoom
     level, for no extra cost. `maxDpr` from the device tier is still a hard
     ceiling on top, and the frame watchdog can lower it at runtime.          */
  let maxDpr = opts.maxDpr ?? (isMobile ? 2 : 2.5);
  const budget = isMobile ? 3.5e6 : 16e6;
  const currentRatio = (cssW: number, cssH: number) => {
    const dpr = window.devicePixelRatio || 1;
    const pageZoom = window.visualViewport?.scale ?? 1;
    const area = Math.max(1, cssW * cssH);
    return Math.max(1, Math.min(dpr * pageZoom, maxDpr, Math.sqrt(budget / area)));
  };
  renderer.setPixelRatio(
    currentRatio(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight),
  );

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(0, 0, 2.9);

  // tiltGroup carries the axial tilt / framing; spinGroup rotates inside it.
  const tiltGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  tiltGroup.add(spinGroup);
  scene.add(tiltGroup);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  /* ── Continent particle field (dots on land, fibonacci sphere) ── */
  const targetDots = opts.dotCount ?? (isMobile ? 8000 : 20000);
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
        uDayColor: { value: new THREE.Color('#9fc6e8') }, // cool daylit land
        uSunDir: { value: new THREE.Vector3(0, 0, 1) },
        uNightMix: { value: 0 }, // off by default — existing callers unchanged
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  spinGroup.add(new THREE.Points(dotsGeo, dotsMat));

  /* ── Dark occluder sphere (hides far-side dots, gives the disc) ── */
  // Segment counts drive the silhouette. At 48 the limb is a visible polygon
  // as soon as the camera descends, which is most of why close-ups looked cheap.
  const SPHERE_SEG = isMobile ? 96 : 160;
  const occGeo = track(new THREE.SphereGeometry(0.992, SPHERE_SEG, SPHERE_SEG / 2));
  const occMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#060f2c') }));
  tiltGroup.add(new THREE.Mesh(occGeo, occMat));

  /* ── Cyan fresnel atmosphere rim ── */
  const atmoGeo = track(new THREE.SphereGeometry(1.05, SPHERE_SEG, SPHERE_SEG / 2));
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

  /* ── Starfield (twinkling, slow parallax layer) ── */
  const starCount = opts.starCount ?? (isMobile ? 450 : 900);
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

  /* ── Viewport / scale plumbing ── */
  const pointMats: ThreeNS.ShaderMaterial[] = [];
  const timeMats: ThreeNS.ShaderMaterial[] = [];
  let globeScale = 1;

  /**
   * Dot size in pixels tracks 1/cameraDistance, so descending from the idle
   * 4.2 to an arrival altitude would otherwise fatten every dot by the same
   * factor the world grows — continents turn to porridge exactly when you are
   * closest to them. Feeding uGlobeScale a compensated value makes them grow as
   * distance^-0.4 instead, so they stay reading as points while the land they
   * describe magnifies fully. The local LOD patch fills the gaps that opens.
   */
  const BASE_DISTANCE = camera.position.z;
  const dotSizeScale = () =>
    globeScale * Math.pow(Math.max(0.2, camera.position.z) / BASE_DISTANCE, 0.6);

  const applyDotUniforms = (pxScale: number) => {
    const s = dotSizeScale();
    for (const m of [dotsMat, ...pointMats]) {
      m.uniforms.uScale.value = pxScale;
      m.uniforms.uGlobeScale.value = s;
    }
    starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  };

  let lastW = 1;
  let lastH = 1;
  const setViewport = (w: number, h: number) => {
    lastW = w;
    lastH = h;
    renderer.setPixelRatio(currentRatio(w, h));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const pxScale =
      (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    applyDotUniforms(pxScale);
  };

  /* A DPR change fires no resize event of its own, so arm a media query at the
     current ratio: it flips the moment the ratio moves, and we re-arm at the
     new value. Page pinch-zoom comes through visualViewport instead. */
  const resolutionFns: (() => void)[] = [];
  const notifyResolution = () => {
    setViewport(lastW, lastH);
    for (const fn of resolutionFns) fn();
  };
  let ratioMql: MediaQueryList | null = null;
  const onRatioChange = () => {
    armRatioWatch();
    notifyResolution();
  };
  const armRatioWatch = () => {
    ratioMql?.removeEventListener('change', onRatioChange);
    ratioMql = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    ratioMql.addEventListener('change', onRatioChange);
  };
  armRatioWatch();
  window.visualViewport?.addEventListener('resize', notifyResolution);

  /** The frame watchdog lowers this rather than poking the renderer directly,
   *  so a later resize cannot silently restore a ratio the device can't hold. */
  const setMaxDpr = (v: number) => {
    maxDpr = v;
    setViewport(lastW, lastH);
  };

  const refreshPxScale = () => {
    const pxScale =
      (lastH * renderer.getPixelRatio()) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    applyDotUniforms(pxScale);
  };

  const setGlobeScale = (s: number) => {
    globeScale = s;
    tiltGroup.scale.setScalar(s);
    refreshPxScale();
  };

  const setCamera = (distance: number, fov?: number) => {
    camera.position.z = distance;
    if (fov != null && fov !== camera.fov) camera.fov = fov;
    camera.updateProjectionMatrix();
    refreshPxScale();
  };

  // The sun direction arrives in world space; the dot shader wants it in view
  // space so it can be compared against the view-space normal with a single
  // dot product. Transform once per call rather than per vertex.
  const sunWorld = new THREE.Vector3(0, 0, 1);
  const sunView = new THREE.Vector3();
  const setSun = (dirWorld: { x: number; y: number; z: number }, mix: number) => {
    sunWorld.set(dirWorld.x, dirWorld.y, dirWorld.z).normalize();
    sunView.copy(sunWorld).transformDirection(camera.matrixWorldInverse).normalize();
    dotsMat.uniforms.uSunDir.value.copy(sunView);
    dotsMat.uniforms.uNightMix.value = mix;
  };

  /* ── Frame loop ── */
  const frameFns: ((dt: number, time: number) => void)[] = [];
  let prevMs = performance.now();
  let time = 0;
  let raf = 0;
  let running = false;
  let disposed = false;

  // Frame budget. 0 = render every rAF; 30 halves the work on a phone that
  // cannot hold 60 without the fans (or the battery) noticing.
  let frameBudgetMs = opts.targetFps && opts.targetFps > 0 ? 1000 / opts.targetFps - 1 : 0;
  const setTargetFps = (fps: number) => {
    frameBudgetMs = fps > 0 ? 1000 / fps - 1 : 0;
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const nowMs = performance.now();
    if (frameBudgetMs && nowMs - prevMs < frameBudgetMs) return;
    const dt = Math.min((nowMs - prevMs) / 1000, 0.05);
    prevMs = nowMs;
    time += dt;

    // Keep the terminator correct as the camera moves.
    if (dotsMat.uniforms.uNightMix.value > 0) {
      sunView.copy(sunWorld).transformDirection(camera.matrixWorldInverse).normalize();
      dotsMat.uniforms.uSunDir.value.copy(sunView);
    }

    dotsMat.uniforms.uTime.value = time;
    starMat.uniforms.uTime.value = time;
    for (const m of timeMats) m.uniforms.uTime.value = time;
    for (const fn of frameFns) fn(dt, time);

    renderer.render(scene, camera);
  };

  return {
    THREE,
    renderer,
    scene,
    camera,
    tiltGroup,
    spinGroup,
    starGroup,
    dotsMat,
    starMat,
    pointMats,
    timeMats,
    track,
    setViewport,
    setCamera,
    setSun,
    setTargetFps,
    setMaxDpr,
    onResolutionChange: (fn) => resolutionFns.push(fn),
    setGlobeScale,
    getGlobeScale: () => globeScale,
    onFrame: (fn) => frameFns.push(fn),
    start: () => {
      if (running || disposed) return;
      running = true;
      prevMs = performance.now(); // swallow the pause gap
      raf = requestAnimationFrame(frame);
    },
    stop: () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    },
    renderOnce: () => renderer.render(scene, camera),
    dispose: () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      ratioMql?.removeEventListener('change', onRatioChange);
      window.visualViewport?.removeEventListener('resize', notifyResolution);
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
