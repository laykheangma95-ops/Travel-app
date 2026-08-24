// ─────────────────────────────────────────────────────────────────────────────
// Reading the caption behind a pasted social link.
//
// WHY THIS EXISTS:
//   A TikTok URL carries no place names. The names are in the caption, and the
//   caption is only reachable over the network. A browser cannot read it —
//   every one of these hosts refuses cross-origin reads — so the fetch has to
//   happen server-side.
//
// WHY IT IS WRITTEN SO DEFENSIVELY:
//   This takes a URL from a user and makes our server fetch it: the textbook
//   shape of an SSRF hole. The guard is the same one app/api/travel/maps-link
//   already uses and for the same reasons — an exact-match host allowlist,
//   checked BEFORE any socket is opened and re-checked at EVERY redirect hop,
//   because a shortener that we follow blindly is an open proxy into anything
//   our egress can reach. Read that file's header; this module is its sibling.
//
// WHAT IT READS:
//   oEmbed where the platform publishes one (TikTok, YouTube) — a documented,
//   public, no-key endpoint that exists precisely so links can be previewed.
//   Otherwise the OpenGraph tags in the page head, which are metadata a site
//   publishes for exactly this purpose. The response body is capped hard and
//   only <meta> tags are read out of it. This is a link preview, not a scraper:
//   nothing walks the page, follows internal links, or stores page content.
//
// WHAT IT DOES NOT DO:
//   Log in, defeat a block, or pretend to be a browser session. Instagram and
//   Facebook serve their captions to logged-in clients and generally refuse us.
//   That refusal is reported honestly (`blocked`) so the UI can ask the
//   traveler to paste the caption text instead — which always works, needs no
//   account of ours, and is the path the screenshots in the brief use anyway.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '@/lib/logger';
import { classifyLink, type LinkPlatform } from './socialLink';

/**
 * Every hostname this module will open a socket to. Exact matches, never
 * suffixes: `.endsWith('tiktok.com')` accepts `nottiktok.com` and
 * `tiktok.com.evil.tld`.
 */
const ALLOWED_HOSTS = new Set([
  // TikTok
  'www.tiktok.com',
  'tiktok.com',
  'm.tiktok.com',
  'vt.tiktok.com',
  'vm.tiktok.com',
  // Instagram
  'www.instagram.com',
  'instagram.com',
  'instagr.am',
  // Facebook
  'www.facebook.com',
  'facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'fb.watch',
  'fb.me',
  // YouTube
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

const MAX_REDIRECTS = 5;
const HOP_TIMEOUT_MS = 5_000;
const TOTAL_TIMEOUT_MS = 9_000;
/**
 * Read at most this much of a page. The OpenGraph tags are in <head>, inside
 * the first few kilobytes; a social page's full body is megabytes of script we
 * have no use for and no interest in holding in memory.
 */
const MAX_BODY_BYTES = 512 * 1024;

export interface LinkPreview {
  platform: LinkPlatform;
  /** The post's title, where the platform gives one distinct from the caption. */
  title: string | null;
  /** The caption / description. This is the part place names live in. */
  caption: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  /** Why there is no caption, when there is none. */
  outcome: 'ok' | 'blocked' | 'unsupported' | 'unreachable';
}

/**
 * The SSRF gate. Exported so it can be tested directly, without a network.
 *
 * Returns the parsed URL when it is safe to fetch, or null — which covers every
 * refusal: a non-URL, a non-https scheme, embedded credentials, a non-443 port,
 * and any hostname outside the allowlist.
 */
export function allowedPreviewUrl(candidate: string): URL | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url;
}

interface FetchedPage {
  finalUrl: URL;
  status: number;
  body: string;
  contentType: string;
}

/**
 * Fetch one allowlisted URL, following redirects by hand and re-validating each
 * hop. `redirect: 'manual'` is the entire point: letting fetch follow the chain
 * itself would surrender the check this function exists to perform.
 */
async function fetchAllowlisted(start: URL, deadline: number): Promise<FetchedPage> {
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('deadline');

    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(HOP_TIMEOUT_MS, remaining)),
      headers: {
        // Identifying ourselves honestly, the way a link-preview bot should.
        'User-Agent':
          'Mozilla/5.0 (compatible; DomnerTravelBot/1.0; +https://domner.com/help/esim)',
        Accept: 'application/json;q=0.9,text/html;q=0.8,*/*;q=0.1',
        'Accept-Language': 'en',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return finish(response, current);
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        throw new Error('bad-redirect');
      }
      const validated = allowedPreviewUrl(next);
      if (!validated) {
        // The most important log line in this file: a chain walking off the
        // allowlist is either a platform change or someone probing for SSRF.
        log.warn('link_preview.redirect_off_allowlist', { hop, host: safeHost(next) });
        throw new Error('off-allowlist');
      }
      current = validated;
      continue;
    }

    return finish(response, current);
  }

  throw new Error('too-many-redirects');
}

async function finish(response: Response, url: URL): Promise<FetchedPage> {
  return {
    finalUrl: url,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: await readCapped(response),
  };
}

