import { describe, expect, it } from 'vitest';
import {
  cornerName,
  detectCaptionLang,
  minutesSince,
  stampDateOnly,
  stampOf,
} from './format';

describe('stampOf — the timestamp burn', () => {
  it('renders the 90s point-and-shoot format', () => {
    // Constructed in local time, because that is what the stamp shows.
    expect(stampOf(new Date(2026, 6, 27, 19, 42))).toBe("'26 7 27 19:42");
  });

  it('pads the clock but not the date', () => {
    expect(stampOf(new Date(2026, 0, 5, 9, 4))).toBe("'26 1 5 09:04");
  });

  it('drops the time of day for archive shots', () => {
    expect(stampDateOnly(new Date(2026, 6, 27, 19, 42))).toBe("'26 7 27");
  });

  it('uses Latin numerals only — never Khmer (§8)', () => {
    // Khmer digits are U+17E0–17E9. If a locale-aware formatter ever creeps
    // into stampOf, this is what catches it: ១៩:៤២ would break the camera-
    // stamp read that the whole signature element depends on.
    const stamp = stampOf(new Date(2026, 6, 27, 19, 42));
    expect(stamp).not.toMatch(/[០-៩]/);
    expect(stamp).toMatch(/^'\d{2} \d{1,2} \d{1,2} \d{2}:\d{2}$/);
  });
});

describe('minutesSince', () => {
  const now = new Date('2026-07-27T19:42:00Z');

  it('floors to whole minutes', () => {
    expect(minutesSince(new Date(now.getTime() - 90_000), now)).toBe(1);
  });

  it('never goes negative on a fast client clock', () => {
    expect(minutesSince(new Date(now.getTime() + 600_000), now)).toBe(0);
  });
});

describe('cornerName — §8 bilingual ordering', () => {
  const both = { name_en: 'Central Market', name_km: 'ផ្សារធំថ្មី' };

  it('leads with Khmer under the km locale', () => {
    expect(cornerName(both, 'km')).toEqual({
      primary: 'ផ្សារធំថ្មី',
      secondary: 'Central Market',
      primaryLang: 'km',
      secondaryLang: 'en',
    });
  });

  it('reverses under the en locale', () => {
    expect(cornerName(both, 'en')).toEqual({
      primary: 'Central Market',
      secondary: 'ផ្សារធំថ្មី',
      primaryLang: 'en',
      secondaryLang: 'km',
    });
  });

  it('tags the Khmer half as km in both directions', () => {
    // Without this the secondary line inherits the Latin face, which has no
    // Khmer glyphs, and the clusters render decomposed.
    expect(cornerName(both, 'en').secondaryLang).toBe('km');
    expect(cornerName(both, 'km').primaryLang).toBe('km');
  });

  it('does not render an empty secondary line when only one name exists', () => {
    const enOnly = { name_en: 'Otres Beach', name_km: null };
    expect(cornerName(enOnly, 'km').secondary).toBeNull();
    expect(cornerName(enOnly, 'en').secondary).toBeNull();
  });

  it('falls back to Khmer under en when there is no English name', () => {
    const kmOnly = { name_en: '', name_km: 'វត្តភ្នំ' };
    const out = cornerName(kmOnly, 'en');
    expect(out.primary).toBe('វត្តភ្នំ');
    expect(out.primaryLang).toBe('km');
  });

  it('treats a whitespace-only Khmer name as absent', () => {
    expect(cornerName({ name_en: 'Bayon', name_km: '   ' }, 'km').primary).toBe('Bayon');
  });
});

describe('detectCaptionLang', () => {
  it('reads Khmer script as km', () => {
    expect(detectCaptionLang('កាហ្វេឆ្ងាញ់')).toBe('km');
  });

  it('reads Latin as en', () => {
    expect(detectCaptionLang('good coffee')).toBe('en');
  });

  it('reads a mixed caption as km — a Khmer speaker does', () => {
    expect(detectCaptionLang('best កាហ្វេ in town')).toBe('km');
  });
});
