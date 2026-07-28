'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WIRE_DIAMETER, clipPolyline, clipSvgPath, polylineBounds } from './clipGeometry';

/**
 * ARC-01, rendered in full and rotatable.
 *
 * A tube swept along the wire centreline, in a polished steel material lit
 * entirely by a procedurally-drawn studio environment — no texture files, no
 * HDRIs, nothing to download. Drag to rotate; let go and it keeps its
 * momentum before easing back into a slow presentation turn.
 *
 * Falls back to a stroked SVG of the identical profile when WebGL is absent.
 */

const REST_X = -0.42;
const REST_Y = -0.62;
const TILT_Z = 0.2;
const AUTO_SPEED = 0.16; // rad/s once idle
const DAMPING = 2.6;

/** A studio in a canvas: gradient sky, dark floor, three soft boxes. */
function makeEnvironment(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.34, '#8e9198');
  sky.addColorStop(0.49, '#3a3c41');
  sky.addColorStop(0.52, '#151619');
  sky.addColorStop(1, '#050506');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, c.width, c.height);

  // Soft boxes. Radial gradients rather than a blur filter — same look,
  // no dependency on ctx.filter support.
  const box = (x: number, y: number, rx: number, ry: number, hex: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 1);
    g.addColorStop(0, `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`);
    g.addColorStop(0.55, `${hex}${Math.round(a * 0.42 * 255).toString(16).padStart(2, '0')}`);
    g.addColorStop(1, `${hex}00`);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  box(190, 120, 150, 210, '#ffffff', 1);
  box(660, 90, 230, 150, '#ffffff', 0.85);
  box(880, 200, 120, 260, '#e8d6b8', 0.45); // one warm source, for interest
  // A black card opposite, so the steel has something dark to reflect.
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(380, 40, 150, 210);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function PaperclipViewer({ onFirstDrag }: { onFirstDrag?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    if (!renderer.getContext()) {
      setFailed(true);
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.style.cursor = 'grab';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envSource = makeEnvironment();
    const envRT = pmrem.fromEquirectangular(envSource);
    scene.environment = envRT.texture;
    envSource.dispose();
    pmrem.dispose();

    // ---- the clip ----------------------------------------------------------
    const pts = clipPolyline();
    const bounds = polylineBounds(pts);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    // Normalise so the wire's half-length is exactly 1 unit; every camera
    // distance below is expressed in those units.
    const scale = 2 / bounds.width;

    const curve = new THREE.CatmullRomCurve3(
      pts.map(([x, y]) => new THREE.Vector3((x - cx) * scale, (y - cy) * scale, 0)),
      false,
      'centripetal',
      0.5,
    );
    const wireRadius = (WIRE_DIAMETER / 2) * scale;
    const geometry = new THREE.TubeGeometry(curve, 1100, wireRadius, 20, false);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xd7dade,
      metalness: 1,
      roughness: 0.13,
      envMapIntensity: 1.45,
      clearcoat: 0.4,
      clearcoatRoughness: 0.22,
    });

    const clip = new THREE.Group();
    clip.add(new THREE.Mesh(geometry, material));

    // Domed ends — the anglage of section 07, in geometry.
    const capGeo = new THREE.SphereGeometry(wireRadius, 20, 14);
    for (const t of [0, 1]) {
      const cap = new THREE.Mesh(capGeo, material);
      cap.position.copy(curve.getPoint(t));
      clip.add(cap);
    }

    const pivot = new THREE.Group();
    pivot.add(clip);
    pivot.rotation.z = TILT_Z;
    scene.add(pivot);

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-3, 4, 5);
    const rim = new THREE.DirectionalLight(0xf3e3c8, 1.4);
    rim.position.set(4, -2, -3);
    scene.add(key, rim);

    // ---- fit ---------------------------------------------------------------
    const fit = (w: number, h: number) => {
      const aspect = w / h;
      camera.aspect = aspect;
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      // Span the clip across a fixed share of the frame width, then back off
      // far enough that a tilted clip still clears the top and bottom.
      const span = aspect < 0.95 ? 0.96 : aspect < 1.5 ? 0.78 : 0.64;
      const byWidth = 1 / span / Math.tan(hHalf);
      const byHeight = 0.62 / Math.tan(vHalf);
      camera.position.set(0, 0, Math.max(byWidth, byHeight));
      camera.updateProjectionMatrix();
    };

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      fit(w, h);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // ---- interaction -------------------------------------------------------
    const rot = { x: REST_X, y: REST_Y };
    const vel = { x: 0, y: 0 };
    let dragging = false;
    let pointerId: number | null = null;
    let last = { x: 0, y: 0 };
    let start = { x: 0, y: 0 };
    let axisLocked = false;
    let idleFor = 0;
    let notified = false;

    const el = renderer.domElement;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerId = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
      start = { x: e.clientX, y: e.clientY };
      // Touch starts undecided: a mostly-vertical drag belongs to the page,
      // a mostly-horizontal one belongs to the clip.
      axisLocked = e.pointerType !== 'touch';
      dragging = axisLocked;
      if (dragging) {
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
      }
      vel.x = 0;
      vel.y = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;

      if (!axisLocked) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) < 8) return;
        axisLocked = true;
        if (Math.abs(dx) <= Math.abs(dy)) {
          pointerId = null; // hand it back to the page for scrolling
          return;
        }
        dragging = true;
        el.setPointerCapture(e.pointerId);
        last = { x: e.clientX, y: e.clientY };
      }
      if (!dragging) return;

      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };

      rot.y += dx * 0.0075;
      rot.x = THREE.MathUtils.clamp(rot.x + dy * 0.0062, -1.35, 1.35);
      vel.y = dx * 0.0075;
      vel.x = dy * 0.0062;
      idleFor = 0;

      if (!notified && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 14) {
        notified = true;
        onFirstDrag?.();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      if (dragging && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      dragging = false;
      pointerId = null;
      el.style.cursor = 'grab';
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);

    // ---- loop --------------------------------------------------------------
    let visible = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(host);

    let frame = 0;
    let prev = performance.now();

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      if (!visible) return;

      if (!dragging) {
        // Throw decays exponentially, then the presentation turn fades back
        // in — never a hard cut between the two.
        const decay = Math.exp(-DAMPING * dt);
        rot.y += vel.y * dt * 60;
        rot.x = THREE.MathUtils.clamp(rot.x + vel.x * dt * 60, -1.35, 1.35);
        vel.x *= decay;
        vel.y *= decay;

        idleFor += dt;
        if (!reduced) {
          const blend = Math.min(Math.max(idleFor - 0.4, 0) / 1.6, 1);
          rot.y += AUTO_SPEED * dt * blend;
          // The X axis drifts home so the clip always returns to its pose.
          rot.x += (REST_X - rot.x) * Math.min(dt * 0.6 * blend, 1);
        }
      }

      const scroll = reduced ? 0 : window.scrollY * 0.0007;
      pivot.rotation.y = rot.y + scroll;
      pivot.rotation.x = rot.x;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
      geometry.dispose();
      capGeo.dispose();
      material.dispose();
      envRT.dispose();
      renderer.dispose();
      el.remove();
    };
  }, [onFirstDrag]);

  if (failed) return <PaperclipFallback />;
  return <div ref={hostRef} className="arc-hero__canvas" aria-label="ARC-01, rotatable three-dimensional model" role="img" />;
}

/** No WebGL: the same profile, stroked flat. */
function PaperclipFallback() {
  const pts = clipPolyline();
  const b = polylineBounds(pts);
  const pad = WIRE_DIAMETER;
  return (
    <div className="arc-canvas-fallback">
      <svg
        viewBox={`${b.minX - pad} ${-b.maxY - pad} ${b.width + pad * 2} ${b.height + pad * 2}`}
        role="img"
        aria-label="ARC-01 paperclip profile"
      >
        <defs>
          <linearGradient id="arc-wire" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6d7076" />
            <stop offset="0.35" stopColor="#e4e7eb" />
            <stop offset="0.6" stopColor="#8d9198" />
            <stop offset="1" stopColor="#3d3f44" />
          </linearGradient>
        </defs>
        <path
          d={clipSvgPath(pts)}
          fill="none"
          stroke="url(#arc-wire)"
          strokeWidth={WIRE_DIAMETER}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
