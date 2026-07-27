// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD IMAGE PIPELINE — docs/corner-map-spec.md §7. Server-only.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ EXIF IS STRIPPED HERE, UNCONDITIONALLY.                                 │
// │                                                                         │
// │ There is no flag, no env var and no argument that disables it. A photo  │
// │ taken at a café carries the café's GPS in EXIF, and Corner Map's whole  │
// │ safety model is that location is venue-snapped — so the metadata cannot │
// │ be allowed to survive the trip to storage.                              │
// │                                                                         │
// │ If you are about to add a `keepMetadata` option: don't. Re-read §1 and  │
// │ §7 first. Every write to the shots bucket goes through this function.   │
// └─────────────────────────────────────────────────────────────────────────┘
//
// sharp re-encodes from decoded pixels and does not carry metadata forward
// unless explicitly asked with .withMetadata(). That call must never appear in
// this file — the re-encode *is* the strip.

import sharp from 'sharp';
import { encode as encodeBlurhash } from 'blurhash';

/** Long edge of the stored image. Plenty for a 390px-first feed at 3x. */
const MAX_EDGE = 1600;
const WEBP_QUALITY = 82;
const BLURHASH_RASTER = 32;

export interface ProcessedShot {
  webp: Buffer;
  width: number;
  height: number;
  blurhash: string;
  /** True when the image looks face-heavy and the shot should be held (§7). */
  shouldHold: boolean;
}

export class UnsupportedImageError extends Error {}

/**
 * Decode → strip → resize → WebP, plus a blurhash placeholder.
 *
 * HEIC note: sharp's prebuilt libvips ships without libheif, so a raw HEIC
 * buffer cannot be decoded here. The capture screen converts HEIC to WebP on
 * the client before upload; this function is still the unconditional strip,
 * because a client-side canvas re-encode is a convenience, never a guarantee.
 */
export async function processShot(input: Buffer): Promise<ProcessedShot> {
  let pipeline = sharp(input, { failOn: 'error' });

  let meta;
  try {
    meta = await pipeline.metadata();
  } catch {
    throw new UnsupportedImageError('Could not decode that image.');
  }

  // Belt and braces: without libheif, metadata() above already throws on HEIC.
  // This catches a build of libvips that *can* read it but that we still want
  // normalised to WebP on the way in. (Compared as a string — these formats
  // aren't in sharp's declared union precisely because they aren't compiled in.)
  if (['heif', 'heic'].includes(String(meta.format))) {
    throw new UnsupportedImageError('HEIC must be converted before upload.');
  }

  // .rotate() with no argument bakes in the EXIF orientation *before* the tag
  // is dropped — without it, stripping metadata silently turns every portrait
  // photo sideways.
  pipeline = pipeline.rotate();

  const webp = await pipeline
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    // No .withMetadata(). See the header block.
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const out = await sharp(webp).metadata();

  return {
    webp,
    width: out.width ?? 0,
    height: out.height ?? 0,
    blurhash: await blurhashOf(webp),
    shouldHold: await looksFaceHeavy(webp),
  };
}

async function blurhashOf(webp: Buffer): Promise<string> {
  const { data, info } = await sharp(webp)
    .raw()
    .ensureAlpha()
    .resize(BLURHASH_RASTER, BLURHASH_RASTER, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });

  return encodeBlurhash(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    4,
    4
  );
}

/**
 * §7: "run a face-count check on upload; ≥1 prominent face → status = 'held'".
 *
 * ⚠ NOT YET FUNCTIONAL. Real face detection needs either a bundled model
 * (onnxruntime + a detector, ~40 MB) or a vision API call, and neither was in
 * scope for this pass — adding one is a dependency decision, not a code one.
 *
 * The *plumbing* is complete and load-bearing: the upload route already routes
 * a `true` here to status='held' and surfaces the §7 prompt, and the 3-report
 * auto-hide trigger covers face-bearing shots that slip through in the
 * meantime. Wiring a detector is a change to this function's body alone.
 */
async function looksFaceHeavy(_webp: Buffer): Promise<boolean> {
  return false;
}

/**
 * Formats accepted by the upload route. HEIC is converted client-side first,
 * and AVIF is left out deliberately: sharp reports it as `heif`, so it would
 * be rejected downstream anyway — better to say no at the door than after the
 * user has waited for a 12 MB upload.
 */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * 4 MB, not the 12 MB a phone photo can reach.
 *
 * Vercel serverless functions reject request bodies over ~4.5 MB at the
 * platform edge, before any of this code runs — the caller would get an opaque
 * 413 with no message from us. The capture screen downscales to MAX_EDGE and
 * re-encodes to WebP before uploading, which puts a normal photo well under
 * this, so hitting the limit means something genuinely unusual.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
