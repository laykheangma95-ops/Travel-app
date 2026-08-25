// ─────────────────────────────────────────────────────────────────────────────
// Reading what a pasted link IS, before anything goes near the network.
//
// A traveler saves a place by seeing it somewhere — a TikTok of a night market,
// an Instagram reel of a cafe, a friend's Google Maps pin. All of those arrive
// as a URL on a clipboard, and every one of them is a different shape. This
// module is the single place that decides which is which.
//
// STRUCTURE ONLY — deliberately, exactly like lib/travel/mapsLink.ts.
//   Nothing here fetches, and nothing here can be made to fetch. Classifying a
//   link is a pure string operation, so it is instant, testable without a
//   network, and impossible to turn into an SSRF hole by accident. The fetching
//   half lives in lib/travel/linkPreview.ts behind its own host allowlist.
//
// Client-safe: no imports, no secrets, no server-only dependencies. The paste
// box uses it to label the link the moment it lands, before a request is sent.
// ─────────────────────────────────────────────────────────────────────────────

/** Where a pasted link came from. `web` is a real URL we do not recognise. */
export type LinkPlatform =
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'youtube'
  | 'xiaohongshu'
  | 'google-maps'
  | 'web';

export interface ClassifiedLink {
  platform: LinkPlatform;
  /**
   * The link with tracking noise removed — the form worth logging, showing back
   * to the traveler, and handing to an oEmbed endpoint.
   */
  canonicalUrl: string;
  /**
   * The post/reel/video id where the URL carries one. Null for a profile page,
   * a short link that has not been resolved yet, or a shape we do not parse.
   */
  postId: string | null;
  /**
   * True when the URL is a redirector whose real destination is only knowable
   * by following it (vt.tiktok.com, maps.app.goo.gl, fb.watch). The caller may
   * still need a network hop; the classification is a hint, not a promise.
   */
  isShortLink: boolean;
}

/**
 * Query parameters that carry no meaning and plenty of identity.
 *
 * `igsh`/`igsid` is what Instagram's own share sheet appends — it is a share
 * token tied to the account that copied it, and it is in the screenshot in
 * every bug report. Stripping it is a privacy improvement, not just tidiness.
 */
const TRACKING_PARAMS = new Set([
  // All three spellings Instagram has used. `igsi` is the one in the bug
  // report's screenshot; leaving it out kept a share token in every canonical
  // URL we logged and every preview request we sent.
  'igsh',
  'igsi',
  'igshid',
  'img_index',
  'si',
  'fbclid',
  'gclid',
  'mibextid',
  'rdid',
  'share_url',
  'sfnsn',
  '_t',
  '_r',
  '_d',
  'is_from_webapp',
  'sender_device',
  'sender_web_id',
  'web_id',
  'refer',
  'referer',
  'feature',
  'app',
  'pp',
]);

/** Hosts per platform. Exact matches only — see the note in mapsLink's route. */
const HOSTS: { platform: LinkPlatform; hosts: string[]; short?: string[] }[] = [
  {
    platform: 'instagram',
    hosts: ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
    short: ['instagr.am'],
  },
  {
    platform: 'tiktok',
    hosts: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
    short: ['vt.tiktok.com', 'vm.tiktok.com'],
  },
  {
    platform: 'facebook',
    hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'],
    short: ['fb.watch', 'fb.me'],
  },
  {
    platform: 'youtube',
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
    short: ['youtu.be'],
  },
  {
    // Xiaohongshu / RED. Domner's travelers plan China trips on it, and a link
    // we cannot name is a link we cannot record honestly — it would be filed as
    // generic `web` and lose the one fact worth knowing about it.
    //
    // CLASSIFYING A HOST IS NOT TRUSTING IT. Nothing in this file opens a
    // socket, and these hosts are deliberately NOT added to the fetch
    // allowlists in lib/travel/linkPreview.ts or lib/travel/mapsResolve.ts.
    // RED publishes no oEmbed endpoint and we do not scrape, so a RED link is
    // recognised, recorded, and never requested. The day a connector exists is
    // the day that allowlist decision gets made, on its own merits.
    platform: 'xiaohongshu',
    hosts: ['xiaohongshu.com', 'www.xiaohongshu.com'],
    short: ['xhslink.com'],
  },
  {
    platform: 'google-maps',
    hosts: ['google.com', 'www.google.com', 'maps.google.com'],
    // Every shape Google's own Share button produces. `g.co/kgs/…` is what the
    // search result card copies and it was the single most common "the Maps
    // link does not work" report: it is a Google short link that had never been
    // on the allowlist.
    short: ['maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.google.cn'],
  },
];

/** Strip tracking params and the fragment; keep everything that identifies the post. */
function canonicalise(url: URL): string {
  const clean = new URL(url.toString());
  clean.hash = '';
  for (const key of [...clean.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      clean.searchParams.delete(key);
    }
  }
  // A trailing "?" left behind by deleting the only parameter is noise.
  const text = clean.toString();
  return text.endsWith('?') ? text.slice(0, -1) : text;
}

