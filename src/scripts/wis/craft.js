// Geocentric positions of spacecraft observatories, interpolated from the samples exported from
// wis (tools/export_wis_data.py) with four-point Lagrange interpolation.
import { julian } from './earth.js';

/** Position (km, equatorial J2000) of spacecraft c at JavaScript time ms, or null outside its data. */
export function craftJ2000(c, ms) {
  const x = (julian(ms).jdTt - c.jd0) / c.step;     // TT and TDB differ by < 2 ms
  if (x < 0 || x > c.n - 1) return null;
  const i = Math.min(Math.max(Math.floor(x) - 1, 0), c.n - 4), u = x - i;
  const w = [-(u - 1) * (u - 2) * (u - 3) / 6, u * (u - 2) * (u - 3) / 2, -u * (u - 1) * (u - 3) / 2, u * (u - 1) * (u - 2) / 6];
  return [0, 1, 2].map((k) => w.reduce((s, wj, j) => s + wj * c.xyz[3 * (i + j) + k], 0));
}

/** First and last times covered (ms, UTC to within a minute). */
export function craftRange(c) {
  const toMs = (jd) => (jd - 2440587.5) * 86400000 - 69184;   // TT - UTC = 69.184 s since 2017
  return [toMs(c.jd0), toMs(c.jd0 + (c.n - 1) * c.step)];
}
