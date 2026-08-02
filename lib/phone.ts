// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { countriesByCode, DEFAULT_NSN, type Country } from '@/data/countries';

/** Strip everything that is not a digit. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Build an E.164 number (+<dial><nsn>) from a country and a locally typed
 * number. Users habitually type the national trunk prefix ("0" in most of the
 * world, "8" in RU/KZ) — strip it so +855 012 345 678 becomes +85512345678.
 */
export function toE164(countryCode: string, localNumber: string): string {
  const country = countriesByCode[countryCode];
  if (!country) return '';
  let nsn = digitsOnly(localNumber);
  const trunk = country.dial === '7' ? '8' : '0';
  if (nsn.startsWith(trunk)) nsn = nsn.slice(1);
  // Pasting a full international number should not double the calling code.
  if (nsn.startsWith(country.dial) && nsn.length > country.dial.length) {
    nsn = nsn.slice(country.dial.length);
  }
  return nsn ? `+${country.dial}${nsn}` : '';
}

export function nsnLength(country: Country): [number, number] {
  return country.nsn ?? DEFAULT_NSN;
}

/**
 * Length-based sanity check. This is deliberately loose — the authoritative
 * check is whether the OTP we send actually arrives. We only want to catch
 * obvious typos before spending money on an SMS.
 */
export function validatePhone(countryCode: string, localNumber: string): string | null {
  const country = countriesByCode[countryCode];
  if (!country) return 'Select a country code.';
  const e164 = toE164(countryCode, localNumber);
  if (!e164) return 'Enter your phone number.';
  const nsn = e164.slice(1 + country.dial.length);
  const [min, max] = nsnLength(country);
  if (nsn.length < min) return `That looks too short for ${country.name}.`;
  if (nsn.length > max) return `That looks too long for ${country.name}.`;
  return null;
}

/** Mask for display in support/settings: +855 •• ••• 678 */
export function maskPhone(e164: string): string {
  const digits = digitsOnly(e164);
  if (digits.length < 5) return e164;
  return `+${digits.slice(0, 3)} ••• ••• ${digits.slice(-3)}`;
}

/**
 * Best-effort home-country guess for the phone field default.
 *
 * Note the deliberate ordering: a saved passport country beats the browser
 * locale, and neither is derived from the user's current IP. A Cambodian
 * standing in Narita still carries a +855 number, so geo-locating the *device*
 * would pick the wrong dial code for exactly the travellers we serve.
 */
export function guessCountry(passportCountry?: string | null): string {
  if (passportCountry && countriesByCode[passportCountry]) return passportCountry;
  if (typeof navigator !== 'undefined') {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && countriesByCode[region]) return region;
  }
  return 'KH';
}
