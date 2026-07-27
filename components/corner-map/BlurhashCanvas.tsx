'use client';

// Blurhash placeholder (§5.3). Decoded at a deliberately tiny raster and
// scaled by CSS — a 32×32 decode is indistinguishable from 128×128 once it is
// blurred, and costs a fraction of the main-thread time on the cheap Android
// hardware most of this audience is on.

import { useEffect, useRef } from 'react';
import { decode } from 'blurhash';

const RASTER = 32;

export function BlurhashCanvas({ hash, className = '' }: { hash: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const pixels = decode(hash, RASTER, RASTER);
      const image = ctx.createImageData(RASTER, RASTER);
      image.data.set(pixels);
      ctx.putImageData(image, 0, 0);
    } catch {
      // A malformed hash must never take the card down with it — the solid
      // slab underneath is a perfectly good placeholder.
    }
  }, [hash]);

  return (
    <canvas
      ref={ref}
      width={RASTER}
      height={RASTER}
      aria-hidden="true"
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