/**
 * Read at most MAX_BODY_BYTES, then stop.
 *
 * `response.text()` on a page with no content-length is unbounded — one hostile
 * or merely enormous response would be enough to exhaust a serverless
 * function's memory. The stream is cancelled, not drained.
 */
async function readCapped(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let read = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (read >= MAX_BODY_BYTES) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text;
}

function safeHost(candidate: string): string {
  try {
    return new URL(candidate).hostname;
  } catch {
    return 'unparseable';
  }
}

/** The oEmbed endpoint for a platform, or null where there is no public one. */
function oembedEndpoint(platform: LinkPlatform, postUrl: string): URL | null {
  switch (platform) {
    case 'tiktok':
      return new URL(`https://www.tiktok.com/oembed?url=${encodeURIComponent(postUrl)}`);
    case 'youtube':
      return new URL(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(postUrl)}`
      );
    // Instagram's and Facebook's oEmbed have required a Meta app access token
    // since 2020. We do not hold one, and inventing an endpoint that might work
    // is exactly what rule 8 forbids. The OpenGraph path is tried instead.
    default:
      return null;
  }
}

/** Decode the handful of HTML entities that actually appear in og: content. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)))
    // Last, so an "&amp;quot;" cannot be double-decoded into a quote.
    .replace(/&amp;/g, '&');
}

function safeCodePoint(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/**
 * One OpenGraph/meta value out of a page head.
 *
 * A regex over HTML is the wrong tool for parsing a document and the right one
 * for pulling a single well-known tag out of the first few kilobytes of one. We
 * are not walking this DOM; adding an HTML parser to the bundle to read two
 * attributes would be the larger mistake.
 */
export function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*>`,
      'i'
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) continue;
    const content = /content\s*=\s*["']([\s\S]*?)["']/i.exec(tag)?.[1];
    if (content && content.trim()) return decodeEntities(content).trim();
  }
  return null;
}

/**
 * What a pasted social link says, as far as the platform will tell us.
 *
 * Never throws. Every failure — a block, a dead link, a platform without a
 * public endpoint — comes back as an `outcome` the UI can explain, because
 * "we could not read it" and "you are not signed in to Instagram" need
 * different sentences in front of the traveler.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  const classified = classifyLink(rawUrl);
  const platform: LinkPlatform = classified?.platform ?? 'web';
  const empty: LinkPreview = {
    platform,
    title: null,
    caption: null,
    author: null,
    thumbnailUrl: null,
    outcome: 'unsupported',
  };

  if (!classified) return empty;

  const target = allowedPreviewUrl(classified.canonicalUrl);
  if (!target) return empty;

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  // ── oEmbed first, where the platform publishes one. It is a documented API
  //    that returns the caption as JSON, so nothing needs to be read out of a
  //    page at all. ──────────────────────────────────────────────────────────
  const endpoint = oembedEndpoint(platform, target.toString());
  if (endpoint) {
    try {
      const page = await fetchAllowlisted(endpoint, deadline);
      if (page.status === 200 && page.contentType.includes('json')) {
        const data = JSON.parse(page.body) as Record<string, unknown>;
        const caption = asText(data.title);
        if (caption) {
          return {
            platform,
            title: caption,
            caption,
            author: asText(data.author_name),
            thumbnailUrl: asHttpsUrl(data.thumbnail_url),
            outcome: 'ok',
          };
        }
      }
      log.info('link_preview.oembed_empty', { platform, status: page.status });
    } catch (error) {
      log.info('link_preview.oembed_failed', { platform, reason: reasonOf(error) });
    }
  }

  // ── OpenGraph fallback. ────────────────────────────────────────────────────
  try {
    const page = await fetchAllowlisted(target, deadline);
    if (page.status >= 400) {
      // 401/403/429 from a social host means "sign in" or "slow down", not "no
      // such post". The traveler gets a different sentence for each.
      return { ...empty, outcome: page.status === 404 ? 'unreachable' : 'blocked' };
    }
    if (!page.contentType.includes('html')) return { ...empty, outcome: 'unsupported' };

    const description = metaContent(page.body, [
      'og:description',
      'twitter:description',
      'description',
    ]);
    const title = metaContent(page.body, ['og:title', 'twitter:title']);
    const thumbnail = metaContent(page.body, ['og:image', 'twitter:image']);

    if (!description && !title) {
      // A 200 with no og tags is the signature of a login wall rendered by
      // script — the page loaded, it just contains nothing for us.
      return { ...empty, outcome: 'blocked', thumbnailUrl: asHttpsUrl(thumbnail) };
    }

    return {
      platform,
      title,
      caption: description ?? title,
      author: metaContent(page.body, ['og:site_name', 'author']),
      thumbnailUrl: asHttpsUrl(thumbnail),
      outcome: 'ok',
    };
  } catch (error) {
    log.info('link_preview.page_failed', { platform, reason: reasonOf(error) });
    return { ...empty, outcome: 'unreachable' };
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 60) : 'unknown';
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 4_000) : null;
}

/**
 * A thumbnail we would put in an <img>. https only, and length-capped: this
 * string is handed to a browser, so a `javascript:` or a data URI the size of a
 * response body has no business reaching it.
 */
function asHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
