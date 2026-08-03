'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The search-and-fly camera controller — the signature interaction.
//
// One state machine holds `from`, `to` and `t`. Searching a second destination
// re-aims `to` and recomputes `from` as the *current interpolated pose*, so the
// second flight departs from wherever the first had reached. There is no queue
// and no cancel-then-restart flash. Going back flies the reverse path from
// where you are; it never reloads the globe.
//
// Orientation maths: bringing (lat, lon) to face the camera needs exactly two
// angles, because the point's azimuth after a Y-rotation of θ is (φ − θ) and
// its local azimuth φ is −lon:
//     spinY = −lon − π/2      (turn the meridian toward the camera)
//     tiltX = +lat            (raise the parallel to the centre)
//
// Altitude is a real camera dolly plus a slight lens narrowing (38° → 31°).
// Scaling the globe group instead — which is what this codebase did before —
// only ever produces a bigger sphere of the same dots, never an approach.
// ─────────────────────────────────────────────────────────────────────────────

import type * as ThreeNS from 'three';
import type { GlobeEngine } from './globeEngine';
import { latLonToXYZ, HUB_VERT, HUB_FRAG } from './globeEngine';
import { sunDirectionLocal } from './sun';
import { isLand } from '@/components/home/globeLandMask';
import { easeFlight, easeSettle, lerp, lerpAngle, hexToRgb, tween, type TweenHandle } from '@/lib/motion';

const DEG = Math.PI / 180;

/** Framing at rest: the whole planet, comfortably inside the viewport. */
export const IDLE_DISTANCE = 4.2;
export const IDLE_FOV = 38;
/**
 * At rest the globe is an *object* sitting in the upper part of the screen with
 * the copy beneath it — not a wallpaper the text has to fight. These two numbers
 * are that framing: a scale (fraction of the viewport half-height) and a lift
 * (how far above centre the sphere sits). Both resolve to 1 and 0 during a
 * flight, so on arrival the destination genuinely fills the frame.
 */
const IDLE_SCALE = 0.66;
const IDLE_LIFT = 0.4;
/** Framing on arrival, unless a destination overrides it. */
export const ARRIVAL_FOV = 31;
/** One revolution every 90 seconds, matching the previous hero. */
const BASE_SPIN = (Math.PI * 2) / 90;

export interface Pose {
  spinY: number;
  tiltX: number;
  distance: number;
  fov: number;
  /** Globe radius as a fraction of the viewport half-height. */
  framing: number;
  /** How far above centre the sphere sits, in half-heights. */
  lift: number;
  /** 0 = space, 1 = fully arrived. Drives atmosphere bloom and dot fade. */
  arrival: number;
}

export interface FlightTarget {
  slug: string;
  lat: number;
  lon: number;
  altitude: number;
  skyColor: string;
}

export type FlightPhase = 'idle' | 'flying' | 'arrived' | 'returning';

export interface FlightControllerOptions {
  engine: GlobeEngine;
  /** Per-tier: whether the camera really descends and how long it takes. */
  descend: boolean;
  durationMs: number;
  lodPatch: boolean;
  terminator: boolean;
  onPhase?: (phase: FlightPhase, slug: string | null) => void;
  /** Fires continuously during a flight so the page can drive the background. */
  onArrivalProgress?: (arrival: number, skyColor: string | null) => void;
}

export interface FlightController {
  flyTo(target: FlightTarget): void;
  returnToGlobe(): void;
  /** Re-apply the pose after a resize — framing is aspect-dependent. */
  refresh(): void;
  readonly phase: FlightPhase;
  readonly activeSlug: string | null;
  /** Pins shown while idle. */
  setPins(pins: { slug: string; lat: number; lon: number }[]): void;
  dispose(): void;
}

