import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = resolve(root, 'public/manifest.webmanifest');
const serviceWorkerPath = resolve(root, 'public/sw.js');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pngSize(path) {
  const bytes = readFileSync(path);
  const signature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`${path} is not a PNG file`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`manifest cannot be parsed: ${error instanceof Error ? error.message : String(error)}`);
}

if (manifest) {
  for (const key of ['id', 'name', 'short_name', 'start_url', 'scope', 'display']) {
    if (!manifest[key]) fail(`manifest is missing ${key}`);
  }

  if (manifest.display !== 'standalone') fail('manifest display must be standalone');
  if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
    fail('manifest needs at least two icons');
  } else {
    for (const icon of manifest.icons) {
      if (typeof icon.src !== 'string' || !icon.src.startsWith('/')) {
        fail('each manifest icon needs a root-relative src');
        continue;
      }

      const file = resolve(root, 'public', `.${icon.src}`);
      try {
        statSync(file);
        if (icon.type === 'image/png' && /^\d+x\d+$/.test(icon.sizes ?? '')) {
          const [width, height] = icon.sizes.split('x').map(Number);
          const actual = pngSize(file);
          if (actual.width !== width || actual.height !== height) {
            fail(`${icon.src} is ${actual.width}x${actual.height}, not ${icon.sizes}`);
          }
        }
      } catch (error) {
        fail(`icon ${icon.src} cannot be verified: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

let serviceWorker = '';
try {
  serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
} catch (error) {
  fail(`service worker cannot be read: ${error instanceof Error ? error.message : String(error)}`);
}

for (const required of ["request.method !== 'GET'", "url.pathname.startsWith('/api/')", "OFFLINE_CRITICAL"]) {
  if (!serviceWorker.includes(required)) fail(`service worker is missing its ${required} cache guard`);
}

const installStart = serviceWorker.indexOf("self.addEventListener('install'");
const installEnd = serviceWorker.indexOf("self.addEventListener('message'");
const installSection =
  installStart >= 0 && installEnd > installStart
    ? serviceWorker.slice(installStart, installEnd)
    : '';
if (installSection.includes('skipWaiting()')) {
  fail('service worker must not activate an update during install');
}

if (!serviceWorker.includes("event.data?.type === 'SKIP_WAITING'")) {
  fail('service worker must require an explicit SKIP_WAITING update message');
}

if (!process.exitCode) console.log('PWA checks passed: manifest, icons, and conservative service-worker guards are valid.');
