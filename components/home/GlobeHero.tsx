'use client';

/**
 * GlobeHero — the emotional centrepiece. A cinematic 3D particle globe that is
 * the *only* thing on the first screen besides a greeting and a search field.
 *
 * Two states, one continuous surface — never a page change:
 *
 *  • IDLE ("home spine") — the planet turns slowly at the seam between this
 *    hero and the Cambodia showcase below, so a single sphere spans both
 *    sections. Greeting, question, subtitle, search. Nothing else.
 *
 *  • FOCUSED ("approach") — a destination is chosen, and instead of navigating
 *    the globe *flies*: it takes the shortest rotation to bring that latitude
 *    and longitude to face the camera, drops its axial tilt, and grows until
 *    the horizon curves away like a descent. A gold pin lights up on the
 *    surface with slow sonar rings, the atmosphere rim retints to the
 *    destination's sky mood, and the copy cross-fades in place.
 *
 * A standalone, drop-in <section>. Every style is scoped under the `dgh-`
 * (Domner Globe Hero) prefix so nothing leaks into the rest of the site.
 *
 * Tech:
 *  - The shared engine (components/globe/globeEngine) owns the core scene:
 *    ~20k glowing dots mapped to real continent landmass data (Natural Earth
 *    110m bit mask), the occluder sphere, fresnel atmosphere rim, twinkling
 *    starfield, and the frame loop. Lazy-loaded when the section enters the
 *    viewport. (The flight pages reuse the same engine in flight focus mode —
 *    see components/flights/FlightRouteGlobe.)
 *  - This component adds the home set dressing: hub nodes, travelling arc
 *    pulses, rising hub beams, the destination pin — and GSAP + ScrollTrigger
 *    for the entrance reveal and the scroll-linked scrub.
 *
 * Interactivity: 3-layer mouse parallax (globe / stars / clouds), drag to
 * spin with inertia (desktop), hub hover -> pulse + city label, gyroscope
 * parallax on Android, scroll scrub. Honours prefers-reduced-motion by
 * rendering a single static frame with no animation — including the fly-to,
 * which becomes an instant cut to the destination.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import type * as ThreeNS from 'three';
import { useLang } from '@/lib/i18n';
import {
  createGlobeEngine,
  latLonToXYZ,
  ARC_VERT,
  ARC_FRAG,
  BEAM_VERT,
  BEAM_FRAG,
  HUB_VERT,
  HUB_FRAG,
} from '@/components/globe/globeEngine';

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

/** Where the globe should sit on screen, as a fraction of the stage height. */
const IDLE_FACTOR = 0.44; // sphere diameter / viewport width, idle
// The pin lands in the upper quarter, with the arrival copy settling below it —
// so the destination marker and the destination's name never fight for the same
// pixels the way a dead-centre pin does.
const FOCUS_PIN_F = 0.24;
const TILT_DEG = -17; // idle axial tilt

/* ────────────────────────── Props ────────────────────────── */

export interface GlobeFocus {
  lat: number;
  lon: number;
  /** Atmosphere rim colour for this destination's sky mood. */
  rim: string;
  /** Pin colour. Large-format accent only — never used for text. */
  accent: string;
}

interface GlobeHeroProps {
  /** The destination the globe is flying to, or null for the idle home spine. */
  focus: GlobeFocus | null;
  /** The copy layer: greeting + search when idle, arrival card when focused. */
  children: ReactNode;
}

/* ────────────────────────── Component ────────────────────────── */

