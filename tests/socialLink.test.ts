// What a pasted link IS, before anything goes near the network.
//
// Every case here is a real share shape — the strings these apps actually put
// on a clipboard — because the bug this feature replaces was precisely a
// classifier that only accepted the tidy form nobody pastes.

import { describe, expect, it } from 'vitest';
import {
  classifyLink,
  firstUrlIn,
  textWithoutUrls,
  urlsIn,
} from '@/lib/travel/socialLink';

describe('classifyLink', () => {
  it('reads an Instagram reel, and strips the share token', () => {
    // The exact shape from the brief's screenshot, igsi and all. That token
    // identifies the account that copied the link; it has no business being
    // kept, logged, or sent to a preview endpoint.
    const result = classifyLink(
      'https://www.instagram.com/reel/DbrzTE_NvmD/?igsi=NmZuazVsb2Nia21n'
    );
    expect(result?.platform).toBe('instagram');
    expect(result?.postId).toBe('DbrzTE_NvmD');
    expect(result?.canonicalUrl).toBe('https://www.instagram.com/reel/DbrzTE_NvmD/');
    expect(result?.isShortLink).toBe(false);
  });

  it('reads the three Instagram post shapes', () => {
    expect(classifyLink('https://instagram.com/p/Cabc123/')?.postId).toBe('Cabc123');
    expect(classifyLink('https://www.instagram.com/tv/Cxyz789/')?.postId).toBe('Cxyz789');
    expect(classifyLink('https://www.instagram.com/reels/Cq_1-x/')?.postId).toBe('Cq_1-x');
  });

  it('reads a TikTok video and its short link', () => {
    const long = classifyLink('https://www.tiktok.com/@user/video/7312345678901234567');
    expect(long?.platform).toBe('tiktok');
    expect(long?.postId).toBe('7312345678901234567');
    expect(long?.isShortLink).toBe(false);

    const short = classifyLink('https://vt.tiktok.com/ZSdabc123/');
    expect(short?.platform).toBe('tiktok');
    // A short link's path is an opaque code — the real post id is only knowable
    // after the redirect, so the flag says so rather than the code being passed
    // off as an id.
    expect(short?.isShortLink).toBe(true);
  });

  it('strips TikTok tracking parameters', () => {
    const result = classifyLink(
      'https://www.tiktok.com/@u/video/7312345678901234567?is_from_webapp=1&sender_device=pc&_t=8abc&_r=1'
    );
    expect(result?.canonicalUrl).toBe('https://www.tiktok.com/@u/video/7312345678901234567');
  });

  it('reads Facebook reels, watch links and share links', () => {
    expect(classifyLink('https://www.facebook.com/reel/1234567890')?.platform).toBe('facebook');
    expect(classifyLink('https://fb.watch/aBcD1234/')?.isShortLink).toBe(true);
    expect(classifyLink('https://www.facebook.com/share/r/aBcD1234/')?.postId).toBe('aBcD1234');
    expect(
      classifyLink('https://www.facebook.com/photo?fbid=999&story_fbid=12345')?.postId
    ).toBe('12345');
  });

  it('reads YouTube in all three shapes', () => {
    expect(classifyLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.postId).toBe('dQw4w9WgXcQ');
    expect(classifyLink('https://youtu.be/dQw4w9WgXcQ?si=abc')?.postId).toBe('dQw4w9WgXcQ');
    expect(classifyLink('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.postId).toBe('dQw4w9WgXcQ');
  });

  it('recognises every Google Maps share host, including the two that used to be rejected', () => {
    for (const url of [
      'https://maps.app.goo.gl/abc123',
      'https://goo.gl/maps/abc123',
      'https://g.co/kgs/aBcD12',
      'https://www.google.com/maps/place/Wat+Pho/@13.7465,100.4927,17z',
    ]) {
      expect(classifyLink(url)?.platform).toBe('google-maps');
    }
  });

  it('calls an unrecognised site a web page rather than refusing it', () => {
    expect(classifyLink('https://example.com/blog/tokyo')?.platform).toBe('web');
  });

  it('returns null for anything that is not an http(s) URL, and never throws', () => {
    expect(classifyLink('just some caption text')).toBeNull();
    expect(classifyLink('javascript:alert(1)')).toBeNull();
    expect(classifyLink('ftp://example.com/file')).toBeNull();
    expect(classifyLink('')).toBeNull();
    expect(classifyLink(undefined as unknown as string)).toBeNull();
    expect(classifyLink(42 as unknown as string)).toBeNull();
  });
});

describe('urlsIn', () => {
  it('finds the link inside a share blob', () => {
    // What Google Maps and TikTok both actually put on the clipboard: the name
    // and the link as one text blob. Rejecting this was the original bug.
    expect(
      firstUrlIn('Wat Pho\nhttps://maps.app.goo.gl/abc123')
    ).toBe('https://maps.app.goo.gl/abc123');
  });

  it('trims trailing sentence punctuation off a link', () => {
    expect(firstUrlIn('go here https://example.com/a.')).toBe('https://example.com/a');
    expect(firstUrlIn('(see https://example.com/b)')).toBe('https://example.com/b');
  });

  it('returns every link, in order', () => {
    expect(urlsIn('a https://one.com b https://two.com')).toEqual([
      'https://one.com',
      'https://two.com',
    ]);
  });

  it('returns an empty list rather than throwing on junk', () => {
    expect(urlsIn('no links here')).toEqual([]);
    expect(urlsIn(null as unknown as string)).toEqual([]);
  });
});

describe('textWithoutUrls', () => {
  it('leaves the caption behind when the links are taken out', () => {
    expect(
      textWithoutUrls('📍 Wat Pho is beautiful https://instagram.com/p/abc/ go early')
    ).toBe('📍 Wat Pho is beautiful go early');
  });

  it('is empty for a bare link, which is what tells the caller there is no caption', () => {
    expect(textWithoutUrls('https://vt.tiktok.com/ZSdabc/')).toBe('');
  });
});
