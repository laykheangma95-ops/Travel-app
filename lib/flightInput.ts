// Shared validation for flight-shaped query parameters.
//
// These values are interpolated into third-party URLs (AeroDataBox, the ADS-B
// networks). Validating the shape here keeps anything unexpected out of an
// outbound request path, and gives every route the same error message.

import { ApiError } from './http';

/** e.g. QH215, VN841, 5J904, TG560A. Letters, digits, optional suffix letter. */
const FLIGHT_NUMBER = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/;
const IATA_AIRPORT = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFlightNumber(raw: string | null): string {
  const value = (raw ?? '').replace(/\s+/g, '').toUpperCase();
  if (!FLIGHT_NUMBER.test(value)) {
    throw new ApiError('BAD_REQUEST', 'Enter a flight number like QH215 or VN841.');
  }
  return value;
}

export function parseAirportCode(raw: string | null): string {
  const value = (raw ?? '').trim().toUpperCase();
  if (!IATA_AIRPORT.test(value)) {
    throw new ApiError('BAD_REQUEST', 'Provide a 3-letter airport code, for example PNH.');
  }
  return value;
}

export function parseIsoDate(raw: string | null, fallback: string): string {
  const value = (raw ?? '').trim() || fallback;
  if (!ISO_DATE.test(value)) {
    throw new ApiError('BAD_REQUEST', 'Date must be in YYYY-MM-DD format.');
  }

  // Rejects 2026-13-45 — the regex only checks shape, not that it is a real day.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value)) {
    throw new ApiError('BAD_REQUEST', 'That date does not exist.');
  }

  return value;
}
