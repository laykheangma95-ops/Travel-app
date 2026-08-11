// ─────────────────────────────────────────────────────────────────────────────
// A real PNG at /mock-qr/{iccid}.png.
//
// Not a real QR code — it will not scan — but a genuine, correctly encoded PNG
// with the right dimensions, so the delivery email and the PDF generator have
// actual bytes to fetch, resize and embed. A 404 or a text placeholder here
// would let a whole class of image-pipeline bug through undetected.
//
// Deliberately unauthenticated: the customer's mail client fetches this URL,
// and it has none of our headers.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { Router } from 'express';

export const qrRouter: Router = Router();

const MODULES = 29; // QR-ish grid size
const SCALE = 8; // → 232px square
const QUIET = 4 * SCALE;

qrRouter.get('/mock-qr/:file', (req, res) => {
  const file = req.params.file ?? '';
  const iccid = file.replace(/\.png$/i, '');
  const png = renderPlaceholder(iccid);

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(png);
});

/** Deterministic per ICCID, so the same eSIM always gets the same image. */
function renderPlaceholder(iccid: string): Buffer {
  const digest = createHash('sha256').update(iccid).digest();
  const size = MODULES * SCALE + QUIET * 2;

  // One byte per pixel, greyscale, plus a filter byte per row.
  const raw = Buffer.alloc((size + 1) * size, 0xff);
  for (let y = 0; y < size; y += 1) raw[y * (size + 1)] = 0; // filter: none

  const dark = (mx: number, my: number): boolean => {
    // Three finder patterns, so it reads as a QR at a glance.
    if (isFinder(mx, my) || isFinder(MODULES - 1 - mx, my) || isFinder(mx, MODULES - 1 - my)) {
      return finderModule(
        isFinder(mx, my) ? mx : MODULES - 1 - mx,
        isFinder(mx, my) || isFinder(MODULES - 1 - mx, my) ? my : MODULES - 1 - my
      );
    }
    const bit = (my * MODULES + mx) % (digest.length * 8);
    return ((digest[Math.floor(bit / 8)]! >> bit % 8) & 1) === 1;
  };

  for (let my = 0; my < MODULES; my += 1) {
    for (let mx = 0; mx < MODULES; mx += 1) {
      if (!dark(mx, my)) continue;
      for (let dy = 0; dy < SCALE; dy += 1) {
        const y = QUIET + my * SCALE + dy;
        const rowStart = y * (size + 1) + 1;
        raw.fill(0x00, rowStart + QUIET + mx * SCALE, rowStart + QUIET + mx * SCALE + SCALE);
      }
    }
  }

  return encodeGreyscalePng(raw, size);
}

function isFinder(mx: number, my: number): boolean {
  return mx < 7 && my < 7;
}

function finderModule(mx: number, my: number): boolean {
  const ring = Math.max(Math.abs(mx - 3), Math.abs(my - 3));
  return ring === 3 || ring <= 1;
}

// ── Minimal PNG encoder (greyscale, 8-bit) ───────────────────────────────────

function encodeGreyscalePng(raw: Buffer, size: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