export function GlobeHero({ focus, children }: GlobeHeroProps) {
  const { t } = useLang();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  // The scene's imperative handle, published once WebGL is up. `latestFocus`
  // carries whatever was chosen before that happened, so a very early search
  // is never dropped.
  const applyFocusRef = useRef<((f: GlobeFocus | null) => void) | null>(null);
  const latestFocus = useRef<GlobeFocus | null>(focus);

  useEffect(() => {
    latestFocus.current = focus;
    applyFocusRef.current?.(focus);
  }, [focus]);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas || !canvasWrapRef.current) return;
    // Assert non-null so the type is preserved inside the async init() closure
    // below (same reason `section!` is used throughout).
    const wrap = canvasWrapRef.current!;
    // The globe layer is an absolute child of .dgh-stage, the wrapper that
    // holds both the hero and the Cambodia showcase. Sizing + pointer maths use
    // the stage box so the sphere spans both sections.
    const stage = wrap.parentElement ?? section;

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
      const engine = await createGlobeEngine(canvas as HTMLCanvasElement, { isMobile });
      if (disposed) {
        engine.dispose();
        return;
      }
      const { THREE, camera, tiltGroup, spinGroup, starGroup, track } = engine;

      // Axial tilt + starting orientation: East Asia's hubs (Tokyo/Seoul)
      // rising over the horizon. Held in `orient` rather than written straight
      // onto the group, because the fly-to eases these toward new targets while
      // pointer parallax adds on top of them every frame.
      const TILT_Z = THREE.MathUtils.degToRad(TILT_DEG);
      const orient = { tiltX: 0, tiltZ: TILT_Z };
      spinGroup.rotation.y = 1.96;

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
      engine.pointMats.push(hubMat); // keep uScale/uGlobeScale in sync
      engine.timeMats.push(hubMat);

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
        engine.timeMats.push(mat);
      }

      /* ── Destination pin: a core light, a rising beam, and sonar rings ──
         Parented to spinGroup so it rides the globe's rotation, and oriented so
         its local +Y is the surface normal — the same trick the hub beams use.
         Everything fades with `focusAmt`, so the pin only exists during an
         approach and costs nothing on the idle home spine. */
      const pinGroup = new THREE.Group();
      pinGroup.visible = false;
      spinGroup.add(pinGroup);

      const pinCoreMat = track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#f7eac0'),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const pinCore = new THREE.Mesh(track(new THREE.SphereGeometry(0.011, 16, 12)), pinCoreMat);
      pinGroup.add(pinCore);

      const pinBeamGeo = track(new THREE.CylinderGeometry(0.007, 0.026, 0.26, 10, 1, true));
      pinBeamGeo.translate(0, 0.13, 0);
      const pinBeamMat = track(
        new THREE.ShaderMaterial({
          vertexShader: BEAM_VERT,
          fragmentShader: BEAM_FRAG,
          uniforms: {
            uTime: { value: 0 },
            uPhase: { value: 0 },
            uColor: { value: new THREE.Color('#f7eac0') },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      pinGroup.add(new THREE.Mesh(pinBeamGeo, pinBeamMat));
      engine.timeMats.push(pinBeamMat);

      // Three hairline rings expanding out of the pin on a staggered loop. Kept
      // deliberately thin — at approach scale a fat band reads as a bullseye
      // target rather than a soft ping.
      const ringGeo = track(new THREE.RingGeometry(0.93, 1, 64));
      const rings = [0, 0.34, 0.67].map((phase) => {
        const mat = track(
          new THREE.MeshBasicMaterial({
            color: new THREE.Color('#f7eac0'),
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const mesh = new THREE.Mesh(ringGeo, mat);
        mesh.rotation.x = -Math.PI / 2; // ring normal -> local +Y (the surface normal)
        mesh.position.y = 0.006; // float just clear of the occluder sphere
        pinGroup.add(mesh);
        return { mesh, mat, phase };
      });

      const setPinColor = (hex: string) => {
        pinCoreMat.color.set(hex);
        pinBeamMat.uniforms.uColor.value.set(hex);
        for (const r of rings) r.mat.color.set(hex);
      };

      const movePin = (lat: number, lon: number) => {
        const n = new THREE.Vector3(...latLonToXYZ(lat, lon));
        pinGroup.position.copy(n);
        pinGroup.quaternion.setFromUnitVectors(up, n.clone().normalize());
      };

      let ringT = 0;
      const updatePin = (dt: number, amt: number) => {
        pinGroup.visible = amt > 0.01;
        if (!pinGroup.visible) return;
        pinCoreMat.opacity = amt;
        ringT = (ringT + dt * 0.36) % 1;
        for (const r of rings) {
          const p = (ringT + r.phase) % 1;
          r.mesh.scale.setScalar(0.022 + p * 0.1);
          // Ease in fast, then a squared fade so the ring dissolves into the
          // surface rather than switching off at the end of its travel.
          r.mat.opacity = Math.min(1, p / 0.08) * (1 - p) * (1 - p) * 0.7 * amt;
        }
      };

      /* ── Layout: idle placement and approach placement, blended per frame ──
         IDLE — one full sphere centred on the hero/showcase seam. The canvas
         spans the whole stage, so the top hemisphere lives in the hero and the
         bottom sits behind the Cambodia carousel: one planet, two sections.
         FOCUS — the sphere grows until its horizon curves off screen and the
         pin sits FOCUS_PIN_F down the viewport, which reads as a descent
         rather than a zoom. */
      const place = { idleScale: 1, idleY: 0, focusScale: 1, focusY: 0 };
      const layout = () => {
        const w = wrap.clientWidth;
        const h = wrap.clientHeight; // full stage height (hero + showcase)
        if (!w || !h) return;
        engine.setViewport(w, h);
        const dist = camera.position.z;
        const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const halfH = halfTan * dist;
        const halfW = halfH * camera.aspect;

        // Radius as a fraction of the viewport half-width, capped so a tall
        // stage never lets the sphere overflow its vertical room.
        place.idleScale = Math.min(halfH * 0.92, halfW * IDLE_FACTOR);
        // Screen fraction of the seam (bottom of the hero within the stage).
        const heroH = section!.offsetHeight || h * 0.5;
        const fSeam = Math.min(0.985, (heroH - place.idleScale * 0.02) / h);
        place.idleY = halfH * (1 - 2 * fSeam);

        // Approach: close enough that the horizon curves away, far enough that
        // it still reads as a planet rather than a starfield — and never so
        // close that the pin (which sits at z = scale) crowds the camera.
        place.focusScale = Math.min(dist * 0.4, Math.max(halfH * 1.1, halfW * 0.8));
        const halfHAtPin = halfTan * (dist - place.focusScale);
        place.focusY = halfHAtPin * (1 - 2 * FOCUS_PIN_F);
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(stage);

      /* ── Interaction state ── */
      const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
      let spinVel = 0; // extra user-imparted spin (rad/s)
      let dragging = false;
      let lastDragX = 0;
      let hoveredHub = -1;
      const mousePx = { x: -1e4, y: -1e4 };
      const BASE_SPIN = (Math.PI * 2) / 90; // one revolution / 90s

      /* ── Fly-to state ──
         `focusAmt` eases 0 -> 1 and drives scale, placement and pin alpha
         together, so the whole approach is one value. `spinTargetY` is an
         absolute (un-wrapped) angle: the shortest signed delta from wherever
         the globe happens to be, so it never spins the long way round. */
      let focusAmt = 0;
      let focusTarget = 0;
      // Seconds since the flight began. The descent is deliberately held back
      // until the planet has turned: zooming and rotating at once flies you
      // across the open Pacific at full magnification, where there is no land
      // and no horizon, and the whole moment reads as a blank screen.
      let flightClock = 0;
      const ROTATE_SECONDS = 1.15;
      let spinTargetY: number | null = null;
      let targetTiltX = 0;
      const rimColor = new THREE.Color('#57c8ff');
      const rimTarget = new THREE.Color('#57c8ff');

      const applyFocus = (f: GlobeFocus | null) => {
        if (!f) {
          focusTarget = 0;
          flightClock = 0;
          spinTargetY = null;
          targetTiltX = 0;
          rimTarget.set('#57c8ff');
          return;
        }
        flightClock = 0;
        // Bring (lat, lon) to face the camera.
        //
        // A point's azimuth in the XZ plane is (lon + 90°), and rotating
        // spinGroup about Y *adds* to that azimuth — so the spin that swings it
        // to the front is -(lon + 90°). Latitude is then cancelled by tilting
        // about X by +lat (the group's Euler resolves to RX·RZ, so this only
        // holds once the axial roll about Z is eased out — which is why tiltZ
        // is targeted to 0 alongside it).
        const lonRad = (f.lon * Math.PI) / 180;
        const desired = -(lonRad + Math.PI / 2);
        const cur = spinGroup.rotation.y;
        const delta = ((((desired - cur) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        spinTargetY = cur + delta;
        targetTiltX = (f.lat * Math.PI) / 180;
        focusTarget = 1;
        movePin(f.lat, f.lon);
        setPinColor(f.accent);
        rimTarget.set(f.rim);
        if (reducedMotion) {
          // No animation allowed: cut straight to the arrival frame.
          focusAmt = 1;
          flightClock = ROTATE_SECONDS + 1;
          spinGroup.rotation.y = spinTargetY;
          orient.tiltX = targetTiltX;
          orient.tiltZ = 0;
          rimColor.copy(rimTarget);
          engine.atmoMat.uniforms.uColor.value.copy(rimColor);
          settle();
          engine.renderOnce();
        }
      };

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
        if (focusTarget === 1) return; // during an approach the camera is ours
        const target = e.target as HTMLElement;
        // Don't hijack links/buttons or the Cambodia carousel's own drag/controls.
        if (target.closest('a, button, input, [role="tablist"], .cam-stage')) return;
        dragging = true;
        lastDragX = e.clientX;
        stage.classList.add('dgh-dragging');
        // First real drag — the hint chip has done its job, fade it out.
        section!.classList.add('dgh-interacted');
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

      /* ── Hub hover: nearest projected node -> pulse + city label ── */
      const label = labelRef.current;
      const worldV = new THREE.Vector3();
      const camDir = new THREE.Vector3();
      const updateHover = () => {
        if (isMobile || !label) return;
        // Hub labels are the idle globe's affordance; during an approach the
        // destination has its own pin and they would only add noise.
        if (focusAmt > 0.15) {
          if (hoveredHub !== -1) {
            hoveredHub = -1;
            label.classList.remove('dgh-hublabel-on');
          }
          return;
        }
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

      /* ── Write the blended placement + orientation onto the scene ── */
      const settle = () => {
        // Smoothstep so the approach decelerates into the destination instead
        // of arriving at constant speed.
        const e = focusAmt * focusAmt * (3 - 2 * focusAmt);
        const scale = place.idleScale + (place.focusScale - place.idleScale) * e;
        engine.setGlobeScale(scale);
        // Pointer parallax is damped as we close in — at 60,000 feet the
        // planet does not sway with your mouse.
        const pf = 1 - e * 0.85;
        tiltGroup.position.y = place.idleY + (place.focusY - place.idleY) * e;
        tiltGroup.position.x = parallax.x * 0.02 * scale * pf;
        tiltGroup.rotation.x = orient.tiltX + parallax.y * 0.05 * pf;
        tiltGroup.rotation.z = orient.tiltZ;
        starGroup.rotation.y = -parallax.x * 0.045 * pf;
        starGroup.rotation.x = -parallax.y * 0.03 * pf;
      };

      /* ── Per-frame home behaviour (engine drives uTime + render) ── */
      engine.onFrame((dt) => {
        const k = Math.min(1, dt * 1.6); // shared orientation easing rate

        // Two beats, not one: turn toward the destination, *then* descend.
        if (focusTarget === 1) {
          flightClock += dt;
          const descend = flightClock > ROTATE_SECONDS ? 1 : 0;
          focusAmt += (descend - focusAmt) * Math.min(1, dt * 1.6);
        } else {
          focusAmt += (0 - focusAmt) * Math.min(1, dt * 2.2);
        }

        if (focusTarget === 1 && spinTargetY !== null) {
          spinGroup.rotation.y += (spinTargetY - spinGroup.rotation.y) * k;
          // A whisper of residual drift so the arrived planet is never frozen.
          spinTargetY += BASE_SPIN * 0.1 * dt;
          orient.tiltX += (targetTiltX - orient.tiltX) * k;
          orient.tiltZ += (0 - orient.tiltZ) * k;
          spinVel = 0;
        } else {
          // Perpetual spin + user inertia decaying back to the base speed.
          if (!dragging) {
            spinGroup.rotation.y += (BASE_SPIN + spinVel) * dt;
            spinVel *= Math.pow(0.12, dt); // smooth exponential decay
          }
          orient.tiltX += (0 - orient.tiltX) * k;
          orient.tiltZ += (TILT_Z - orient.tiltZ) * k;
        }

        // 3-layer parallax: globe (1x), stars (counter, 0.35x).
        parallax.x += (parallax.tx - parallax.x) * Math.min(1, dt * 4);
        parallax.y += (parallax.ty - parallax.y) * Math.min(1, dt * 4);

        // Retint the atmosphere toward the destination's sky mood.
        rimColor.lerp(rimTarget, Math.min(1, dt * 1.2));
        engine.atmoMat.uniforms.uColor.value.copy(rimColor);

        settle();
        updatePin(dt, focusAmt);
        updateArcs(dt);
        updateHover();
      });

      /* ── Run only while in view, page visible, and motion allowed ── */
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
      viewIO.observe(stage);
      const onVisibility = () => {
        pageVisible = !document.hidden;
        setRunning();
      };
      document.addEventListener('visibilitychange', onVisibility);

      let killGsap: (() => void) | null = null;

      if (reducedMotion) {
        // Static frame: light a few arcs mid-flight, render once, done.
        arcs.forEach((arc, i) => {
          if (i % 3 !== 0) return;
          arc.mat.uniforms.uAlpha.value = 0.8;
          arc.mat.uniforms.uPulse.value = 0.2 + (i / arcs.length) * 0.6;
        });
        settle();
        engine.renderOnce();
        section!.classList.remove('dgh-anim');
      } else {
        engine.start();
        await initGsap();
      }

      // Publish the handle and honour anything chosen while WebGL was booting.
      applyFocusRef.current = applyFocus;
      if (latestFocus.current) applyFocus(latestFocus.current);

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

        // Scroll: the hero copy lifts and fades as you move toward the
        // showcase. The globe itself is NOT dimmed — it scrolls with the page
        // as one continuous planet into the section below.
        const scrub = gsap.timeline({
          scrollTrigger: { trigger: section!, start: 'top top', end: 'bottom top', scrub: 0.6 },
        });
        scrub.to(copyRef.current, { y: -70, opacity: 0, ease: 'none' }, 0);

        killGsap = () => {
          intro.kill();
          scrub.scrollTrigger?.kill();
          scrub.kill();
        };
      }

      /* ── Teardown ── */
      disposeScene = () => {
        applyFocusRef.current = null;
        ro.disconnect();
        viewIO.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        stage.removeEventListener('mousemove', onMouseMove);
        stage.removeEventListener('mouseleave', onMouseLeave);
        stage.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('deviceorientation', onOrientation);
        killGsap?.();
        engine.dispose();
      };
    }

    return () => {
      disposed = true;
      io.disconnect();
      disposeScene?.();
    };
  }, []);

  return (
    <>
      {/* Shared globe canvas. It is positioned absolutely against .dgh-stage
          (see HomeContent), which wraps BOTH this hero and the Cambodia
          showcase below — so a single full sphere reads as one planet spanning
          the two sections. Lazy-initialised when scrolled near. */}
      <div ref={canvasWrapRef} className="dgh-globe-layer" aria-hidden="true">
        <canvas ref={canvasRef} className="dgh-canvas" />
        <div ref={labelRef} className="dgh-hublabel" />
      </div>

      <section ref={sectionRef} className="dgh-hero dgh-anim" aria-label={t('home.ask')}>
        {/* Drifting volumetric mist layers */}
        <div className="dgh-clouds" aria-hidden="true">
          <div className="dgh-cloud dgh-cloud-a" />
          <div className="dgh-cloud dgh-cloud-b" />
          <div className="dgh-cloud dgh-cloud-c" />
        </div>

        {/* Film grain */}
        <div className="dgh-grain" aria-hidden="true" />

        {/* Copy layer — the only interface on the first screen. Its contents
            cross-fade between the idle greeting/search and the arrival card
            (see HomeContent); the globe underneath never cuts. */}
        <div ref={copyRef} className="dgh-copy">
          {children}
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
/* .dgh-stage wraps the hero AND the Cambodia showcase (see HomeContent). It
   owns the continuous deep-space gradient and hosts the shared globe layer, so
   one planet spans both sections as a single "page".
   --dgh-glow / --dgh-veil are set from the focused destination's sky mood
   (components/home/skyMoods.ts) and default to the home sky. */
.dgh-stage {
  position: relative;
  isolation: isolate;
  --dgh-glow: rgba(230, 176, 90, 0.12);
  --dgh-veil: rgba(30, 64, 122, 0.55);
  background:
    radial-gradient(52% 26% at 50% 41%, var(--dgh-glow) 0%, transparent 62%),
    radial-gradient(120% 48% at 50% 39%, var(--dgh-veil) 0%, transparent 60%),
    linear-gradient(180deg, #050b2e 0%, #08163a 28%, #0a1a4a 44%, #0b1c40 62%, #0e1b30 100%);
  transition: background 1.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.dgh-stage.dgh-dragging { cursor: grabbing; }

/* Drag affordance: on fine pointers the hero reads as grabbable. Links and
   buttons keep their own cursors; the Cambodia showcase (excluded from the
   globe drag) is outside .dgh-hero so it is not affected. */
@media (pointer: fine) {
  .dgh-hero { cursor: grab; }
  .dgh-stage.dgh-dragging .dgh-hero { cursor: grabbing; }
  /* Once a destination is chosen the globe is on rails — stop implying drag. */
  .dgh-stage[data-focused='true'] .dgh-hero { cursor: default; }
}

/* Shared globe canvas layer — spans the full stage, sits behind section content. */
.dgh-globe-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  will-change: transform, opacity;
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

/* Nav scrim. The navbar is transparent over this hero, and once the globe
   zooms in its dot field runs straight behind the menu — this keeps the bar
   legible without giving it a surface of its own. */
.dgh-hero::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  z-index: 4;
  height: 9rem;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(5, 11, 46, 0.62) 0%, rgba(5, 11, 46, 0.28) 45%, transparent 100%);
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

/* ── Copy layer ──
   One column, centred, with generous air above it. Everything the first screen
   is allowed to show lives in here. */
.dgh-copy {
  position: relative;
  z-index: 5;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  /* Copy sits in the upper-middle so the planet's limb owns the lower third.
     The generous bottom padding is what keeps content clear of the scroll cue,
     which is absolutely positioned against this same box. */
  justify-content: flex-start;
  width: 100%;
  max-width: 60rem;
  margin: 0 auto;
  padding: clamp(6rem, 14vh, 9rem) 1.25rem clamp(6.5rem, 12vh, 8.5rem);
  text-align: center;
}

/* On approach the copy drops to the lower half, leaving the pin clear sky. */
.dgh-stage[data-focused='true'] .dgh-copy {
  justify-content: flex-end;
}

/* Legibility scrim. The globe's dot field and starlight run straight under the
   copy, and white-on-starfield is where contrast quietly fails — this pushes
   the sky back under the text without reading as a panel. */
.dgh-copy::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  z-index: -1;
  width: min(130%, 72rem);
  height: 100%;
  transform: translateX(-50%);
  background: radial-gradient(
    58% 46% at 50% 44%,
    rgba(5, 11, 46, 0.78) 0%,
    rgba(5, 11, 46, 0.42) 52%,
    transparent 76%
  );
  pointer-events: none;
}

/* Greeting. Reserves its own line height before the client clock resolves, so
   the question below never jumps on hydration. No font-family here: the body
   face is inherited, which is how Khmer mode swaps script automatically. */
.dgh-greet {
  min-height: 1.6em;
  margin: 0;
  font-size: clamp(0.95rem, 1.4vw, 1.1rem);
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(230, 203, 139, 0.88);
}

.dgh-ask {
  margin: 0.75rem 0 0;
  font-weight: 700;
  font-size: clamp(2.5rem, 6.2vw, 5rem);
  line-height: 1.06;
  letter-spacing: -0.035em;
  text-wrap: balance;
  color: #fff;
}

.dgh-sub {
  margin: 1.25rem auto 0;
  max-width: 34rem;
  font-size: clamp(1rem, 1.5vw, 1.2rem);
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.66);
}

.dgh-searchwrap {
  width: 100%;
  max-width: 40rem;
  margin: clamp(2.25rem, 5vh, 3.25rem) auto 0;
}

/* Scroll cue — the only other mark on the first screen, and it earns its place
   by being the one thing that says "there is more". */
.dgh-cue {
  position: absolute;
  left: 50%;
  bottom: clamp(1rem, 3.5vh, 2.5rem);
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.38);
  animation: dgh-cue-breathe 3.4s ease-in-out infinite;
}
@keyframes dgh-cue-breathe {
  0%, 100% { transform: translate(-50%, 0); opacity: 0.55; }
  50% { transform: translate(-50%, 6px); opacity: 1; }
}

/* ── Entrance state (removed once GSAP finishes or on reduced motion) ──
   The first screen is *only* this copy, so it must never be able to stay
   blank: the keyframe is a failsafe that reveals it at 2.6s if GSAP never
   arrives (chunk failure, blocked CDN, hostile network). CSS animations
   outrank inline styles, but GSAP's intro lands at ~1.5s and removes
   .dgh-anim with it, so in the normal path this never runs. */
.dgh-anim .dgh-reveal {
  opacity: 0;
  transform: translateY(42px);
  filter: blur(12px);
  animation: dgh-failsafe 0.8s ease 2.6s forwards;
}
@keyframes dgh-failsafe {
  to { opacity: 1; transform: none; filter: blur(0); }
}

/* ── Keyframes ── */
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
  .dgh-anim .dgh-reveal { opacity: 1; transform: none; filter: none; animation: none; }
  .dgh-cloud, .dgh-grain, .dgh-cue { animation: none; }
  .dgh-clouds { transition: none; }
  .dgh-stage { transition: none; }
  .dgh-cue { opacity: 0.7; }
}

@media (max-width: 640px) {
  .dgh-copy { padding-top: 5.5rem; }
}
`;
