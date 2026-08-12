// The subsolar point — where the sun is directly overhead, right now.
//
// This is what turns the globe from decoration into an instrument. It is about
// twenty lines of arithmetic, costs nothing to ship, and it is *true*: the lit
// hemisphere on screen is the half of the world where it is currently daytime.
// A visitor greeted with "good evening" can see Tokyo already in daylight.
//
// Accuracy: declination from the standard cosine approximation and solar noon
// from UTC, ignoring the equation of time. That is within a degree or so of
// declination and about four degrees of longitude at worst — a couple of pixels
// on the terminator, and nothing a traveller could be misled by.

import { latLonToXYZ } from './globeEngine';

export interface Subsolar {
  /** Degrees, −23.44 … +23.44. */
  latitude: number;
  /** Degrees east. */
  longitude: number;
}

export function subsolarPoint(now: Date = new Date()): Subsolar {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear) / 86_400_000);

  // Axial tilt projected onto the year, measured from the December solstice.
  const latitude = -23.44 * Math.cos(((2 * Math.PI) / 365.24) * (dayOfYear + 10));

  // Solar noon sits on the meridian opposite the current UTC hour angle.
  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  let longitude = 15 * (12 - utcHours);
  if (longitude > 180) longitude -= 360;
  if (longitude < -180) longitude += 360;

  return { latitude, longitude };
}

/**
 * The sun direction in the globe's own (pre-rotation) coordinate space.
 *
 * Deliberately in local space: the caller transforms it by the spin group's
 * world matrix each frame, which keeps the lit hemisphere pinned to the correct
 * real geography while the globe turns underneath it — exactly how a physical
 * globe behaves under a fixed lamp. Fixing the sun in world space instead would
 * look similar and be a lie.
 */
export function sunDirectionLocal(now?: Date): [number, number, number] {
  const { latitude, longitude } = subsolarPoint(now);
  return latLonToXYZ(latitude, longitude);
}