export function createFlightController(opts: FlightControllerOptions): FlightController {
  const { engine, descend, lodPatch, terminator } = opts;
  const { THREE, tiltGroup, spinGroup, camera } = engine;

  // Axial tilt is owned by the flight now, not by a decorative constant.
  tiltGroup.rotation.z = 0;

  const pose: Pose = {
    spinY: 1.96,
    tiltX: -0.16,
    distance: IDLE_DISTANCE,
    fov: IDLE_FOV,
    framing: IDLE_SCALE,
    lift: IDLE_LIFT,
    arrival: 0,
  };

  let phase: FlightPhase = 'idle';
  let activeSlug: string | null = null;
  let handle: TweenHandle | null = null;
  let target: FlightTarget | null = null;

  /* ── Destination pin: the existing hub shader, one point ── */
  const pinGeo = new THREE.BufferGeometry();
  pinGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  pinGeo.setAttribute('aHover', new THREE.Float32BufferAttribute([0], 1));
  pinGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute([0], 1));
  const pinMat = new THREE.ShaderMaterial({
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
  });
  const pin = new THREE.Points(pinGeo, pinMat);
  pin.visible = false;
  pin.scale.setScalar(0);
  spinGroup.add(pin);
  engine.pointMats.push(pinMat);
  engine.timeMats.push(pinMat);

  /* ── Idle pins: the routes we have written guides for ── */
  let idlePinsObj: ThreeNS.Points | null = null;
  const idlePinMat = new THREE.ShaderMaterial({
    vertexShader: HUB_VERT,
    fragmentShader: HUB_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1 },
      uGlobeScale: { value: 1 },
      uColor: { value: new THREE.Color('#e6cb8b') },
      uHoverColor: { value: new THREE.Color('#9fe4ff') },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  engine.pointMats.push(idlePinMat);
  engine.timeMats.push(idlePinMat);

  const setPins = (pins: { slug: string; lat: number; lon: number }[]) => {
    if (idlePinsObj) {
      spinGroup.remove(idlePinsObj);
      idlePinsObj.geometry.dispose();
    }
    const pos: number[] = [];
    const phases: number[] = [];
    for (const p of pins) {
      pos.push(...latLonToXYZ(p.lat, p.lon).map((v) => v * 1.005));
      phases.push(Math.random() * Math.PI * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aHover', new THREE.Float32BufferAttribute(new Float32Array(pins.length), 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    idlePinsObj = new THREE.Points(geo, idlePinMat);
    spinGroup.add(idlePinsObj);
  };

  /* ── Local LOD patch ──────────────────────────────────────────────────────
     The honest problem with descending on a 20k-dot planet: fill the screen
     with one country and you are looking at about sixty dots. So on the way
     down we generate a denser dot field for the destination region from the
     same land mask — no extra bytes over the network, ~6k points, built in
     time-boxed slices so it can never drop a frame. Detail *gains* on approach
     instead of thinning out.                                                */
  let patch: ThreeNS.Points | null = null;
  const patchMat = new THREE.ShaderMaterial({
    vertexShader: engine.dotsMat.vertexShader,
    fragmentShader: engine.dotsMat.fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 1 },
      uGlobeScale: { value: 1 },
      uColor: { value: new THREE.Color('#f2d9a4') },
      uDayColor: { value: new THREE.Color('#9fc6e8') },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      uNightMix: { value: terminator ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  engine.pointMats.push(patchMat);
  engine.timeMats.push(patchMat);

  let patchIdle = 0;
  const clearPatch = () => {
    if (patchIdle) {
      cancelAnimationFrame(patchIdle);
      patchIdle = 0;
    }
    if (patch) {
      spinGroup.remove(patch);
      patch.geometry.dispose();
      patch = null;
    }
  };

  const buildPatch = (lat: number, lon: number) => {
    clearPatch();
    const SPAN = 26; // degrees either side of the target
    const STEP = 0.26; // sampling resolution inside the window
    const positions: number[] = [];
    const sizes: number[] = [];
    const phases: number[] = [];

    let curLat = lat - SPAN;
    const stepSlice = () => {
      const sliceStart = performance.now();
      // Time-boxed: never spend more than ~4ms of a frame on this.
      while (curLat <= lat + SPAN && performance.now() - sliceStart < 4) {
        const lonSpan = SPAN / Math.max(0.25, Math.cos(curLat * DEG));
        for (let l = lon - lonSpan; l <= lon + lonSpan; l += STEP) {
          const jLat = curLat + (Math.random() - 0.5) * STEP;
          const jLon = l + (Math.random() - 0.5) * STEP;
          if (!isLand(jLat, jLon)) continue;
          positions.push(...latLonToXYZ(jLat, jLon).map((v) => v * 1.0005));
          sizes.push(0.0022 + Math.random() * 0.0026);
          phases.push(Math.random() * Math.PI * 2);
        }
        curLat += STEP;
      }
      if (curLat <= lat + SPAN) {
        patchIdle = requestAnimationFrame(stepSlice);
        return;
      }
      patchIdle = 0;
      if (!positions.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
      geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
      patch = new THREE.Points(geo, patchMat);
      spinGroup.add(patch);
    };
    patchIdle = requestAnimationFrame(stepSlice);
  };

  /* ── Atmosphere colour ── */
  const atmoMesh = tiltGroup.children.find(
    (c): c is ThreeNS.Mesh =>
      (c as ThreeNS.Mesh).isMesh === true &&
      ((c as ThreeNS.Mesh).material as ThreeNS.ShaderMaterial)?.uniforms?.uIntensity != null,
  );
  const atmoMat = atmoMesh?.material as ThreeNS.ShaderMaterial | undefined;
  const spaceRim: [number, number, number] = [0.34, 0.78, 1.0];

  const applyPose = () => {
    spinGroup.rotation.y = pose.spinY;
    tiltGroup.rotation.x = pose.tiltX;
    engine.setCamera(pose.distance, pose.fov);
    // Half-height of the view at the globe's plane, so framing and lift are
    // expressed in screen fractions rather than arbitrary world units.
    const halfH = Math.tan((pose.fov / 2) * DEG) * pose.distance;
    const halfW = halfH * camera.aspect;
    // The field of view is vertical, so a radius that frames well on a desktop
    // runs off both edges of a 390px phone. Cap by width as well — and release
    // the cap as we arrive, because by then filling the frame is the point.
    const radius = Math.min(pose.framing, halfW * (0.82 + 4 * pose.arrival));
    engine.setGlobeScale(radius);
    tiltGroup.position.y = halfH * pose.lift;
    if (atmoMat) {
      const sky = target ? hexToRgb(target.skyColor) : spaceRim;
      const t = pose.arrival;
      atmoMat.uniforms.uColor.value.setRGB(
        lerp(spaceRim[0], sky[0], t),
        lerp(spaceRim[1], sky[1], t),
        lerp(spaceRim[2], sky[2], t),
      );
      // The bloom that becomes the destination's sky.
      atmoMat.uniforms.uIntensity.value = 0.9 + t * t * 5.5;
    }
    opts.onArrivalProgress?.(pose.arrival, target?.skyColor ?? null);
  };

  /* ── Per-frame: idle spin, pin settle, sun tracking ── */
  const sunLocal = new THREE.Vector3(...sunDirectionLocal());
  const sunWorld = new THREE.Vector3();
  let sunAge = 0;
  let pinT = 0;

  engine.onFrame((dt) => {
    if (phase === 'idle') {
      pose.spinY += BASE_SPIN * dt;
      spinGroup.rotation.y = pose.spinY;
    }

    if (terminator) {
      sunAge += dt;
      if (sunAge > 60) {
        sunAge = 0;
        sunLocal.set(...sunDirectionLocal());
      }
      // Keep the lit hemisphere over the real geography as the globe turns.
      spinGroup.updateMatrixWorld();
      sunWorld.copy(sunLocal).transformDirection(spinGroup.matrixWorld);
      engine.setSun(sunWorld, 1);
    }

    // Pin arrival: one 6% overshoot, then settle. Nothing bouncy.
    if (pin.visible && pinT < 1) {
      pinT = Math.min(1, pinT + dt / 0.6);
      const e = easeSettle(pinT);
      pin.scale.setScalar(e * 1.06 - (e * e - e) * 0.4);
    }
  });

  /* ── The flight ── */
  const flyTo = (next: FlightTarget) => {
    handle?.cancel();
    clearPatch();

    const from: Pose = { ...pose };
    target = next;
    activeSlug = next.slug;
    phase = 'flying';
    opts.onPhase?.('flying', next.slug);

    const toSpin = -next.lon * DEG - Math.PI / 2;
    const toTilt = next.lat * DEG;
    const toDistance = descend ? next.altitude : IDLE_DISTANCE * 0.72;
    const toFov = descend ? ARRIVAL_FOV : IDLE_FOV;

    if (lodPatch) buildPatch(next.lat, next.lon);

    // Place the pin now; it scales up from nothing part-way through the descent.
    const p = latLonToXYZ(next.lat, next.lon).map((v) => v * 1.004);
    pinGeo.getAttribute('position').setXYZ(0, p[0], p[1], p[2]);
    pinGeo.getAttribute('position').needsUpdate = true;
    pin.visible = false;
    pin.scale.setScalar(0);
    pinT = 0;

    const duration = opts.durationMs;
    handle = tween({
      duration,
      ease: (x) => x, // shaped per-channel below, not globally
      onUpdate: (_e, raw) => {
        // Rotation leads; the descent overlaps it by design so the two read as
        // one motion rather than two moves in sequence.
        const rot = easeFlight(Math.min(1, raw / 0.62));
        const dolly = easeFlight(Math.max(0, (raw - 0.32) / 0.68));
        pose.spinY = lerpAngle(from.spinY, toSpin, rot);
        pose.tiltX = lerp(from.tiltX, toTilt, rot);
        pose.distance = lerp(from.distance, toDistance, dolly);
        pose.fov = lerp(from.fov, toFov, dolly);
        // The globe grows to full size and settles to centre as we descend, so
        // the destination ends up filling the frame rather than sitting in the
        // upper third where it lived at rest.
        pose.framing = lerp(from.framing, 1, dolly);
        pose.lift = lerp(from.lift, 0, dolly);
        // The bloom is the last third — it is the wipe into the destination.
        pose.arrival = easeSettle(Math.max(0, (raw - 0.66) / 0.34));
        if (raw > 0.55 && !pin.visible) pin.visible = true;
        applyPose();
      },
      onComplete: () => {
        phase = 'arrived';
        opts.onPhase?.('arrived', next.slug);
      },
    });
  };

  const returnToGlobe = () => {
    handle?.cancel();
    clearPatch();
    const from: Pose = { ...pose };
    phase = 'returning';
    opts.onPhase?.('returning', activeSlug);
    pin.visible = false;
    pinT = 0;

    handle = tween({
      duration: Math.round(opts.durationMs * 0.7),
      ease: (x) => x,
      onUpdate: (_e, raw) => {
        const e = easeFlight(raw);
        pose.distance = lerp(from.distance, IDLE_DISTANCE, e);
        pose.fov = lerp(from.fov, IDLE_FOV, e);
        pose.tiltX = lerp(from.tiltX, -0.16, e);
        pose.framing = lerp(from.framing, IDLE_SCALE, e);
        pose.lift = lerp(from.lift, IDLE_LIFT, e);
        pose.arrival = lerp(from.arrival, 0, Math.min(1, raw * 1.6));
        applyPose();
      },
      onComplete: () => {
        target = null;
        activeSlug = null;
        phase = 'idle';
        opts.onPhase?.('idle', null);
      },
    });
  };

  applyPose();

  return {
    flyTo,
    returnToGlobe,
    refresh: applyPose,
    setPins,
    get phase() {
      return phase;
    },
    get activeSlug() {
      return activeSlug;
    },
    dispose() {
      handle?.cancel();
      clearPatch();
      pinGeo.dispose();
      pinMat.dispose();
      patchMat.dispose();
      idlePinMat.dispose();
      if (idlePinsObj) idlePinsObj.geometry.dispose();
    },
  };
}