/** `/reel/{id}`, `/p/{id}`, `/tv/{id}` — Instagram's three post shapes. */
function instagramPostId(pathname: string): string | null {
  const match = /\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(pathname);
  return match ? match[1] : null;
}

/** `/@author/video/{id}`, `/video/{id}`, `/t/{code}`. */
function tiktokPostId(pathname: string): string | null {
  const match = /\/(?:video|photo)\/(\d+)/.exec(pathname) ?? /\/t\/([A-Za-z0-9]+)/.exec(pathname);
  return match ? match[1] : null;
}

/** `watch?v={id}`, `/shorts/{id}`, `youtu.be/{id}`. */
function youtubeVideoId(url: URL): string | null {
  const v = url.searchParams.get('v');
  if (v && /^[A-Za-z0-9_-]{6,20}$/.test(v)) return v;
  const match = /\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,20})/.exec(url.pathname);
  if (match) return match[1];
  if (url.hostname.toLowerCase() === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '').split('/')[0];
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  }
  return null;
}

/** `/reel/{id}`, `/videos/{id}`, `/posts/{id}`, `story_fbid={id}`. */
function facebookPostId(url: URL): string | null {
  const match =
    /\/(?:reel|videos|posts|watch)\/(\d+)/.exec(url.pathname) ??
    /\/(?:reel|share\/r|share\/v|share\/p)\/([A-Za-z0-9_-]+)/.exec(url.pathname);
  if (match) return match[1];
  const storyId = url.searchParams.get('story_fbid') ?? url.searchParams.get('v');
  return storyId && /^[A-Za-z0-9_-]+$/.test(storyId) ? storyId : null;
}

/**
 * What a pasted string is, or null when it is not an http(s) URL at all.
 *
 * Null is an ordinary answer, not an error: a traveler who pasted a caption
 * rather than a link still has something we can read, and the caller falls
 * through to the text path. This function never throws, for any input,
 * including non-strings from untyped callers.
 */
export function classifyLink(candidate: string): ClassifiedLink | null {
  if (typeof candidate !== 'string' || candidate.trim() === '') return null;

  let url: URL;
  try {
    url = new URL(candidate.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  const canonicalUrl = canonicalise(url);

  for (const entry of HOSTS) {
    if (entry.hosts.includes(host)) {
      return {
        platform: entry.platform,
        canonicalUrl,
        postId: postIdFor(entry.platform, url),
        isShortLink: false,
      };
    }
    if (entry.short?.includes(host)) {
      return {
        platform: entry.platform,
        canonicalUrl,
        postId: postIdFor(entry.platform, url),
        // A short link's path is an opaque code, so even when postIdFor found
        // something it is not the real post id until the redirect is followed.
        isShortLink: true,
      };
    }
  }

  return { platform: 'web', canonicalUrl, postId: null, isShortLink: false };
}

function postIdFor(platform: LinkPlatform, url: URL): string | null {
  switch (platform) {
    case 'instagram':
      return instagramPostId(url.pathname);
    case 'tiktok':
      return tiktokPostId(url.pathname);
    case 'youtube':
      return youtubeVideoId(url);
    case 'facebook':
      return facebookPostId(url);
    default:
      return null;
  }
}

/** Human label for a platform, bilingual. `km` mirrors `en`, never a subset. */
export const PLATFORM_LABEL: Record<LinkPlatform, { en: string; km: string }> = {
  instagram: { en: 'Instagram', km: 'Instagram' },
  tiktok: { en: 'TikTok', km: 'TikTok' },
  facebook: { en: 'Facebook', km: 'Facebook' },
  youtube: { en: 'YouTube', km: 'YouTube' },
  xiaohongshu: { en: 'Xiaohongshu', km: 'Xiaohongshu' },
  'google-maps': { en: 'Google Maps', km: 'Google Maps' },
  web: { en: 'Web page', km: 'គេហទំព័រ' },
};

/**
 * Every http(s) link inside a blob of shared text, in order.
 *
 * A share sheet hands an item over as a `url`, as `text`, or as both, and every
 * one of these apps shares the caption and the link together as one blob. A
 * paste box that only accepted a bare URL rejected the most common paste there
 * is — which is exactly the "I pasted the link and nothing happened" report.
 *
 * The trailing-punctuation trim matters: "…see https://a.b/c." must not yield a
 * URL ending in a full stop.
 */
export function urlsIn(text: string): string[] {
  if (typeof text !== 'string') return [];
  const found = text.match(/https?:\/\/[^\s<>"'　]+/g) ?? [];
  return found.map((raw) => raw.replace(/[.,;:!?)\]}»"']+$/, '')).filter(Boolean);
}

/** The first http(s) link inside a blob of shared text, or null. */
export function firstUrlIn(text: string): string | null {
  return urlsIn(text)[0] ?? null;
}

/**
 * The caption with its links taken out.
 *
 * What remains is the part worth reading for place names. Returning it
 * separately means the extractor never has to treat a URL as a sentence.
 */
export function textWithoutUrls(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/https?:\/\/[^\s<>"'　]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
