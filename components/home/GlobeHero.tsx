'use client';

/**
 * GlobeHero — cinematic 3D particle-globe hero section: the "home spine" mode
 * of the shared globe engine.
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
 *    pulses, rising hub beams — and GSAP + ScrollTrigger for the entrance
 *    reveal and the scroll-linked scrub.
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
    // `wrap` is the sticky viewport-sized canvas holder inside the absolute
    // .dgh-globe-layer, which spans .dgh-stage — the wrapper that holds the
    // hero, the Cambodia showcase and the narrative chapters. Pointer maths use
    // the wrap box; scroll maths use the stage box.
    const stage = wrap.closest<HTMLElement>('.dgh-stage') ?? wrap.parentElement ?? section;

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
      // rising over the horizon.
      tiltGroup.rotation.z = THREE.MathUtils.degToRad(-17);
      // Free-running spin angle. The rendered rotation blends this with each
      // chapter's focus angle (see applySpine), so narrative focus can take
      // over and hand back without a snap.
      let freeSpin = 1.96;
      spinGroup.rotation.y = freeSpin;

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
        engine.setViewport(w, h);
        const dist = camera.position.z;
        halfHWorld = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
        halfWWorld = halfHWorld * camera.aspect;
        // Radius as a fraction of the viewport half-width, capped so a short
        // wrap never lets the sphere overflow its vertical room.
        globeScale = Math.min(halfHWorld * 0.92, halfWWorld * FULL_FACTOR);
        radiusPx = (globeScale / halfHWorld) * (h / 2);
        engine.setGlobeScale(globeScale);
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
        engine.setGlobeScale(globeScale * s.scale);
        tiltGroup.position.x =
          (s.x - 0.5) * 2 * halfWWorld + parallax.x * 0.08 * globeScale * 0.25;
        tiltGroup.position.y = halfHWorld * (1 - 2 * s.y);
        tiltGroup.rotation.x = parallax.y * 0.05 + s.tiltX;
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
          engine.renderOnce();
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
        // Don't hijack links/buttons, the Cambodia carousel, or chapter cards.
        if (target.closest('a, button, input, [role="tablist"], .cam-stage, .dgc-card')) return;
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

      /* ── Hub hover: nearest projected node -> pulse + label ── */
      const label = labelRef.current;
      const worldV = new THREE.Vector3();
      const camDir = new THREE.Vector3();
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

      /* ── Per-frame home behaviour (engine drives uTime + render) ── */
      engine.onFrame((dt) => {
        // Perpetual spin + user inertia decaying back to the base speed.
        // Base spin winds down as a chapter takes rotational focus, so the
        // free angle doesn't drift far from what's on screen while locked.
        if (!dragging) {
          freeSpin += (BASE_SPIN * (1 - spine.focusW) + spinVel) * dt;
          spinVel *= Math.pow(0.12, dt); // smooth exponential decay
        }

        // 3-layer parallax: globe (1x), stars (counter, 0.35x). The globe's own
        // placement is applied by applySpine, which folds parallax.x in.
        parallax.x += (parallax.tx - parallax.x) * Math.min(1, dt * 4);
        parallax.y += (parallax.ty - parallax.y) * Math.min(1, dt * 4);
        starGroup.rotation.y = -parallax.x * 0.045;
        starGroup.rotation.x = -parallax.y * 0.03;

        // Pose the planet from the scroll spine (position, scale, focus).
        applySpine();

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
        // Static frames: light a few arcs mid-flight, then only re-render when
        // scroll moves the seam-locked planet — no motion of its own.
        arcs.forEach((arc, i) => {
          if (i % 3 !== 0) return;
          arc.mat.uniforms.uAlpha.value = 0.8;
          arc.mat.uniforms.uPulse.value = 0.2 + (i / arcs.length) * 0.6;
        });
        renderStatic();
        window.addEventListener('scroll', renderStatic, { passive: true });
        section!.classList.remove('dgh-anim');
      } else {
        engine.start();
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
        engine.dispose();
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
        {/* Interaction affordance: the globe is draggable but nothing said so.
            A quiet glass pill with a sliding gold dot invites the first spin;
            it fades once the visitor actually drags (dgh-interacted). Desktop
            only — drag is disabled on touch. Decorative, so aria-hidden. */}
        {/* The reveal class sits on a wrapper: GSAP leaves inline opacity on
            .dgh-reveal elements, which would override the fade-on-drag rule
            if it lived on the pill itself. */}
        <div className="dgh-reveal">
          <div className="dgh-hint" aria-hidden="true">
            <span className="dgh-hint-track">
              <i className="dgh-hint-dot" />
            </span>
            <span>
              Drag to spin the globe
              <span className="dgh-hint-km font-khmer"> · អូសបង្វិលផែនដី</span>
            </span>
          </div>
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

/* Drag affordance: on fine pointers the hero reads as grabbable. Links and
   buttons keep their own cursors; the Cambodia showcase (excluded from the
   globe drag) is outside .dgh-hero so it is not affected. */
@media (pointer: fine) {
  .dgh-hero { cursor: grab; }
  .dgh-stage.dgh-dragging .dgh-hero { cursor: grabbing; }
}

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
  /* The glow layers are deliberately far wider than the viewport so the
     falloff is soft; clip them here or they widen the document and the page
     scrolls sideways. */
  overflow: hidden;
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

/* ── Drag hint: quiet glass pill + sliding gold dot ── */
.dgh-hint {
  margin-top: 1.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 1.15rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.dgh-hint-km {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.42);
}
/* Chevron rails + a gold dot gliding between them = "drag me" in miniature. */
.dgh-hint-track {
  position: relative;
  width: 38px;
  height: 12px;
  flex-shrink: 0;
}
.dgh-hint-track::before,
.dgh-hint-track::after {
  position: absolute;
  top: 50%;
  transform: translateY(-54%);
  font-size: 0.85rem;
  line-height: 1;
  color: rgba(230, 203, 139, 0.75);
}
.dgh-hint-track::before { content: '‹'; left: 0; }
.dgh-hint-track::after { content: '›'; right: 0; }
.dgh-hint-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 999px;
  background: #e6cb8b;
  box-shadow: 0 0 8px rgba(230, 203, 139, 0.85);
  animation: dgh-hint-slide 1.7s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
}
@keyframes dgh-hint-slide {
  from { transform: translateX(-9px); }
  to { transform: translateX(9px); }
}
/* Job done: fade out after the first real drag. */
.dgh-interacted .dgh-hint {
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
}
/* Drag is desktop-only, so the invitation is too. */
@media (pointer: coarse) {
  .dgh-hint { display: none; }
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
  .dgh-cloud, .dgh-grain, .dgh-chip, .dgh-hint-dot { animation: none; }
  .dgh-hint { transition: none; }
  .dgh-clouds { transition: none; }
  .dgh-cta, .dgh-cta-ghost { transition: none; }
}

@media (max-width: 640px) {
  .dgh-copy { padding-top: 5.5rem; }
  .dgh-chips { gap: 0.5rem; }
  .dgh-chip { padding: 0.55rem 1rem; font-size: 0.78rem; }
}
`;
